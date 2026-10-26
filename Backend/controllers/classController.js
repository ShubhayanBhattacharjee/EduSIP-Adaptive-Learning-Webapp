const crypto = require("crypto");
const mongoose = require("mongoose");
const Class = require("../models/Class");
const User = require("../models/User");
const Response = require("../models/Response");
const SkillState = require("../models/SkillState");
const QuizAttempt = require("../models/QuizAttempt");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const Assignment = require("../models/Assignment");
const Question = require("../models/Question");
const ml = require("../services/mlService");
const { OVERALL, ci, toScale, bandOf } = require("../services/adaptiveService");

const DAY = 864e5;
const isStaffRole = (r) => ["admin", "superadmin"].includes(r);

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
    if (req.body.consent !== true) {
      return res.status(400).json({ success: false, code: "CONSENT_REQUIRED", message: "Please confirm that your teacher may see your progress" });
    }

    const c = await Class.findOneAndUpdate({ joinCode: code }, { $addToSet: { students: req.user.id } }, { new: true })
      .populate("teacher", "fullname");
    if (!c) return res.status(404).json({ success: false, message: "No class with that code" });
    await User.updateOne({ _id: req.user.id }, { $set: { consentAt: new Date() } });

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
    res.json({
      success: true,
      classes: classes.map((c) => ({
        id: c._id, name: c.name, teacher: c.teacher?.fullname,
        announcements: (c.announcements || []).slice(-3).reverse().map((a) => ({ id: a._id, text: a.text, createdAt: a.createdAt })),
      })),
    });
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
   One row per student, the weakest topics across the class, who needs attention, and the class trends. */
async function buildOverview(c) {
  const ids = c.students;
  const base = { class: { id: c._id, name: c.name, joinCode: c.joinCode }, announcements: [] };
  base.announcements = (c.announcements || []).slice().reverse().map((a) => ({ id: a._id, text: a.text, createdAt: a.createdAt }));
  if (!ids.length) {
    return { ...base, students: [], weakTopics: [], needsAttention: [], levelDistribution: Array(10).fill(0), activityByDay: [], topicTrends: [] };
  }

  const since = new Date(Date.now() - 14 * DAY);
  const since28 = new Date(Date.now() - 28 * DAY);
  const yes = { $cond: [{ $eq: ["$success", true] }, 1, 0] };
  const [users, overall, activity, weak, daily, trends] = await Promise.all([
    User.find({ _id: { $in: ids } }).select("fullname username streak").lean(),
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
    Response.aggregate([
      { $match: { user: { $in: ids }, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, answers: { $sum: 1 }, successes: { $sum: yes }, students: { $addToSet: "$user" } } },
      { $sort: { _id: 1 } },
    ]),
    Response.aggregate([
      { $match: { user: { $in: ids }, createdAt: { $gte: since28 } } },
      {
        $group: {
          _id: { subject: "$subject", topic: "$topic" },
          nowAnswers: { $sum: { $cond: [{ $gte: ["$createdAt", since] }, 1, 0] } },
          nowSuccess: { $sum: { $cond: [{ $and: [{ $gte: ["$createdAt", since] }, { $eq: ["$success", true] }] }, 1, 0] } },
          beforeAnswers: { $sum: { $cond: [{ $lt: ["$createdAt", since] }, 1, 0] } },
          beforeSuccess: { $sum: { $cond: [{ $and: [{ $lt: ["$createdAt", since] }, { $eq: ["$success", true] }] }, 1, 0] } },
        },
      },
      { $match: { "_id.topic": { $ne: null }, nowAnswers: { $gte: 5 } } },
    ]),
  ]);

  const actById = new Map(activity.map((a) => [String(a._id), a]));
  const abilityById = new Map();
  for (const s of overall) {
    const k = String(s.user);
    if (!abilityById.has(k)) abilityById.set(k, []);
    abilityById.get(k).push({ subject: s.subject, ability: Number(s.ability.toFixed(2)), level: toScale(s.ability), attempts: s.attempts || 0 });
  }

  // how many students sit at each level 1..10 (weighted by how much each subject was practised)
  const levelDistribution = Array(10).fill(0);
  for (const rows of abilityById.values()) {
    const w = rows.map((r) => Math.max(r.attempts, 1));
    const ability = rows.reduce((sum, r, i) => sum + r.ability * w[i], 0) / w.reduce((x, y) => x + y, 0);
    levelDistribution[toScale(ability) - 1] += 1;
  }

  // last 14 days, one entry per day, zeros included
  const dailyMap = new Map(daily.map((d) => [d._id, d]));
  const activityByDay = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    const d = dailyMap.get(key);
    activityByDay.push({ date: key, answers: d ? d.answers : 0, successRate: d && d.answers ? Number((d.successes / d.answers).toFixed(2)) : null, activeStudents: d ? d.students.length : 0 });
  }

  const topicTrends = trends
    .map((t) => {
      const rate = t.nowSuccess / t.nowAnswers;
      const prev = t.beforeAnswers >= 5 ? t.beforeSuccess / t.beforeAnswers : null;
      return {
        subject: t._id.subject, topic: t._id.topic, answers: t.nowAnswers, successRate: Number(rate.toFixed(2)),
        change: prev === null ? null : Number((rate - prev).toFixed(2)),
      };
    })
    .sort((x, y) => x.successRate - y.successRate)
    .slice(0, 10);

  const now = Date.now();
  const students = users.map((u) => {
    const a = actById.get(String(u._id));
    const recentRate = a && a.recentTotal >= 5 ? Number((a.recentSuccess / a.recentTotal).toFixed(2)) : null;
    const reasons = [];
    if (!a) reasons.push("No answers yet");
    else if (now - new Date(a.lastActive).getTime() > 7 * DAY) reasons.push("Inactive for over 7 days");
    if (recentRate !== null && a.recentTotal >= 10 && recentRate < 0.5) reasons.push("Success rate below 50% in the last 14 days");
    if (a && a.flagged >= 3) reasons.push("Several answers from flagged (proctoring) sessions");
    const abilities = abilityById.get(String(u._id)) || [];
    return {
      id: u._id, fullname: u.fullname, username: u.username, streak: u.streak?.current || 0,
      totalAnswers: a ? a.total : 0, lastActive: a ? a.lastActive : null,
      recentSuccessRate: recentRate, flaggedAnswers: a ? a.flagged : 0,
      abilities, reasons,
    };
  });

  return {
    ...base,
    students: students.sort((x, y) => x.fullname.localeCompare(y.fullname)),
    weakTopics: weak.map((w) => ({
      subject: w._id.subject, topic: w._id.topic, averageAbility: Number(w.avgAbility.toFixed(2)),
      level: toScale(w.avgAbility), students: w.students, answers: w.attempts,
    })),
    needsAttention: students.filter((x) => x.reasons.length).map((x) => ({ id: x.id, fullname: x.fullname, reasons: x.reasons })),
    levelDistribution, activityByDay, topicTrends,
  };
}

