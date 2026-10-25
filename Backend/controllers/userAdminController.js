const mongoose = require("mongoose");
const User = require("../models/User");
const Class = require("../models/Class");
const Question = require("../models/Question");
const Response = require("../models/Response");
const AuditLog = require("../models/AuditLog");
const { escapeRegex } = require("../services/adaptiveService");

const ROLES = ["student", "teacher", "admin", "superadmin"];
const ADMIN_MAY_MANAGE = ["student", "teacher"];     // plain admins can only deal with these two

// Plain admins manage students and teachers only. A super admin manages anyone except themselves.
function canManage(actor, target) {
  if (actor.role === "superadmin") return String(target._id) !== actor.id;
  return ADMIN_MAY_MANAGE.includes(target.role);
}

async function audit(req, action, target, details) {
  try {
    await AuditLog.create({
      actor: req.user.id, actorEmail: req.user.email, action,
      target: target._id, targetEmail: target.email, details,
    });
  } catch (e) {
    console.error("Audit log write failed:", e.message);      // never block the action itself
  }
}

async function loadTarget(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid user id" });
    return null;
  }
  const target = await User.findById(req.params.id).select("fullname email role group disabled");
  if (!target) {
    res.status(404).json({ success: false, message: "User not found" });
    return null;
  }
  return target;
}

/* GET /admin/users?search=&role=&page=1&limit=20 */
exports.listUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = {};
    if (ROLES.includes(req.query.role)) filter.role = req.query.role;
    const search = String(req.query.search || "").trim().slice(0, 100);
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ email: rx }, { fullname: rx }, { username: rx }];
    }
    const [users, total] = await Promise.all([
      User.find(filter).select("fullname username email role group disabled createdAt")
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, page, limit, total, users });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ success: false, message: "Failed to load users" });
  }
};

/* PATCH /admin/users/:id/role   body: { role } */
exports.setRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!ROLES.includes(role)) return res.status(400).json({ success: false, message: `role must be one of ${ROLES.join(", ")}` });
    const target = await loadTarget(req, res);
    if (!target) return;

    if (!canManage(req.user, target)) return res.status(403).json({ success: false, message: "You cannot change this user" });
    if (req.user.role !== "superadmin" && !ADMIN_MAY_MANAGE.includes(role)) {
      return res.status(403).json({ success: false, message: "Only a super admin can assign this role" });
    }
    if (target.role === role) return res.json({ success: true, user: { id: target._id, email: target.email, role } });

    await User.updateOne({ _id: target._id }, { $set: { role } });
    await audit(req, "role_change", target, { from: target.role, to: role });
    res.json({ success: true, user: { id: target._id, email: target.email, role } });
  } catch (error) {
    console.error("Set role error:", error);
    res.status(500).json({ success: false, message: "Failed to change role" });
  }
};

/* PATCH /admin/users/:id/status   body: { disabled: true | false } */
exports.setStatus = async (req, res) => {
  try {
    const { disabled } = req.body;
    if (typeof disabled !== "boolean") return res.status(400).json({ success: false, message: "disabled must be true or false" });
    const target = await loadTarget(req, res);
    if (!target) return;
    if (!canManage(req.user, target)) return res.status(403).json({ success: false, message: "You cannot change this user" });

    const set = { disabled };
    if (disabled) set.tokensValidAfter = new Date();        // kick out any current login
    await User.updateOne({ _id: target._id }, { $set: set });
    await audit(req, disabled ? "disable" : "enable", target, { from: !!target.disabled, to: disabled });
    res.json({ success: true, user: { id: target._id, email: target.email, disabled } });
  } catch (error) {
    console.error("Set status error:", error);
    res.status(500).json({ success: false, message: "Failed to change status" });
  }
};

/* PATCH /admin/users/:id/group   body: { group: "adaptive" | "control" | null }   (pilot study group) */
exports.setGroup = async (req, res) => {
  try {
    const { group } = req.body;
    if (!["adaptive", "control", null].includes(group)) {
      return res.status(400).json({ success: false, message: 'group must be "adaptive", "control" or null' });
    }
    const target = await loadTarget(req, res);
    if (!target) return;

    await User.updateOne({ _id: target._id }, group === null ? { $unset: { group: 1 } } : { $set: { group } });
    await audit(req, "group_change", target, { from: target.group || null, to: group });
    res.json({ success: true, user: { id: target._id, email: target.email, group } });
  } catch (error) {
    console.error("Set group error:", error);
    res.status(500).json({ success: false, message: "Failed to change group" });
  }
};

/* GET /admin/platform-stats   (super admin) */
exports.platformStats = async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 864e5);
    const [roles, disabled, classes, questions, answers7, active7] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
      User.countDocuments({ disabled: true }),
      Class.countDocuments(),
      Question.aggregate([{ $group: { _id: { $ifNull: ["$status", "approved"] }, n: { $sum: 1 } } }]),
      Response.countDocuments({ createdAt: { $gt: since } }),
      Response.aggregate([{ $match: { createdAt: { $gt: since } } }, { $group: { _id: "$user" } }, { $count: "n" }]),
    ]);
    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
    res.json({
      success: true,
      users: { byRole: toMap(roles), disabled },
      classes,
      questions: toMap(questions),
      last7Days: { answers: answers7, activeStudents: active7[0] ? active7[0].n : 0 },
    });
  } catch (error) {
    console.error("Platform stats error:", error);
    res.status(500).json({ success: false, message: "Failed to load platform stats" });
  }
};

/* GET /admin/audit-log?limit=50   (super admin) */
exports.auditLog = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const entries = await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load audit log" });
  }
};