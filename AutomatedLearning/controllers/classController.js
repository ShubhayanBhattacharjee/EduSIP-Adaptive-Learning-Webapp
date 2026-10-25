const crypto = require("crypto");
const mongoose = require("mongoose");
const Class = require("../models/Class");
const User = require("../models/User");
const Response = require("../models/Response");
const SkillState = require("../models/SkillState");
const QuizAttempt = require("../models/QuizAttempt");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const ml = require("../services/mlService");
const { OVERALL } = require("../services/adaptiveService");

const DAY = 864e5;

// Loads the class and checks the caller may see it (its teacher, or an admin).
// Sends the error itself and returns null when not allowed.
async function loadOwnClass(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid class id" });
    return null;
  }
  const c = await Class.findById(req.params.id);
  if (!c) {
    res.status(404).json({ success: false, message: "Class not found" });
    return null;
  }
  if (!["admin", "superadmin"].includes(req.user.role) && String(c.teacher) !== req.user.id) {
    res.status(403).json({ success: false, message: "This is not your class" });
    return null;
  }
  return c;
}

/* ---------------- teacher: create and list classes ---------------- */
exports.createClass = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 100);
    if (!name) return res.status(400).json({ success: false, message: "Class name is required" });

    for (let attempt = 0; attempt < 5; attempt++) {        // retry on the rare duplicate code
      try {
        const c = await Class.create({
          name, teacher: req.user.id, joinCode: crypto.randomBytes(4).toString("hex").toUpperCase(),
        });
        return res.status(201).json({ success: true, class: { id: c._id, name: c.name, joinCode: c.joinCode } });
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
    }
    res.status(500).json({ success: false, message: "Could not create a unique join code, try again" });
  } catch (error) {
    console.error("Create class error:", error);
    res.status(500).json({ success: false, message: "Failed to create class" });
  }
};

exports.myClasses = async (req, res) => {
  try {
    const filter = ["admin", "superadmin"].includes(req.user.role) ? {} : { teacher: req.user.id };
    const classes = await Class.find(filter).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      classes: classes.map((c) => ({ id: c._id, name: c.name, joinCode: c.joinCode, studentCount: c.students.length })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load classes" });
  }
};

/* ---------------- student: join and leave ---------------- */
exports.joinClass = async (req, res) => {
  try {
    const code = String(req.body.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: "Join code is required" });

    const c = await Class.findOneAndUpdate({ joinCode: code }, { $addToSet: { students: req.user.id } }, { new: true })
      .populate("teacher", "fullname");
    if (!c) return res.status(404).json({ success: false, message: "No class with that code" });

    res.json({ success: true, class: { id: c._id, name: c.name, teacher: c.teacher?.fullname } });
  } catch (error) {
    console.error("Join class error:", error);
    res.status(500).json({ success: false, message: "Failed to join class" });
  }
};