exports.overview = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    res.json({ success: true, ...(await buildOverview(c)) });
  } catch (error) {
    console.error("Class overview error:", error);
    res.status(500).json({ success: false, message: "Failed to load class overview" });
  }
};

/* ---------------- teacher: export the class as a CSV ---------------- */
const csvCell = (v) => {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;            // stop spreadsheet formula injection
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

exports.exportClass = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    const o = await buildOverview(c);
    const head = ["Name", "Username", "Total answers", "Last active", "Success rate last 14 days (%)", "Flagged answers", "Streak (days)", "Levels (1-10)", "Needs attention"];
    const rows = o.students.map((s) => [
      s.fullname, s.username, s.totalAnswers, s.lastActive ? new Date(s.lastActive).toISOString().slice(0, 10) : "",
      s.recentSuccessRate === null ? "" : Math.round(s.recentSuccessRate * 100), s.flaggedAnswers, s.streak,
      s.abilities.map((a) => `${a.subject}: ${a.level}`).join("; "), s.reasons.join("; "),
    ]);
    const csv = "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const safe = c.name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || "class";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("Export class error:", error);
    res.status(500).json({ success: false, message: "Failed to export class" });
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

    const [user, states, recent, attempts, events, flagged, flaggedEvents, levels] = await Promise.all([
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
      Response.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(studentId), trust: { $lt: 1 }, sessionId: { $ne: null } } },
        { $group: { _id: "$sessionId", answers: { $sum: 1 }, trust: { $min: "$trust" }, at: { $max: "$createdAt" }, subject: { $first: "$subject" }, topic: { $first: "$topic" }, mode: { $first: "$mode" } } },
        { $sort: { at: -1 } },
        { $limit: 10 },
      ]),
      AntiCheatEvent.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(studentId), sessionId: { $ne: null }, createdAt: { $gt: new Date(Date.now() - 60 * DAY) } } },
        { $group: { _id: { s: "$sessionId", t: "$eventType" }, n: { $sum: 1 } } },
      ]),
      SkillState.find({ user: studentId, topic: OVERALL }).lean(),
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
      // a teacher does not need the student's email address; only admins see it
      student: { id: user._id, fullname: user.fullname, username: user.username, ...(isStaffRole(req.user.role) ? { email: user.email } : {}), streak: user.streak?.current || 0 },
      levels: levels.map((l) => ({ subject: l.subject, level: toScale(l.ability), band: bandOf(toScale(l.ability)), answers: l.attempts || 0 })),
      flaggedSessions: flagged.map((f) => ({
        sessionId: f._id, at: f.at, subject: f.subject, topic: f.topic, mode: f.mode, answers: f.answers, trust: f.trust,
        events: flaggedEvents.filter((e) => e._id.s === f._id).map((e) => ({ eventType: e._id.t, count: e.n })),
      })),
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

