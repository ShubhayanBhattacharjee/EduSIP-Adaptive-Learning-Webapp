const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Class = require("../models/Class");
const Assignment = require("../models/Assignment");
const Question = require("../models/Question");
const Response = require("../models/Response");
const SkillState = require("../models/SkillState");
const Exposure = require("../models/Exposure");
const QuizAttempt = require("../models/QuizAttempt");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const Performance = require("../models/Performance");
const AuditLog = require("../models/AuditLog");
const settings = require("../services/settingsService");
const ml = require("../services/mlService");
const { uniqueUsername } = require("../utils/username");
const { escapeRegex } = require("../services/adaptiveService");

// Everything here is for the platform owner(s) only (routes/superAdminRoutes.js puts protect + superAdminMiddleware in front).
const STAFF_ROLES = ["admin", "superadmin"];
const MIN_STAFF_PASSWORD = 12;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const serverError = (res, label, message) => (error) => {
  console.error(`${label}:`, error);
  res.status(500).json({ success: false, message });
};
const page = (q, max = 50, def = 20) => ({
  page: Math.max(parseInt(q.page, 10) || 1, 1),
  limit: Math.min(Math.max(parseInt(q.limit, 10) || def, 1), max),
});

async function loadUser(req, res, fields = "fullname email role disabled") {
  if (!mongoose.isValidObjectId(req.params.id)) { fail(res, 400, "Invalid id"); return null; }
  const u = await User.findById(req.params.id).select(fields);
  if (!u) { fail(res, 404, "User not found"); return null; }
  return u;
}

// True when this user is the only active super admin left (they must not be deleted).
async function isLastSuperadmin(user) {
  if (user.role !== "superadmin") return false;
  const others = await User.countDocuments({ role: "superadmin", disabled: { $ne: true }, _id: { $ne: user._id } });
  return others === 0;
}

/* ============================== OVERVIEW ============================== */

const dayKey = (d) => d.toISOString().slice(0, 10);

// Fill every day in the range, so the chart has no holes.
function fillDays(rows, days) {
  const map = new Map(rows.map((r) => [r._id, r.n]));
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(today.getTime() - i * 864e5));
    out.push({ date: k, count: map.get(k) || 0 });
  }
  return out;
}

/* GET /superadmin/overview */
exports.overview = async (req, res) => {
  try {
    const DAYS = 30;
    const since7 = new Date(Date.now() - 7 * 864e5);
    const sinceTrend = new Date(Date.now() - (DAYS - 1) * 864e5);
    sinceTrend.setUTCHours(0, 0, 0, 0);
    const perDay = () => [
      { $match: { createdAt: { $gte: sinceTrend } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
    ];
    const [roles, disabled, unverified, pendingTeachers, classes, questions, answers7, active7, signups, answers, recent] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
      User.countDocuments({ disabled: true }),
      User.countDocuments({ emailVerified: false }),
      User.countDocuments({ role: "teacher", teacherApproved: false }),
      Class.countDocuments(),
      Question.aggregate([{ $group: { _id: { $ifNull: ["$status", "approved"] }, n: { $sum: 1 } } }]),
      Response.countDocuments({ createdAt: { $gt: since7 } }),
      Response.aggregate([{ $match: { createdAt: { $gt: since7 } } }, { $group: { _id: "$user" } }, { $count: "n" }]),
      User.aggregate(perDay()),
      Response.aggregate(perDay()),
      AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
    ]);
    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
    res.json({
      success: true,
      users: { byRole: toMap(roles), disabled, unverified, pendingTeachers },
      classes,
      questions: toMap(questions),
      last7Days: { answers: answers7, activeStudents: active7[0] ? active7[0].n : 0 },
      trends: { days: DAYS, signups: fillDays(signups, DAYS), answers: fillDays(answers, DAYS) },
      recentActivity: recent,
    });
  } catch (e) { serverError(res, "Overview error", "Failed to load the overview")(e); }
};

/* ============================== STAFF ============================== */

/* GET /superadmin/staff */
exports.listStaff = async (req, res) => {
  try {
    const staff = await User.find({ role: { $in: STAFF_ROLES } })
      .select("fullname username email role disabled lastLoginAt createdAt createdBy")
      .populate("createdBy", "email")
      .sort({ role: -1, createdAt: 1 })
      .lean();
    res.json({
      success: true,
      staff: staff.map((u) => ({
        ...u,
        createdByEmail: u.createdBy ? u.createdBy.email : null,
        createdBy: undefined,
        isYou: String(u._id) === req.user.id,
      })),
    });
  } catch (e) { serverError(res, "List staff error", "Failed to load staff")(e); }
};

