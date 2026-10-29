const mongoose = require("mongoose");
const Topic = require("../models/Topic");
const ml = require("../services/mlService");
const { ci } = require("../services/adaptiveService");
const Question = require("../models/Question");
const User = require("../models/User");
const Response = require("../models/Response");
const PlacementTest = require("../models/PlacementTest");
const { seedElo, toScale, questionLevel } = require("../services/adaptiveService");
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

    // 3b. clean text, every option filled and different
    const cleanOptions = options.map((o) => String(o).trim());
    if (cleanOptions.some((o) => !o) || new Set(cleanOptions.map((o) => o.toLowerCase())).size !== 4) {
      return res.status(400).json({ success: false, message: "All 4 options must be filled in and different from each other" });
    }
    const subj = (await canonicalSubject(String(subject).trim())) || String(subject).trim();
    const top = (await canonicalTopic(subj, String(topic).trim())) || String(topic).trim();
    const text = String(questionText).trim();
    if (await Question.exists({ subject: subj, topic: ci(top), questionText: ci(text) })) {
      return res.status(409).json({ success: false, message: "This question already exists in that topic" });
    }

    // 4️⃣ Create question
    const question = await Question.create({
      subject: subj,
      topic: top,
      questionText: text,
      options: cleanOptions,
      correctAnswer: correct,
      hint: String(hint || "").trim(),
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

        // use the spelling already in the database ("maths" must not become a second subject)
        const subjectMap = new Map((await Question.distinct("subject")).map((x) => [x.toLowerCase(), x]));
        const pairs = await Question.aggregate([{ $group: { _id: { s: "$subject", t: "$topic" } } }]);
        const topicMap = new Map(pairs.map((x) => [`${x._id.s}|${String(x._id.t).toLowerCase()}`, x._id.t]));
        for (const r of rows) {
          r.subject = subjectMap.get(r.subject.toLowerCase()) || r.subject;
          r.topic = topicMap.get(`${r.subject}|${r.topic.toLowerCase()}`) || r.topic;
        }
        // drop duplicates: already in the database, or repeated inside the file
        const have = await Question.find({ subject: { $in: [...new Set(rows.map((r) => r.subject))] } }).select("subject topic questionText").lean();
        const seen = new Set(have.map((q) => `${q.subject}|${q.topic}|${q.questionText}`.toLowerCase()));
        const fresh = [], duplicates = [];
        rows.forEach((r, i) => {
          const key = `${r.subject}|${r.topic}|${r.questionText}`.toLowerCase();
          if (seen.has(key)) duplicates.push(i + 1); else { seen.add(key); fresh.push(r); }
        });
        if (!fresh.length) return res.status(409).json({ success: false, message: "Every question in this file already exists", duplicates: duplicates.length, rejectedRows });
        await Question.insertMany(fresh, { ordered: false });
        res.json({ success: true, inserted: fresh.length, duplicatesSkipped: duplicates.length, rejectedRows });
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
    const week = new Date(Date.now() - 7 * 864e5);

    // Every query here is independent, so run them all at once
    const [
      totalUsers, totalQuestionsInDB, pendingQuestions, subjectStats,
      byRole, newUsers7d, answers7d, active7d, unused, tooEasy, tooHard, pendingTeachers,
    ] = await Promise.all([
      User.estimatedDocumentCount(),
      Question.countDocuments(approved),
      Question.countDocuments({ status: "pending" }),
      Question.aggregate([
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
      ]),
      User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
      User.countDocuments({ createdAt: { $gte: week } }),
      Response.countDocuments({ createdAt: { $gte: week } }),
      Response.aggregate([{ $match: { createdAt: { $gte: week } } }, { $group: { _id: "$user" } }, { $count: "n" }]),
      Question.countDocuments({ ...approved, ...FLAG_FILTERS.unused }),
      Question.countDocuments({ ...approved, ...FLAG_FILTERS.tooEasy }),
      Question.countDocuments({ ...approved, ...FLAG_FILTERS.tooHard }),
      User.countDocuments({ role: "teacher", teacherApproved: false }),
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
      usersByRole: Object.fromEntries(byRole.map((r) => [r._id, r.n])),
      newUsers7d, answers7d, activeStudents7d: active7d[0] ? active7d[0].n : 0, pendingTeachers,
      questionHealth: { unused, tooEasy, tooHard },
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
      if (edits.options !== undefined) {
        const opts = Array.isArray(edits.options) ? edits.options.map((o) => String(o).trim()) : [];
        if (opts.length !== 4 || opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase())).size !== 4) {
          return res.status(400).json({ success: false, message: "All 4 options must be filled in and different" });
        }
        q.options = opts;
      }
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

    // A needs B needs A would make the weak-topic search run in circles.
    const others = await Topic.find({ subject, name: { $ne: name } }).lean();
    const graph = new Map(others.map((t) => [t.name, t.prerequisites || []]));
    const reaches = (from, target, seen = new Set()) => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (graph.get(from) || []).some((n) => reaches(n, target, seen));
    };
    const loop = prerequisites.find((p) => reaches(p, name));
    if (loop) return res.status(400).json({ success: false, message: `"${loop}" already depends on "${name}", so this would create a loop` });

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


// =====================================================================
//  STEP 4: QUESTION BANK, TOPICS, SYSTEM
// =====================================================================
const APPROVED = { $nin: ["pending", "rejected"] };
// attempts >= 20 so one lucky or unlucky student never flags a question. $max keeps the divide safe.
const rate = { $divide: ["$correctCount", { $max: ["$attempts", 1] }] };
const FLAG_FILTERS = {
  unused: { attempts: { $in: [0, null] } },
  tooEasy: { $expr: { $and: [{ $gte: ["$attempts", 20] }, { $gte: [rate, 0.95] }] } },
  tooHard: { $expr: { $and: [{ $gte: ["$attempts", 20] }, { $lte: [rate, 0.15] }] } },       // 4 options: guessing alone gives 25%
  noHint: { $or: [{ hint: "" }, { hint: null }, { hint: { $exists: false } }] },
};

function describe(q) {
  const labelLevel = toScale(seedElo(q));
  const learned = q.elo === null || q.elo === undefined ? null : toScale(q.elo);
  const accuracy = q.attempts > 0 ? Number((q.correctCount / q.attempts).toFixed(3)) : null;
  const flags = [];
  if (!q.attempts) flags.push("unused");
  if (q.attempts >= 20 && accuracy >= 0.95) flags.push("too easy");
  if (q.attempts >= 20 && accuracy <= 0.15) flags.push("too hard or wrong key");
  if (learned !== null && Math.abs(learned - labelLevel) >= 3) flags.push("level drifted");
  if (!q.hint) flags.push("no hint");
  return { ...q, accuracy, labelLevel, learnedLevel: learned, currentLevel: questionLevel(q), flags };
}

/* GET /admin/questions?status=&subject=&topic=&search=&flag=&sort=&page=&limit= */
exports.listQuestions = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const match = {};
    const st = String(req.query.status || "approved");
    if (st === "approved") match.status = APPROVED;
    else if (["pending", "rejected"].includes(st)) match.status = st;
    if (req.query.subject) match.subject = ci(String(req.query.subject));
    if (req.query.topic) match.topic = ci(String(req.query.topic));
    const search = String(req.query.search || "").trim().slice(0, 100);
    if (search) match.questionText = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const flag = String(req.query.flag || "");
    const and = [match];
    if (FLAG_FILTERS[flag]) and.push(FLAG_FILTERS[flag]);
    const filter = and.length > 1 ? { $and: and } : match;

    const SORTS = {
      newest: { createdAt: -1 }, oldest: { createdAt: 1 }, attempts: { attempts: -1, createdAt: -1 },
      accuracy_asc: { accuracy: 1, createdAt: -1 }, accuracy_desc: { accuracy: -1, createdAt: -1 },
      elo_asc: { elo: 1 }, elo_desc: { elo: -1 },
    };
    const sort = SORTS[req.query.sort] || SORTS.newest;

    const [items, total] = await Promise.all([
      Question.aggregate([
        { $match: filter },
        { $addFields: { accuracy: { $cond: [{ $gt: ["$attempts", 0] }, rate, null] } } },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
      ]),
      Question.countDocuments(filter),
    ]);
    res.json({ success: true, page, limit, total, questions: items.map(describe) });
  } catch (error) {
    console.error("List questions error:", error);
    res.status(500).json({ success: false, message: "Failed to load questions" });
  }
};