/* ---------------- announcements (teacher writes, students read) ---------------- */
exports.addAnnouncement = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    const text = String(req.body.text || "").trim().slice(0, 500);
    if (!text) return res.status(400).json({ success: false, message: "Write something first" });
    c.announcements.push({ text });
    if (c.announcements.length > 30) c.announcements = c.announcements.slice(-30);
    await c.save();
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to post" });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    await Class.updateOne({ _id: c._id }, { $pull: { announcements: { _id: req.params.aid } } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to delete" });
  }
};

/* ---------------- assignments ---------------- */
// the filter that decides "this student finished this assignment"
const doneFilter = (a, userFilter) => {
  const f = { ...userFilter, subject: ci(a.subject), mode: a.mode, createdAt: { $gte: a.createdAt } };
  if (a.mode === "practice") f.topic = ci(a.topic);
  return f;
};

exports.createAssignment = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    const title = String(req.body.title || "").trim().slice(0, 120);
    const mode = req.body.mode === "level" ? "level" : "practice";
    const subjectIn = String(req.body.subject || "").trim();
    const topicIn = String(req.body.topic || "").trim();
    if (!title || !subjectIn || (mode === "practice" && !topicIn)) {
      return res.status(400).json({ success: false, message: "Title, subject and (for practice) topic are required" });
    }
    const APPROVED = { $nin: ["pending", "rejected"] };
    const found = await Question.findOne({ subject: ci(subjectIn), ...(mode === "practice" ? { topic: ci(topicIn) } : {}), status: APPROVED }).select("subject topic").lean();
    if (!found) return res.status(404).json({ success: false, message: "No questions exist for that subject/topic" });

    const questions = Math.min(Math.max(parseInt(req.body.questions, 10) || 10, 3), 40);
    const minutes = Math.min(Math.max(parseInt(req.body.minutes, 10) || 0, 0), 240);
    let dueAt;
    if (req.body.dueAt) {
      dueAt = new Date(req.body.dueAt);
      if (isNaN(dueAt.getTime())) return res.status(400).json({ success: false, message: "Invalid due date" });
    }
    const a = await Assignment.create({
      class: c._id, teacher: req.user.id, title, subject: found.subject, topic: mode === "practice" ? found.topic : "", mode, questions, minutes, dueAt,
    });
    res.status(201).json({ success: true, assignment: { id: a._id } });
  } catch (error) {
    console.error("Create assignment error:", error);
    res.status(500).json({ success: false, message: "Failed to create assignment" });
  }
};

exports.listAssignments = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    const list = await Assignment.find({ class: c._id }).sort({ createdAt: -1 }).limit(50).lean();
    const names = new Map((await User.find({ _id: { $in: c.students } }).select("fullname").lean()).map((u) => [String(u._id), u.fullname]));
    const out = [];
    for (const a of list) {
      const doneIds = (await QuizAttempt.distinct("user", doneFilter(a, { user: { $in: c.students } }))).map(String);
      const done = new Set(doneIds);
      out.push({
        id: a._id, title: a.title, subject: a.subject, topic: a.topic, mode: a.mode, questions: a.questions, minutes: a.minutes,
        dueAt: a.dueAt || null, createdAt: a.createdAt,
        completed: done.size, total: c.students.length,
        notDone: c.students.map(String).filter((id) => !done.has(id)).map((id) => names.get(id)).filter(Boolean),
      });
    }
    res.json({ success: true, assignments: out });
  } catch (error) {
    console.error("List assignments error:", error);
    res.status(500).json({ success: false, message: "Failed to load assignments" });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const c = await loadOwnClass(req, res);
    if (!c) return;
    if (!mongoose.isValidObjectId(req.params.aid)) return res.status(400).json({ success: false, message: "Invalid assignment id" });
    await Assignment.deleteOne({ _id: req.params.aid, class: c._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete assignment" });
  }
};

// student: everything assigned to the classes I am in, with done / not done
exports.myAssignments = async (req, res) => {
  try {
    const classes = await Class.find({ students: req.user.id }).select("name").lean();
    if (!classes.length) return res.json({ success: true, assignments: [] });
    const nameById = new Map(classes.map((c) => [String(c._id), c.name]));
    const list = await Assignment.find({ class: { $in: classes.map((c) => c._id) } }).sort({ createdAt: -1 }).limit(30).lean();
    const out = [];
    for (const a of list) {
      const done = await QuizAttempt.exists(doneFilter(a, { user: req.user.id }));
      out.push({
        id: a._id, className: nameById.get(String(a.class)), title: a.title, subject: a.subject, topic: a.topic, mode: a.mode,
        questions: a.questions, minutes: a.minutes, dueAt: a.dueAt || null, createdAt: a.createdAt, done: !!done,
        overdue: !done && !!a.dueAt && new Date(a.dueAt) < new Date(),
      });
    }
    res.json({ success: true, assignments: out });
  } catch (error) {
    console.error("My assignments error:", error);
    res.status(500).json({ success: false, message: "Failed to load assignments" });
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