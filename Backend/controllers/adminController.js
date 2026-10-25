const mongoose = require("mongoose");
const Topic = require("../models/Topic");
const ml = require("../services/mlService");
const { ci } = require("../services/adaptiveService");
const Question = require("../models/Question");
const User = require("../models/User");
const csv = require("csv-parser");
const fs = require("fs");


// ---------- ADD SINGLE QUESTION ----------
const labelOf = (lvl) => (lvl <= 3 ? "easy" : lvl <= 6 ? "medium" : "hard");
exports.addQuestion = async (req, res) => {
  try {
    const { subject, topic, questionText, options, correctAnswer, hint } = req.body;
    const lvl = req.body.level === undefined || req.body.level === "" ? null : Number(req.body.level);
    if (lvl !== null && (!Number.isInteger(lvl) || lvl < 1 || lvl > 10))
      return res.status(400).json({ success: false, message: "level must be a whole number from 1 to 10" });
    const difficulty = lvl !== null ? labelOf(lvl) : req.body.difficulty;
    const level = String(difficulty || "").trim().toLowerCase();
    const correct = Number(correctAnswer);
    if (!["easy", "medium", "hard"].includes(level) || !Number.isInteger(correct) || correct < 0 || correct > 3) {
      return res.status(400).json({ success: false, message: "difficulty must be easy/medium/hard and correctAnswer 0-3" });
    }
    // 1️⃣ Check required fields
    if (!subject || !topic || !difficulty || !questionText || !options) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // 2️⃣ Check options array
    if (!Array.isArray(options) || options.length !== 4) {
      return res.status(400).json({
        success: false,
        message: "Options must be an array of 4 values"
      });
    }

    // 3️⃣ ✅ Check correctAnswer validity
    if (correctAnswer === undefined || correctAnswer < 0 || correctAnswer > 3) {
      return res.status(400).json({
        success: false,
        message: "Correct answer must be an index between 0 and 3"
      });
    }

    // 4️⃣ Create question
    const question = await Question.create({
      subject,
      topic,
      questionText,
      options,
      correctAnswer: correct,
      hint,
      level: lvl,
      difficulty: level,
    });

    res.status(201).json({
      success: true,
      question
    });

  } catch (error) {
    console.error("Add Question Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add question"
    });
  }
};

// ---------- CSV BULK UPLOAD ----------
exports.uploadCSV = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "CSV file is required" });

  const rows = [], rejectedRows = [];
  let line = 0;
  const cleanup = () => fs.unlink(req.file.path, () => {});

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (d) => {
      line++;
      try {
        const options = JSON.parse(d.options);
        const lvl = d.level === undefined || String(d.level).trim() === "" ? null : Number(d.level);
        if (lvl !== null && (!Number.isInteger(lvl) || lvl < 1 || lvl > 10)) throw new Error("invalid level");
        const difficulty = lvl !== null ? labelOf(lvl) : String(d.difficulty || "medium").trim().toLowerCase();
        const correctAnswer = Number(d.correctAnswer);
        if (!d.subject?.trim() || !d.topic?.trim() || !d.questionText?.trim()
          || !Array.isArray(options) || options.length !== 4
          || !["easy", "medium", "hard"].includes(difficulty)
          || !Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) throw new Error("invalid");
        rows.push({ subject: d.subject.trim(), topic: d.topic.trim(), difficulty, level: lvl,
                    questionText: d.questionText.trim(), options, correctAnswer, hint: d.hint || "" });
      } catch { rejectedRows.push(line); }
    })
    .on("error", (err) => { cleanup(); res.status(400).json({ success: false, message: "Could not read CSV" }); })
    .on("end", async () => {
      try {
        if (!rows.length) return res.status(400).json({ success: false, message: "No valid questions found", rejectedRows });
        await Question.insertMany(rows, { ordered: false });
        res.json({ success: true, inserted: rows.length, rejectedRows });
      } catch (err) {
        console.error("CSV Upload Error:", err);
        res.status(500).json({ success: false, message: "CSV upload failed" });
      } finally { cleanup(); }
    });
};

// ---------- analytics ----------
exports.getAnalytics = async (req, res) => {
  try {
    // Old questions have no status field, so "not pending and not rejected" keeps them counted.
    const approved = { status: { $nin: ["pending", "rejected"] } };

    const totalUsers = await User.countDocuments();
    const totalQuestionsInDB = await Question.countDocuments(approved);
    const pendingQuestions = await Question.countDocuments({ status: "pending" });

    // Aggregation for subject analytics (approved questions only)
    const subjectStats = await Question.aggregate([
      { $match: approved },
      {
        $group: {
          _id: "$subject",
          totalQuestions: { $sum: 1 },
          easy: { $sum: { $cond: [{ $eq: ["$difficulty", "easy"] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ["$difficulty", "medium"] }, 1, 0] } },
          hard: { $sum: { $cond: [{ $eq: ["$difficulty", "hard"] }, 1, 0] } },
        },
      },
    ]);

    const subjects = subjectStats.map((s) => ({
      subject: s._id,
      totalQuestions: s.totalQuestions,
      easy: s.easy,
      medium: s.medium,
      hard: s.hard,
    }));

    res.json({
      success: true,
      totalUsers,
      totalQuestionsInDB,
      pendingQuestions,
      subjects,
    });
  } catch (error) {
    console.error("Admin Analytics Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
    });
  }
};

const LEVELS = ["easy", "medium", "hard"];

// Use the spelling already stored in the database, so "maths" never creates a second subject.
async function canonicalSubject(subject) {
  const q = await Question.findOne({ subject: ci(subject) }).select("subject").lean();
  return q ? q.subject : null;
}
async function canonicalTopic(subject, topic) {
  const q = await Question.findOne({ subject, topic: ci(topic) }).select("topic").lean();
  return q ? q.topic : null;
}