/* GET /admin/questions/:id/stats : which option do students pick, how long do they take */
exports.questionStats = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid question id" });
    const q = await Question.findById(req.params.id).lean();
    if (!q) return res.status(404).json({ success: false, message: "Question not found" });
    const oid = new mongoose.Types.ObjectId(req.params.id);
    const [picks, overall] = await Promise.all([
      Response.aggregate([{ $match: { question: oid } }, { $group: { _id: "$selectedAnswer", n: { $sum: 1 } } }]),
      Response.aggregate([
        { $match: { question: oid } },
        { $group: { _id: null, n: { $sum: 1 }, avgTime: { $avg: "$timeTaken" }, hinted: { $sum: { $cond: [{ $gt: ["$hintsUsed", 0] }, 1, 0] } }, last30: { $sum: { $cond: [{ $gte: ["$createdAt", new Date(Date.now() - 30 * 864e5)] }, 1, 0] } } } },
      ]),
    ]);
    const total = overall[0]?.n || 0;
    const byOption = [0, 1, 2, 3].map((i) => {
      const n = picks.find((p) => p._id === i)?.n || 0;
      return { option: i, text: q.options[i], correct: i === q.correctAnswer, picked: n, share: total ? Number((n / total).toFixed(3)) : 0, misconception: q.misconceptions?.[i] || "" };
    });
    // a wrong option picked more than the right one is the classic sign of a wrong key
    const right = byOption.find((o) => o.correct);
    const wrongKeyWarning = total >= 20 && byOption.some((o) => !o.correct && o.picked > right.picked * 1.5);
    res.json({
      success: true, question: describe(q), answers: total,
      avgSeconds: overall[0] ? Number(overall[0].avgTime.toFixed(1)) : null,
      hintRate: total ? Number((overall[0].hinted / total).toFixed(3)) : 0,
      last30Days: overall[0]?.last30 || 0, byOption, wrongKeyWarning,
    });
  } catch (error) {
    console.error("Question stats error:", error);
    res.status(500).json({ success: false, message: "Failed to load question stats" });
  }
};

