const mongoose = require("mongoose");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { escapeRegex } = require("../services/adaptiveService");

const ROLES = ["student", "teacher", "admin", "superadmin"];
const ADMIN_MAY_MANAGE = ["student", "teacher"];     // plain admins can only deal with these two

// Plain admins manage students and teachers only. A super admin manages anyone except themselves.
function canManage(actor, target) {
  if (actor.role === "superadmin") return String(target._id) !== actor.id;
  return ADMIN_MAY_MANAGE.includes(target.role);
}

const audit = (req, action, target, details) => AuditLog.record(req, action, target, details, "user");   // never blocks the action itself

// A super admin may never be demoted or disabled if that leaves the platform with no active super admin.
async function leavesNoSuperadmin(target) {
  if (target.role !== "superadmin") return false;
  return (await User.countDocuments({ role: "superadmin", disabled: { $ne: true }, _id: { $ne: target._id } })) === 0;
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
    if (req.query.status === "disabled") filter.disabled = true;
    if (req.query.status === "unverified") filter.emailVerified = false;
    if (req.query.pendingTeachers === "1") { filter.role = "teacher"; filter.teacherApproved = false; }
    if (["adaptive", "control"].includes(req.query.group)) filter.group = req.query.group;
    const search = String(req.query.search || "").trim().slice(0, 100);
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ email: rx }, { fullname: rx }, { username: rx }];
    }
    const [users, total] = await Promise.all([
      User.find(filter).select("fullname username email role group disabled teacherApproved emailVerified placement.done placement.level createdAt")
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({
      success: true, page, limit, total,
      users: users.map((u) => ({
        ...u,
        placementDone: !!(u.placement && u.placement.done),
        canManage: canManage(req.user, u),            // the buttons the admin may use on this row
        isYou: String(u._id) === req.user.id,
      })),
    });
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
    if (role !== "superadmin" && (await leavesNoSuperadmin(target))) {
      return res.status(409).json({ success: false, message: "This is the last active super admin" });
    }

    const set = { role };
    const isStaff = (r) => ["admin", "superadmin"].includes(r);
    if (isStaff(role) !== isStaff(target.role)) set.tokensValidAfter = new Date();   // moving in or out of staff: old logins stop working
    if (role === "teacher") set.teacherApproved = true;          // an admin who makes someone a teacher approves them
    await User.updateOne({ _id: target._id }, { $set: set });
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

    if (disabled && (await leavesNoSuperadmin(target))) {
      return res.status(409).json({ success: false, message: "This is the last active super admin" });
    }
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

/* PATCH /admin/users/:id/verify-email : mark an email as verified by hand (when the mail never arrives) */
exports.verifyEmailByAdmin = async (req, res) => {
  try {
    const target = await loadTarget(req, res);
    if (!target) return;
    if (!canManage(req.user, target)) return res.status(403).json({ success: false, message: "You cannot change this user" });
    await User.updateOne({ _id: target._id }, { $set: { emailVerified: true } });
    await audit(req, "email_verified_by_admin", target, {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to verify email" });
  }
};

/* PATCH /admin/users/:id/teacher-approval   body: { approved: true | false } */
exports.setTeacherApproval = async (req, res) => {
  try {
    const { approved } = req.body;
    if (typeof approved !== "boolean") return res.status(400).json({ success: false, message: "approved must be true or false" });
    const target = await loadTarget(req, res);
    if (!target) return;
    if (target.role !== "teacher") return res.status(400).json({ success: false, message: "This user is not a teacher" });
    await User.updateOne({ _id: target._id }, { $set: { teacherApproved: approved } });
    await audit(req, approved ? "teacher_approved" : "teacher_revoked", target, { to: approved });
    res.json({ success: true, user: { id: target._id, email: target.email, teacherApproved: approved } });
  } catch (error) {
    console.error("Teacher approval error:", error);
    res.status(500).json({ success: false, message: "Failed to change approval" });
  }
};