// ---------- AI QUESTION GENERATION (saved as "pending", students never see them) ----------
exports.generateQuestions = async (req, res) => {
  try {
    let subject = String(req.body.subject || "").trim();
    let topic = String(req.body.topic || "").trim();
    const difficulty = String(req.body.difficulty || "medium").trim().toLowerCase();
    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 5, 1), 20);

    if (!subject || !topic) return res.status(400).json({ success: false, message: "subject and topic are required" });
    if (!LEVELS.includes(difficulty)) return res.status(400).json({ success: false, message: "difficulty must be easy, medium or hard" });

    subject = (await canonicalSubject(subject)) || subject;
    topic = (await canonicalTopic(subject, topic)) || topic;

    const out = await ml.generateQuestions({ subject, topic, difficulty, count });   // slow: one AI call per question

    const known = new Set(
      (await Question.find({ subject, topic }).select("questionText").lean()).map((q) => q.questionText.trim().toLowerCase())
    );
    const fresh = out.questions.filter((q) => !known.has(q.questionText.trim().toLowerCase()));
    const saved = fresh.length
      ? await Question.insertMany(fresh.map((q) => ({ ...q, status: "pending", source: "ai" })))
      : [];

    res.status(201).json({
      success: true,
      asked: out.asked,
      created: saved.length,
      duplicatesSkipped: out.questions.length - fresh.length,
      rejectedByChecks: out.rejected,
      questions: saved,
    });
  } catch (error) {
    console.error("Generate questions error:", error.message);
    res.status(502).json({ success: false, message: `AI question service failed: ${error.message}` });
  }
};

// ---------- APPROVAL QUEUE ----------
exports.getPending = async (req, res) => {
  try {
    const filter = { status: "pending" };
    if (req.query.subject) filter.subject = ci(req.query.subject);
    if (req.query.topic) filter.topic = ci(req.query.topic);
    const questions = await Question.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, count: questions.length, questions });
  } catch (error) {
    console.error("Pending questions error:", error);
    res.status(500).json({ success: false, message: "Failed to load pending questions" });
  }
};

// body: { action: "approve" | "reject", edits?: { questionText, options, correctAnswer, hint, difficulty } }
exports.reviewQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, edits } = req.body;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid question id" });
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ success: false, message: "action must be approve or reject" });

    const q = await Question.findById(id);
    if (!q) return res.status(404).json({ success: false, message: "Question not found" });

    if (edits && typeof edits === "object") {
      if (edits.questionText !== undefined) q.questionText = String(edits.questionText).trim();
      if (edits.options !== undefined) q.options = edits.options;
      if (edits.correctAnswer !== undefined) q.correctAnswer = Number(edits.correctAnswer);
      if (edits.hint !== undefined) q.hint = String(edits.hint);
      if (edits.difficulty !== undefined) q.difficulty = String(edits.difficulty).toLowerCase();
      if (edits.level !== undefined) { q.level = edits.level === null ? null : Number(edits.level); if (q.level !== null) q.difficulty = labelOf(q.level); }
    }
    q.status = action === "approve" ? "approved" : "rejected";
    await q.save();                                  // schema rules re-check options (4) and correctAnswer (0-3)

    res.json({ success: true, question: q });
  } catch (error) {
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: error.message });
    console.error("Review question error:", error);
    res.status(500).json({ success: false, message: "Failed to review question" });
  }
};

// body: { ids: [..], action: "approve" | "reject" }   only touches questions that are still pending
exports.bulkReview = async (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every((i) => mongoose.isValidObjectId(i))) {
      return res.status(400).json({ success: false, message: "ids must be 1-200 valid question ids" });
    }
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ success: false, message: "action must be approve or reject" });

    const r = await Question.updateMany(
      { _id: { $in: ids }, status: "pending" },
      { $set: { status: action === "approve" ? "approved" : "rejected" } }
    );
    res.json({ success: true, updated: r.modifiedCount });
  } catch (error) {
    console.error("Bulk review error:", error);
    res.status(500).json({ success: false, message: "Bulk review failed" });
  }
};

// ---------- TOPIC PREREQUISITES (feeds the weak-topic finder and the study plan) ----------
exports.getTopics = async (req, res) => {
  try {
    const filter = req.query.subject ? { subject: ci(req.query.subject) } : {};
    const topics = await Topic.find(filter).sort({ subject: 1, name: 1 }).lean();
    res.json({ success: true, topics });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load topics" });
  }
};

// body: { subject, name, prerequisites: ["Fractions"] }   creates or replaces
exports.upsertTopic = async (req, res) => {
  try {
    const subject = await canonicalSubject(String(req.body.subject || "").trim());
    if (!subject) return res.status(404).json({ success: false, message: "Unknown subject (no questions yet)" });
    const name = await canonicalTopic(subject, String(req.body.name || "").trim());
    if (!name) return res.status(404).json({ success: false, message: "Unknown topic (no questions yet)" });

    const raw = Array.isArray(req.body.prerequisites) ? req.body.prerequisites : [];
    const prerequisites = [];
    for (const p of raw) {
      const fixed = await canonicalTopic(subject, String(p).trim());
      if (!fixed) return res.status(400).json({ success: false, message: `Prerequisite "${p}" has no questions in ${subject}` });
      if (fixed === name) return res.status(400).json({ success: false, message: "A topic cannot be its own prerequisite" });
      if (!prerequisites.includes(fixed)) prerequisites.push(fixed);
    }

    const topic = await Topic.findOneAndUpdate(
      { subject, name },
      { subject, name, prerequisites },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, topic });
  } catch (error) {
    console.error("Upsert topic error:", error);
    res.status(500).json({ success: false, message: "Failed to save topic" });
  }
};