/* PATCH /admin/questions/:id   body: any of subject, topic, questionText, options, correctAnswer, hint, level, difficulty, status, resetStats */
exports.updateQuestion = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid question id" });
    const q = await Question.findById(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: "Question not found" });
    const b = req.body || {};
    let keyChanged = false;

    if (b.subject !== undefined) q.subject = (await canonicalSubject(String(b.subject).trim())) || String(b.subject).trim();
    if (b.topic !== undefined) q.topic = (await canonicalTopic(q.subject, String(b.topic).trim())) || String(b.topic).trim();
    if (b.questionText !== undefined) {
      q.questionText = String(b.questionText).trim();
      if (!q.questionText) return res.status(400).json({ success: false, message: "Question text cannot be empty" });
    }
    if (b.options !== undefined) {
      const opts = Array.isArray(b.options) ? b.options.map((o) => String(o).trim()) : [];
      if (opts.length !== 4 || opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase())).size !== 4) {
        return res.status(400).json({ success: false, message: "All 4 options must be filled in and different" });
      }
      q.options = opts;
    }
    if (b.correctAnswer !== undefined) {
      const c = Number(b.correctAnswer);
      if (!Number.isInteger(c) || c < 0 || c > 3) return res.status(400).json({ success: false, message: "correctAnswer must be 0 to 3" });
      keyChanged = c !== q.correctAnswer;
      q.correctAnswer = c;
    }
    if (b.hint !== undefined) q.hint = String(b.hint).trim();
    if (b.level !== undefined) {
      if (b.level === null || b.level === "") q.level = null;
      else {
        const l = Number(b.level);
        if (!Number.isInteger(l) || l < 1 || l > 10) return res.status(400).json({ success: false, message: "level must be a whole number from 1 to 10" });
        q.level = l;
        q.difficulty = labelOf(l);
      }
    }
    if (b.difficulty !== undefined && b.level === undefined) {
      const d = String(b.difficulty).toLowerCase();
      if (!LEVELS.includes(d)) return res.status(400).json({ success: false, message: "difficulty must be easy, medium or hard" });
      q.difficulty = d;
    }
    if (b.status !== undefined) {
      if (!["approved", "pending", "rejected"].includes(b.status)) return res.status(400).json({ success: false, message: "Invalid status" });
      q.status = b.status;
    }
    // Old statistics describe the old question. Reset them when the answer key changed or the admin asks.
    if (b.resetStats === true || keyChanged) { q.attempts = 0; q.correctCount = 0; q.elo = null; }

    const clash = await Question.exists({ _id: { $ne: q._id }, subject: q.subject, topic: ci(q.topic), questionText: ci(q.questionText) });
    if (clash) return res.status(409).json({ success: false, message: "Another question with the same text exists in that topic" });

    await q.save();
    res.json({ success: true, question: describe(q.toObject()), statsReset: !!(b.resetStats === true || keyChanged) });
  } catch (error) {
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: error.message });
    console.error("Update question error:", error);
    res.status(500).json({ success: false, message: "Failed to update question" });
  }
};

/* DELETE /admin/questions/:id
   Never deletes a question that students have answered (their history points at it): it is retired instead. */
