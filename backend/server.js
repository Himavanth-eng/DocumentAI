const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

let invoices = [];        // stores all processed invoices
let storedDocs = [];      // stores content for plagiarism checking

//------------------------------------------------------------
// OCR ENDPOINT
//------------------------------------------------------------
app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    const buffer = req.file.buffer;

    const result = await Tesseract.recognize(buffer, "eng");
    res.json({ text: result.data.text });

  } catch (err) {
    res.json({ error: "OCR failed" });
  }
});

//------------------------------------------------------------
// AI MODULES
//------------------------------------------------------------

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
  const words = ["urgent", "immediately", "asap", "kindly approve", "please approve"];
  words.forEach(w => { if (desc.toLowerCase().includes(w)) score += 15; });
  return score;
}

// FISHINESS DETECTION (FINAL STRONG VERSION)
function fishiness(desc) {
  let score = 0;
  const text = desc.toLowerCase();

  const suspiciousPatterns = [
    { word: "urgent", points: 20 },
    { word: "immediately", points: 20 },
    { word: "asap", points: 20 },
    { word: "kindly approve", points: 10 },
    { word: "adjustment", points: 25 },
    { word: "misc", points: 20 },
    { word: "reimburse", points: 15 },
    { word: "fee", points: 20 },
    { word: "round off", points: 20 }
  ];

  suspiciousPatterns.forEach(rule => {
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
  const len = desc.split(" ").length;
  return Math.min(100, len * 3);
}

// HEATMAP (risk keywords)
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

  const amounts = list.map(x => x.amount);
  const avg = amounts.reduce((a, b) => a + b) / amounts.length;

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

  // penalties
  base -= inv.anomalyScore * 0.8;
  base -= inv.piiExposure * 0.9;
  base -= inv.plagiarismScore * 0.7;
  base -= inv.toneScore * 0.6;
  base -= inv.fishinessScore * 0.7;

  // rewards
  base += inv.transparencyIndex * 0.1;
  base += inv.clarityScore * 0.1;

  return Math.max(0, Math.min(100, Math.round(base)));
}

// STORYLINE GENERATION
function storyline(inv) {
  let lines = [];

  if (inv.toneScore > 0) lines.push("Urgent tone increases fraud probability.");
  if (inv.pii.length > 0) lines.push("Sensitive personal information detected.");
  if (inv.fishinessScore > 20) lines.push("Suspicious wording detected.");
  if (inv.plagiarismScore > 20) lines.push("Possible repeated invoice text.");

  return lines.join(" ");
}

//------------------------------------------------------------
// PROCESS INVOICE
//------------------------------------------------------------
app.post("/process-invoice", (req, res) => {
  const { invoiceNumber, vendorName, amount, description } = req.body;

  // store original text for plagiarism
  storedDocs.push(description);

  // AI calculations
  const tone = toneScore(description);
  const fish = fishiness(description);
  const trans = transparency(description);
  const clear = clarity(description);
  const heat = heatmap(description);
  const pii = detectPII(description);
  const redacted = redactPII(description);

  // plagiarism
  let similarity = 0;
  storedDocs.slice(0, -1).forEach(doc => {
    similarity = Math.max(similarity, jaccard(description, doc));
  });
  const plagiarismScore = Math.round(similarity * 100);

  // anomaly (simple version)
  const anomalyScore = amount > 1000000 ? 35 : 0;

  // vendor behavior
  const vendorPatternResult = vendorPattern(vendorName);

  // PII exposure weighting
  const piiExposure = pii.length * 25;

  // blockchain hashes
  const prevHash = invoices.length === 0 ? "GEN" : invoices[invoices.length - 1].recordHash;

  // create invoice object
  const inv = {
    invoiceNumber,
    vendorName,
    amount,
    description,
    anomalyScore,
    toneScore: tone,
    fishinessScore: fish,
    transparencyIndex: trans,
    clarityScore: clear,
    plagiarismScore,
    pii,
    piiExposure,
    heatmap: heat,
    redacted,
    vendorPattern: vendorPatternResult,
    storyline: storyline({
      toneScore: tone,
      pii,
      fishinessScore: fish,
      plagiarismScore
    }),
    prevHash
  };

  inv.recordHash = computeHash(inv);
  inv.DRS = reputationScore(inv);

  invoices.push(inv);

  res.json(inv);
});

//------------------------------------------------------------
// GET ALL INVOICES
//------------------------------------------------------------
app.get("/invoices", (req, res) => {
  res.json(invoices);
});

//------------------------------------------------------------
app.listen(5000, () => console.log("✅ Server running on port 5000"));