/* POST /superadmin/staff   body: { fullname, email, password, role }
   Creates an admin or super admin who signs in at /staff/login. An email that already exists is refused (change that person's role in the Users page instead). */
exports.createStaff = async (req, res) => {
  try {
    const fullname = String(req.body.fullname || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "admin");

    if (fullname.length < 2 || fullname.length > 100) return fail(res, 400, "Enter the full name (2 to 100 characters)");
    if (!EMAIL_RX.test(email)) return fail(res, 400, "Enter a valid email address");
    if (!STAFF_ROLES.includes(role)) return fail(res, 400, "role must be admin or superadmin");
    if (password.length < MIN_STAFF_PASSWORD) return fail(res, 400, `The password must have at least ${MIN_STAFF_PASSWORD} characters`);
    if (await User.exists({ email })) return fail(res, 409, "An account with this email already exists");

    const user = await User.create({
      fullname, email, role,
      password: await bcrypt.hash(password, 10),
      emailVerified: true,
      username: await uniqueUsername(email),
      createdBy: req.user.id,
    });
    await AuditLog.record(req, "staff_created", user, { role }, "staff");
    res.status(201).json({ success: true, user: { id: user._id, fullname, email, role } });
  } catch (e) {
    if (e && e.code === 11000) return fail(res, 409, "An account with this email already exists");
    serverError(res, "Create staff error", "Failed to create the account")(e);
  }
};

/* POST /superadmin/staff/:id/reset-password   body: { password }
   Sets a new password and cancels every login the account has. */
exports.resetStaffPassword = async (req, res) => {
  try {
    const password = String(req.body.password || "");
    if (password.length < MIN_STAFF_PASSWORD) return fail(res, 400, `The password must have at least ${MIN_STAFF_PASSWORD} characters`);
    const target = await loadUser(req, res);
    if (!target) return;
    if (!STAFF_ROLES.includes(target.role)) return fail(res, 400, "This is not a staff account");

    await User.updateOne({ _id: target._id }, { $set: { password: await bcrypt.hash(password, 10), tokensValidAfter: new Date() } });
    await AuditLog.record(req, "staff_password_reset", target, { self: String(target._id) === req.user.id }, "staff");
    res.json({ success: true, signedOut: true });
  } catch (e) { serverError(res, "Reset password error", "Failed to reset the password")(e); }
};

/* ============================== USERS (extra powers) ============================== */

/* POST /superadmin/users/:id/force-logout : cancels every login the account has */
exports.forceLogout = async (req, res) => {
  try {
    const target = await loadUser(req, res);
    if (!target) return;
    if (String(target._id) === req.user.id) return fail(res, 400, "You cannot sign yourself out here");
    await User.updateOne({ _id: target._id }, { $set: { tokensValidAfter: new Date() } });
    await AuditLog.record(req, "force_logout", target, {}, "user");
    res.json({ success: true });
  } catch (e) { serverError(res, "Force logout error", "Failed to sign the user out")(e); }
};

/* DELETE /superadmin/users/:id   body: { confirmEmail }
   Permanently removes the account and its learning data. The audit log keeps the email. */
exports.deleteUser = async (req, res) => {
  try {
    const target = await loadUser(req, res);
    if (!target) return;
    if (String(target._id) === req.user.id) return fail(res, 400, "You cannot delete your own account");
    if (String(req.body.confirmEmail || "").trim().toLowerCase() !== target.email) {
      return fail(res, 400, "Type the user's email to confirm the deletion");
    }
    if (await isLastSuperadmin(target)) return fail(res, 409, "This is the last active super admin");
    const owned = await Class.countDocuments({ teacher: target._id });
    if (owned) return fail(res, 409, `This teacher still owns ${owned} class(es). Move or delete them first (Classes page).`);

    const uid = target._id;
    const counts = {};
    for (const [name, Model] of [["responses", Response], ["skills", SkillState], ["exposures", Exposure], ["attempts", QuizAttempt], ["antiCheat", AntiCheatEvent], ["performance", Performance]]) {
      counts[name] = (await Model.deleteMany({ user: uid })).deletedCount;
    }
    await Class.updateMany({ students: uid }, { $pull: { students: uid } });
    await AuditLog.record(req, "user_deleted", target, { role: target.role, removed: counts }, "user");   // written before the account is gone
    await User.deleteOne({ _id: uid });
    res.json({ success: true, removed: counts });
  } catch (e) { serverError(res, "Delete user error", "Failed to delete the user")(e); }
};