exports.deleteQuestion = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid question id" });
    const q = await Question.findById(req.params.id).select("_id attempts").lean();
    if (!q) return res.status(404).json({ success: false, message: "Question not found" });
    if (await PlacementTest.exists({ active: true, questionIds: q._id })) {
      return res.status(409).json({ success: false, message: "This question is in the active placement test. Rebuild the placement test first." });
    }
    const answered = (q.attempts || 0) > 0 || (await Response.exists({ question: q._id }));
    if (answered) {
      await Question.updateOne({ _id: q._id }, { $set: { status: "rejected" } });
      return res.json({ success: true, retired: true, message: "Students have answered this question, so it was retired (hidden) instead of deleted." });
    }
    await Question.deleteOne({ _id: q._id });
    res.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Delete question error:", error);
    res.status(500).json({ success: false, message: "Failed to delete question" });
  }
};

/* POST /admin/questions/purge-rejected : permanently remove rejected AI questions nobody has answered */
exports.purgeRejected = async (req, res) => {
  try {
    const r = await Question.deleteMany({ status: "rejected", source: "ai", attempts: { $in: [0, null] } });
    res.json({ success: true, deleted: r.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: "Purge failed" });
  }
};

/* GET /admin/catalog : subjects -> topics (question counts, prerequisites). Feeds every dropdown in the admin pages. */
exports.catalog = async (req, res) => {
  try {
    const [rows, topics] = await Promise.all([
      Question.aggregate([
        { $group: {
          _id: { s: "$subject", t: "$topic" },
          approved: { $sum: { $cond: [{ $in: ["$status", ["pending", "rejected"]] }, 0, 1] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        } },
      ]),
      Topic.find().lean(),
    ]);
    const pre = new Map(topics.map((t) => [`${t.subject}|${t.name}`, { id: t._id, prerequisites: t.prerequisites || [] }]));
    const by = new Map();
    for (const r of rows) {
      if (!r.approved && !r.pending) continue;
      if (!by.has(r._id.s)) by.set(r._id.s, []);
      const p = pre.get(`${r._id.s}|${r._id.t}`);
      by.get(r._id.s).push({ name: r._id.t, approved: r.approved, pending: r.pending, prerequisites: p ? p.prerequisites : [], topicId: p ? p.id : null });
    }
    const subjects = [...by.entries()]
      .map(([subject, list]) => ({ subject, topics: list.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
    res.json({ success: true, subjects });
  } catch (error) {
    console.error("Catalog error:", error);
    res.status(500).json({ success: false, message: "Failed to load catalog" });
  }
};

/* DELETE /admin/topics/:id : remove a topic's prerequisite record (the questions stay) */
exports.deleteTopic = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid topic id" });
    const t = await Topic.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ success: false, message: "Topic not found" });
    await Topic.deleteOne({ _id: t._id });
    await Topic.updateMany({ subject: t.subject, prerequisites: t.name }, { $pull: { prerequisites: t.name } });   // nobody keeps depending on it
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete topic" });
  }
};

/* GET /admin/system : is everything alive, and is anything stuck? */
exports.system = async (req, res) => {
  try {
    const { last } = require("../services/reconcileService");
    const [health, pending, unlearned, oldest] = await Promise.all([
      ml.health(),
      Question.countDocuments({ status: "pending" }),
      Response.countDocuments({ learned: false, trust: { $gte: 0.5 } }),
      Response.findOne({ learned: false }).sort({ createdAt: 1 }).select("createdAt").lean(),
    ]);
    res.json({
      success: true,
      serverTime: new Date(),
      ml: health ? { up: true, ...health } : { up: false },
      database: { connected: mongoose.connection.readyState === 1 },
      queue: { pendingQuestions: pending, answersWaitingForModel: unlearned, oldestWaitingAt: oldest ? oldest.createdAt : null },
      reconcile: { everyMinutes: Number(process.env.RECONCILE_MINUTES || 10), lastRunAt: last.at, lastResult: last.result },
      settings: {
        nodeEnv: process.env.NODE_ENV || "development",
        forceAdaptive: process.env.FORCE_ADAPTIVE === "true",
        pilotMode: process.env.PILOT_MODE === "true",
        requirePlacement: process.env.REQUIRE_PLACEMENT === "true",
        skipEmailVerification: process.env.SKIP_EMAIL_VERIFICATION === "true",
        legacyStaffLogin: process.env.LEGACY_STAFF_LOGIN === "true",
      },
    });
  } catch (error) {
    console.error("System error:", error);
    res.status(500).json({ success: false, message: "Failed to load system status" });
  }
};

/* POST /admin/ml/reload : tell the ML service to load freshly refitted numbers */
exports.mlReload = async (req, res) => {
  const out = await ml.reloadParams();
  if (!out) return res.status(503).json({ success: false, message: "The ML service did not answer" });
  res.json({ success: true, result: out });
};
