const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const crypto = require("crypto");

const app = express();

// ------------------------------------------------------------
// MIDDLEWARE (ORDER IS IMPORTANT)
// ------------------------------------------------------------
app.use(express.json());

// ✅ FIXED CORS (IMPORTANT FOR RENDER)
app.use(cors({
  origin: "*", // allow all frontends (safe for hackathon/demo)
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ HANDLE PREFLIGHT REQUESTS
app.options("*", cors());

// ------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage() });

let invoices = [];        // stores all processed invoices
let storedDocs = [];      // stores content for plagiarism checking

// ------------------------------------------------------------
// ROOT HEALTH CHECK
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🚀 DocumentAI Backend is running successfully");
});

// ------------------------------------------------------------
// OCR ENDPOINT
// ------------------------------------------------------------
app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    const result = await Tesseract.recognize(buffer, "eng");
    res.json({ text: result.data.text });
  } catch (err) {
    res.status(500).json({ error: "OCR failed" });
  }
});

// ------------------------------------------------------------
// AI MODULES
// ------------------------------------------------------------

// PII DETECTION
function detectPII(text) {
  let detected = [];
  if (/\b\d{4}\s\d{4}\s\d{4}\b/.test(text)) detected.push("AADHAAR");
  if (/[A-Z]{5}[0-9]{4}[A-Z]/.test(text)) detected.push("PAN");
  if (/\b[6-9]\d{9}\b/.test(text)) detected.push("PHONE");
  if (/\S+@\S+\.\S+/.test(text)) detected.push("EMAIL");
  return detected;
}

// REDACTION
function redactPII(text) {
  return text
    .replace(/\b\d{4}\s\d{4}\s\d{4}\b/g, "**** **** ****")
    .replace(/[A-Z]{5}[0-9]{4}[A-Z]/g, "XXXXX0000X")
    .replace(/\b[6-9]\d{9}\b/g, "**********")
    .replace(/\S+@\S+\.\S+/g, "hidden@email.com");
}

// TONE ANALYSIS
function toneScore(desc) {
  let score = 0;
  ["urgent", "immediately", "asap", "kindly approve", "please approve"]
    .forEach(w => {
      if (desc.toLowerCase().includes(w)) score += 15;
    });
  return score;
}

// FISHINESS DETECTION
function fishiness(desc) {
  let score = 0;
  const text = desc.toLowerCase();
  [
    { word: "urgent", points: 20 },
    { word: "immediately", points: 20 },
    { word: "asap", points: 20 },
    { word: "kindly approve", points: 10 },
    { word: "adjustment", points: 25 },
    { word: "misc", points: 20 },
    { word: "reimburse", points: 15 },
    { word: "fee", points: 20 },
    { word: "round off", points: 20 }
  ].forEach(rule => {
    if (text.includes(rule.word)) score += rule.points;
  });
  return Math.min(100, score);
}

// TRANSPARENCY INDEX
function transparency(desc) {
  let score = 70;
  if (desc.length < 30) score -= 20;
  if (/misc|fee|adjust|round/i.test(desc)) score -= 20;
  return Math.max(0, score);
}

// CLARITY SCORE
function clarity(desc) {
  return Math.min(100, desc.split(" ").length * 3);
}

// HEATMAP
function heatmap(desc) {
  const words = ["urgent", "immediately", "fee", "misc", "adjustment", "reimburse"];
  return words.filter(w => desc.toLowerCase().includes(w));
}

// JACCARD SIMILARITY
function jaccard(a, b) {
  const set1 = new Set(a.split(" "));
  const set2 = new Set(b.split(" "));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

// VENDOR PATTERN
function vendorPattern(name) {
  const list = invoices.filter(x => x.vendorName === name);
  if (list.length < 3) return "New Vendor (No risk pattern yet)";
  const avg = list.reduce((sum, x) => sum + x.amount, 0) / list.length;
  return avg > 50000 ? "Unpredictable Vendor" : "Stable Vendor Pattern";
}

// BLOCKCHAIN HASH
function computeHash(obj) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(obj))
    .digest("hex");
}

// DOCUMENT REPUTATION SCORE
function reputationScore(inv) {
  let base = 100;
  base -= inv.anomalyScore * 0.8;
  base -= inv.piiExposure * 0.9;
  base -= inv.plagiarismScore * 0.7;
  base -= inv.toneScore * 0.6;
  base -= inv.fishinessScore * 0.7;
  base += inv.transparencyIndex * 0.1;
  base += inv.clarityScore * 0.1;
  return Math.max(0, Math.min(100, Math.round(base)));
}

// STORYLINE
function storyline(inv) {
  let lines = [];
  if (inv.toneScore > 0) lines.push("Urgent tone increases fraud probability.");
  if (inv.pii.length > 0) lines.push("Sensitive personal information detected.");
  if (inv.fishinessScore > 20) lines.push("Suspicious wording detected.");
  if (inv.plagiarismScore > 20) lines.push("Possible repeated invoice text.");
  return lines.join(" ");
}

// ------------------------------------------------------------
// PROCESS INVOICE
// ------------------------------------------------------------
app.post("/process-invoice", (req, res) => {
  const { invoiceNumber, vendorName, amount, description } = req.body;

  storedDocs.push(description);

  const tone = toneScore(description);
  const fish = fishiness(description);
  const trans = transparency(description);
  const clear = clarity(description);
  const heat = heatmap(description);
  const pii = detectPII(description);
  const redacted = redactPII(description);

  let similarity = 0;
  storedDocs.slice(0, -1).forEach(doc => {
    similarity = Math.max(similarity, jaccard(description, doc));
  });

  const inv = {
    invoiceNumber,
    vendorName,
    amount,
    description,
    anomalyScore: amount > 1000000 ? 35 : 0,
    toneScore: tone,
    fishinessScore: fish,
    transparencyIndex: trans,
    clarityScore: clear,
    plagiarismScore: Math.round(similarity * 100),
    pii,
    piiExposure: pii.length * 25,
    heatmap: heat,
    redacted,
    vendorPattern: vendorPattern(vendorName)
  };

  inv.prevHash = invoices.length === 0 ? "GEN" : invoices[invoices.length - 1].recordHash;
  inv.recordHash = computeHash(inv);
  inv.DRS = reputationScore(inv);
  inv.storyline = storyline(inv);

  invoices.push(inv);
  res.json(inv);
});

// ------------------------------------------------------------
// GET ALL INVOICES
// ------------------------------------------------------------
app.get("/invoices", (req, res) => {
  res.json(invoices);
});

// ------------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});













