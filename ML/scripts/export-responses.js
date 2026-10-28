// Exports the responses collection to the CSV that ML/scripts/refit_elo.py expects.
//   node scripts/export-responses.js
//   node scripts/export-responses.js /custom/path/app_responses.csv
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Response = require("../models/Response");

const out = process.argv[2] || path.join(__dirname, "..", "..", "ML", "data", "app_responses.csv");
const FIELDS = ["user", "question", "subject", "topic", "difficulty", "success", "trust", "learned", "mode", "createdAt"];

const esc = (v) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ws = fs.createWriteStream(out);
  ws.write(FIELDS.join(",") + "\n");

  let n = 0;
  const cursor = Response.find({}).sort({ createdAt: 1 }).select(FIELDS.join(" ")).lean().cursor();
  for await (const r of cursor) {
    ws.write(FIELDS.map((f) => esc(r[f])).join(",") + "\n");
    n++;
  }
  await new Promise((resolve) => ws.end(resolve));
  console.log(`Wrote ${n} answers to ${out}`);
  await mongoose.disconnect();
})().catch((e) => { console.error("Export failed:", e.message); process.exit(1); });