/* ============================== CLASSES ============================== */

/* GET /superadmin/classes?search=&page=1&limit=20 */
exports.listClasses = async (req, res) => {
  try {
    const { page: pg, limit } = page(req.query);
    const search = String(req.query.search || "").trim().slice(0, 100);
    const filter = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      const teachers = await User.find({ role: "teacher", $or: [{ email: rx }, { fullname: rx }] }).select("_id").limit(200).lean();
      filter.$or = [{ name: rx }, { joinCode: rx }, { teacher: { $in: teachers.map((t) => t._id) } }];
    }
    const [rows, total] = await Promise.all([
      Class.find(filter).populate("teacher", "fullname email disabled").sort({ createdAt: -1 })
        .skip((pg - 1) * limit).limit(limit).lean(),
      Class.countDocuments(filter),
    ]);
    res.json({
      success: true, page: pg, limit, total,
      classes: rows.map((c) => ({
        _id: c._id, name: c.name, joinCode: c.joinCode, createdAt: c.createdAt,
        teacher: c.teacher || null,
        studentCount: (c.students || []).length,
        announcements: (c.announcements || []).length,
      })),
    });
  } catch (e) { serverError(res, "List classes error", "Failed to load classes")(e); }
};

async function loadClass(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { fail(res, 400, "Invalid class id"); return null; }
  const c = await Class.findById(req.params.id).populate("teacher", "email");
  if (!c) { fail(res, 404, "Class not found"); return null; }
  return c;
}

/* DELETE /superadmin/classes/:id : removes the class and its assignments (students keep their own learning data) */
exports.deleteClass = async (req, res) => {
  try {
    const c = await loadClass(req, res);
    if (!c) return;
    const assignments = (await Assignment.deleteMany({ class: c._id })).deletedCount;
    await Class.deleteOne({ _id: c._id });
    await AuditLog.record(req, "class_deleted", null, { name: c.name, teacher: c.teacher && c.teacher.email, students: c.students.length, assignments }, "class");
    res.json({ success: true, assignments });
  } catch (e) { serverError(res, "Delete class error", "Failed to delete the class")(e); }
};

/* PATCH /superadmin/classes/:id/teacher   body: { teacherId } : hand a class (and its assignments) to another teacher */
exports.transferClass = async (req, res) => {
  try {
    const c = await loadClass(req, res);
    if (!c) return;
    if (!mongoose.isValidObjectId(req.body.teacherId)) return fail(res, 400, "Choose a teacher");
    const teacher = await User.findById(req.body.teacherId).select("fullname email role disabled teacherApproved");
    if (!teacher || teacher.role !== "teacher") return fail(res, 400, "The new owner must be a teacher");
    if (teacher.disabled) return fail(res, 400, "That teacher account is disabled");
    if (teacher.teacherApproved === false) return fail(res, 400, "That teacher is not approved yet");

    const from = c.teacher && c.teacher.email;
    await Class.updateOne({ _id: c._id }, { $set: { teacher: teacher._id } });
    await Assignment.updateMany({ class: c._id }, { $set: { teacher: teacher._id } });
    await AuditLog.record(req, "class_transferred", teacher, { name: c.name, from, to: teacher.email }, "class");
    res.json({ success: true, teacher: { _id: teacher._id, fullname: teacher.fullname, email: teacher.email } });
  } catch (e) { serverError(res, "Transfer class error", "Failed to move the class")(e); }
};

/* GET /superadmin/teachers : approved, enabled teachers (for the "move class to" picker) */
exports.listTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher", disabled: { $ne: true }, teacherApproved: { $ne: false } })
      .select("fullname email").sort({ fullname: 1 }).limit(500).lean();
    res.json({ success: true, teachers });
  } catch (e) { serverError(res, "List teachers error", "Failed to load teachers")(e); }
};

/* ============================== AUDIT LOG ============================== */

