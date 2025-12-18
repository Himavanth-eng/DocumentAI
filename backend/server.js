const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const crypto = require("crypto");

const app = express();

/* ============================================================
   BODY PARSER
============================================================ */
app.use(express.json());

/* ============================================================
   🔥 MANUAL CORS (RENDER-PROOF)
============================================================ */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // IMPORTANT: handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* ============================================================
   FILE UPLOAD (OCR)
============================================================ */
const upload = multer({ storage: multer.memoryStorage() });

let invoices = [];
let storedDocs = [];

/* ============================================================
   ROOT CHECK
============================================================ */
app.get("/", (req, res) => {
  res.send("🚀 DocumentAI Backend is running successfully");
});

/* ============================================================
   OCR ENDPOINT
============================================================ */
app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    const result = await Tesseract.recognize(buffer, "eng");
    res.json({ text: result.data.text });
  } catch (err) {
    res.status(500).json({ error: "OCR failed" });
  }
});

/* ============================================================
   AI UTILITIES
============================================================ */
function detectPII(text) {
  let out = [];
  if (/\b\d{4}\s\d{4}\s\d{4}\b/.test(text)) out.push("AADHAAR");
  if (/[A-Z]{5}[0-9]{4}[A-Z]/.test(text)) out.push("PAN");
  if (/\b[6-9]\d{9}\b/.test(text)) out.push("PHONE");
  if (/\S+@\S+\.\S+/.test(text)) out.push("EMAIL");
  return out;
}

function redactPII(text) {
  return text
    .replace(/\b\d{4}\s\d{4}\s\d{4}\b/g, "**** **** ****")
    .replace(/[A-Z]{5}[0-9]{4}[A-Z]/g, "XXXXX0000X")
    .replace(/\b[6-9]\d{9}\b/g, "**********")
    .replace(/\S+@\S+\.\S+/g, "hidden@email.com");
}

function toneScore(t) {
  let s = 0;
  ["urgent", "immediately", "asap", "kindly approve"].forEach(w => {
    if (t.toLowerCase().includes(w)) s += 15;
  });
  return s;
}

function fishiness(t) {
  let s = 0;
  const rules = [
    ["urgent",20],["immediately",20],["asap",20],
    ["adjustment",25],["misc",20],["fee",20]
  ];
  rules.forEach(r => {
    if (t.toLowerCase().includes(r[0])) s += r[1];
  });
  return Math.min(100, s);
}

function transparency(t) {
  let s = 70;
  if (t.length < 30) s -= 20;
  if (/misc|fee|adjust/i.test(t)) s -= 20;
  return Math.max(0, s);
}

function clarity(t) {
  return Math.min(100, t.split(" ").length * 3);
}

function jaccard(a, b) {
  const s1 = new Set(a.split(" "));
  const s2 = new Set(b.split(" "));
  return [...s1].filter(x => s2.has(x)).length /
         new Set([...s1, ...s2]).size;
}

function computeHash(o) {
  return crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
}

function reputation(inv) {
  let base = 100;
  base -= inv.anomalyScore * 0.8;
  base -= inv.piiExposure * 0.9;
  base -= inv.plagiarismScore * 0.7;
  base -= inv.toneScore * 0.6;
  base -= inv.fishinessScore * 0.7;
  base += inv.transparencyIndex * 0.1;
  base += inv.clarityScore * 0.1;
  return Math.max(0, Math.round(base));
}

/* ============================================================
   PROCESS INVOICE
============================================================ */
app.post("/process-invoice", (req, res) => {
  const { invoiceNumber, vendorName, amount, description } = req.body;

  storedDocs.push(description);

  let sim = 0;
  storedDocs.slice(0, -1).forEach(d => {
    sim = Math.max(sim, jaccard(description, d));
  });

  const inv = {
    invoiceNumber,
    vendorName,
    amount,
    description,
    anomalyScore: amount > 1000000 ? 35 : 0,
    toneScore: toneScore(description),
    fishinessScore: fishiness(description),
    transparencyIndex: transparency(description),
    clarityScore: clarity(description),
    plagiarismScore: Math.round(sim * 100),
    pii: detectPII(description),
    piiExposure: detectPII(description).length * 25,
    redacted: redactPII(description)
  };

  inv.prevHash = invoices.length ? invoices[invoices.length - 1].recordHash : "GEN";
  inv.recordHash = computeHash(inv);
  inv.DRS = reputation(inv);

  invoices.push(inv);
  res.json(inv);
});

/* ============================================================
   GET ALL INVOICES
============================================================ */
app.get("/invoices", (req, res) => {
  res.json(invoices);
});

/* ============================================================
   SERVER START
============================================================ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});