exports.leaveClass = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid class id" });
    await Class.updateOne({ _id: req.params.id }, { $pull: { students: req.user.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to leave class" });
  }
};

exports.myMemberships = async (req, res) => {
  try {
    const classes = await Class.find({ students: req.user.id }).populate("teacher", "fullname").lean();
    res.json({ success: true, classes: classes.map((c) => ({ id: c._id, name: c.name, teacher: c.teacher?.fullname })) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load classes" });
  }
};

/* ---------------- teacher: remove a student ---------------- */
exports.removeStudent = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    if (!mongoose.isValidObjectId(req.params.studentId)) return res.status(400).json({ success: false, message: "Invalid student id" });
    await Class.updateOne({ _id: c._id }, { $pull: { students: req.params.studentId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to remove student" });
  }
};

/* ---------------- teacher: class overview ----------------
   One row per student, the weakest topics across the class, and who needs attention. */
exports.overview = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    const ids = c.students;
    if (!ids.length) {
      return res.json({ success: true, class: { id: c._id, name: c.name, joinCode: c.joinCode }, students: [], weakTopics: [], needsAttention: [] });
    }

    const since = new Date(Date.now() - 14 * DAY);
    const [users, overall, activity, weak] = await Promise.all([
      User.find({ _id: { $in: ids } }).select("fullname username email streak").lean(),
      SkillState.find({ user: { $in: ids }, topic: OVERALL }).lean(),
      Response.aggregate([
        { $match: { user: { $in: ids } } },
        {
          $group: {
            _id: "$user",
            total: { $sum: 1 },
            lastActive: { $max: "$createdAt" },
            recentTotal: { $sum: { $cond: [{ $gte: ["$createdAt", since] }, 1, 0] } },
            recentSuccess: { $sum: { $cond: [{ $and: [{ $gte: ["$createdAt", since] }, { $eq: ["$success", true] }] }, 1, 0] } },
            flagged: { $sum: { $cond: [{ $lt: [{ $ifNull: ["$trust", 1] }, 1] }, 1, 0] } },
          },
        },
      ]),
      SkillState.aggregate([
        { $match: { user: { $in: ids }, topic: { $ne: OVERALL }, attempts: { $gte: 1 } } },
        { $group: { _id: { subject: "$subject", topic: "$topic" }, avgAbility: { $avg: "$ability" }, students: { $sum: 1 }, attempts: { $sum: "$attempts" } } },
        { $sort: { avgAbility: 1 } },
        { $limit: 8 },
      ]),
    ]);

    const actById = new Map(activity.map((a) => [String(a._id), a]));
    const abilityById = new Map();
    for (const s of overall) {
      const k = String(s.user);
      if (!abilityById.has(k)) abilityById.set(k, []);
      abilityById.get(k).push({ subject: s.subject, ability: Number(s.ability.toFixed(2)), attempts: s.attempts || 0 });
    }

    const now = Date.now();
    const students = users.map((u) => {
      const a = actById.get(String(u._id));
      const recentRate = a && a.recentTotal >= 5 ? Number((a.recentSuccess / a.recentTotal).toFixed(2)) : null;
      const reasons = [];
      if (!a) reasons.push("No answers yet");
      else if (now - new Date(a.lastActive).getTime() > 7 * DAY) reasons.push("Inactive for over 7 days");
      if (recentRate !== null && a.recentTotal >= 10 && recentRate < 0.5) reasons.push("Success rate below 50% in the last 14 days");
      if (a && a.flagged >= 3) reasons.push("Several answers from flagged (proctoring) sessions");
      return {
        id: u._id, fullname: u.fullname, username: u.username, streak: u.streak?.current || 0,
        totalAnswers: a ? a.total : 0, lastActive: a ? a.lastActive : null,
        recentSuccessRate: recentRate, flaggedAnswers: a ? a.flagged : 0,
        abilities: abilityById.get(String(u._id)) || [], reasons,
      };
    });

    res.json({
      success: true,
      class: { id: c._id, name: c.name, joinCode: c.joinCode },
      students: students.sort((x, y) => x.fullname.localeCompare(y.fullname)),
      weakTopics: weak.map((w) => ({
        subject: w._id.subject, topic: w._id.topic, averageAbility: Number(w.avgAbility.toFixed(2)),
        students: w.students, answers: w.attempts,
      })),
      needsAttention: students.filter((s) => s.reasons.length).map((s) => ({ id: s.id, fullname: s.fullname, reasons: s.reasons })),
    });
  } catch (error) {
    console.error("Class overview error:", error);
    res.status(500).json({ success: false, message: "Failed to load class overview" });
  }
};

/* ---------------- teacher: one student in detail ---------------- */
exports.studentDetail = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId) || !c.students.some((s) => String(s) === studentId)) {
      return res.status(404).json({ success: false, message: "Student is not in this class" });
    }

    const [user, states, recent, attempts, events] = await Promise.all([
      User.findById(studentId).select("fullname username email streak").lean(),
      SkillState.find({ user: studentId, topic: { $ne: OVERALL } }).lean(),
      Response.find({ user: studentId }).sort({ createdAt: -1 }).limit(20)
        .select("subject topic success isCorrect hintsUsed timeTaken trust createdAt").lean(),
      QuizAttempt.find({ user: studentId }).sort({ createdAt: -1 }).limit(10)
        .select("subject topic mode accuracy totalQuestions createdAt").lean(),
      AntiCheatEvent.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(studentId), createdAt: { $gt: new Date(Date.now() - 30 * DAY) } } },
        { $group: { _id: "$eventType", count: { $sum: 1 } } },
      ]),
    ]);
    if (!user) return res.status(404).json({ success: false, message: "Student not found" });

    // The ML service labels each topic strong / developing / needs work (null if it is down).
    let labels = new Map();
    if (states.length) {
      const plan = await ml.tutorPlan(states.map((s) => ({
        topic: `${s.subject} / ${s.topic}`.slice(0, 100), ability: s.ability, attempts: s.attempts || 0,
      })));
      if (plan && plan.topics) labels = new Map(plan.topics.map((t) => [t.topic, t.status]));
    }

    res.json({
      success: true,
      student: { id: user._id, fullname: user.fullname, username: user.username, email: user.email, streak: user.streak?.current || 0 },
      topics: states
        .map((s) => ({
          subject: s.subject, topic: s.topic, ability: Number(s.ability.toFixed(2)), attempts: s.attempts || 0,
          lastPracticedAt: s.lastPracticedAt || null, status: labels.get(`${s.subject} / ${s.topic}`.slice(0, 100)) || null,
        }))
        .sort((a, b) => a.ability - b.ability),
      recentAnswers: recent,
      recentQuizzes: attempts,
      proctoringLast30Days: events.map((e) => ({ eventType: e._id, count: e.count })),
    });
  } catch (error) {
    console.error("Student detail error:", error);
    res.status(500).json({ success: false, message: "Failed to load student" });
  }
};

exports.renameClass = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    const name = String(req.body.name || "").trim().slice(0, 100);
    if (!name) return res.status(400).json({ success: false, message: "Class name is required" });
    c.name = name;
    await c.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to rename class" });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    await c.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to delete class" });
  }
};

exports.regenerateCode = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    c.joinCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    await c.save();
    res.json({ success: true, joinCode: c.joinCode });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to regenerate code" });
  }
};