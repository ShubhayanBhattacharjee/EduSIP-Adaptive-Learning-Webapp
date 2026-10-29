// One-time job: copy "subject" onto old Response documents that were saved without it,
// so the dashboard no longer has to join every response to its question.
//   node scripts/backfill-response-subject.js
// Safe to run more than once: it only touches responses that have no subject yet.
require("dotenv").config();
const mongoose = require("mongoose");
const Response = require("../models/Response");
const Question = require("../models/Question");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // The question bank is small, so keep question -> subject in memory.
  const subjectOf = new Map((await Question.find({}).select("subject").lean()).map((q) => [String(q._id), q.subject]));
  console.log(`Questions in bank: ${subjectOf.size}`);

  const missing = { $or: [{ subject: { $exists: false } }, { subject: null }, { subject: "" }] };
  const total = await Response.countDocuments(missing);
  console.log(`Responses without a subject: ${total}`);

  let fixed = 0, orphan = 0, ops = [];
  const flush = async () => {
    if (!ops.length) return;
    await Response.bulkWrite(ops, { ordered: false });
    fixed += ops.length;
    ops = [];
    process.stdout.write(`\r  updated ${fixed}/${total}`);
  };

  const cursor = Response.find(missing).select("question").lean().cursor();
  for await (const r of cursor) {
    const subject = subjectOf.get(String(r.question));
    if (!subject) { orphan++; continue; }      // its question was deleted: nothing to copy
    ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { subject } } } });
    if (ops.length >= 1000) await flush();
  }
  await flush();

  console.log(`\nDone. Updated ${fixed}. Skipped ${orphan} whose question no longer exists.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