function auditFilter(q) {
  const filter = {};
  if (q.action) filter.action = String(q.action).slice(0, 60);
  if (q.category) filter.category = String(q.category).slice(0, 30);
  const search = String(q.search || "").trim().slice(0, 100);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ actorEmail: rx }, { targetEmail: rx }];
  }
  const range = {};
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (from && !isNaN(from)) range.$gte = from;
  if (to && !isNaN(to)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) to.setUTCDate(to.getUTCDate() + 1);   // a plain date means the whole day
    range.$lt = to;
  }
  if (range.$gte || range.$lt) filter.createdAt = range;
  return filter;
}

// A cell that starts with = + - @ would run as a formula when the CSV is opened in Excel.
const csvCell = (v) => {
  let s = v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/* GET /superadmin/audit-log?action=&category=&search=&from=&to=&page=1&limit=50
   GET /superadmin/audit-log?format=csv&...   (up to 5000 rows) */
exports.auditLog = async (req, res) => {
  try {
    const filter = auditFilter(req.query);

    if (req.query.format === "csv") {
      const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
      const head = ["time", "actor", "action", "category", "target", "ip", "details"];
      const lines = [head.map(csvCell).join(",")].concat(
        rows.map((r) => [r.createdAt && r.createdAt.toISOString(), r.actorEmail, r.action, r.category, r.targetEmail, r.ip, r.details].map(csvCell).join(","))
      );
      await AuditLog.record(req, "audit_export", null, { rows: rows.length, filter: req.query }, "system");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${dayKey(new Date())}.csv"`);
      return res.send(lines.join("\r\n"));
    }

    const { page: pg, limit } = page(req.query, 100, 50);
    const [entries, total, actions] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct("action"),
    ]);
    res.json({ success: true, page: pg, limit, total, entries, actions: actions.sort() });
  } catch (e) { serverError(res, "Audit log error", "Failed to load the audit log")(e); }
};

/* ============================== SETTINGS ============================== */

/* GET /superadmin/settings */
exports.getSettings = (req, res) => res.json({ success: true, settings: settings.getAll() });

/* PUT /superadmin/settings   body: { changes: { requirePlacement: true, placementSize: 12 } }
   Every value is checked first; if one is bad nothing is saved. */
exports.updateSettings = async (req, res) => {
  try {
    const changes = req.body && req.body.changes;
    if (!changes || typeof changes !== "object" || Array.isArray(changes) || !Object.keys(changes).length) {
      return fail(res, 400, "Nothing to change");
    }
    const cleaned = {};
    for (const [k, v] of Object.entries(changes)) cleaned[k] = settings.clean(k, v);   // throws 400 on a bad key or value

    const before = {}, after = {};
    for (const [k, v] of Object.entries(cleaned)) {
      before[k] = settings.get(k);
      if (before[k] === v) continue;
      await settings.set(k, v, req.user.id);
      after[k] = v;
    }
    if (Object.keys(after).length) await AuditLog.record(req, "settings_change", null, { before: pick(before, after), after }, "settings");
    res.json({ success: true, settings: settings.getAll() });
  } catch (e) {
    if (e.status === 400) return fail(res, 400, e.message);
    serverError(res, "Update settings error", "Failed to save the settings")(e);
  }
};
const pick = (obj, keysFrom) => Object.fromEntries(Object.keys(keysFrom).map((k) => [k, obj[k]]));

/* DELETE /superadmin/settings/:key : back to the .env value */
exports.resetSetting = async (req, res) => {
  try {
    const before = settings.get(req.params.key);
    await settings.reset(req.params.key);
    await AuditLog.record(req, "settings_reset", null, { key: req.params.key, before, after: settings.get(req.params.key) }, "settings");
    res.json({ success: true, settings: settings.getAll() });
  } catch (e) {
    if (e.status === 400 || /Unknown setting/.test(e.message)) return fail(res, 400, e.message);
    serverError(res, "Reset setting error", "Failed to reset the setting")(e);
  }
};

/* ============================== ML ============================== */

/* GET /superadmin/ml/info */
exports.mlInfo = async (req, res) => {
  try {
    const [health, info] = await Promise.all([ml.health(), ml.modelInfo()]);
    res.json({ success: true, up: !!health, health, info });
  } catch (e) { serverError(res, "ML info error", "Failed to read the ML service")(e); }
};
