const mongoose = require("mongoose");

// Who changed what, and when. Written by the admin and super admin routes and by staff login; only a super admin can read it.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorEmail: String,
    action: { type: String, required: true },      // role_change | disable | enable | staff_created | settings_change | ...
    category: { type: String, default: "user" },   // user | staff | auth | class | settings | system
    target: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetEmail: String,
    details: mongoose.Schema.Types.Mixed,          // { from, to } and similar
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorEmail: 1, createdAt: -1 });

// AuditLog.record(req, "role_change", targetUserOrNull, { from, to }, "user")
// Never throws: a failed log write must not block the action itself.
auditLogSchema.statics.record = async function (req, action, target, details, category = "user") {
  try {
    await this.create({
      actor: req.user && req.user.id, actorEmail: req.user && req.user.email,
      action, category,
      target: target && target._id, targetEmail: target && target.email,
      details,
      ip: req.ip, userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    });
  } catch (e) {
    console.error("Audit log write failed:", e.message);
  }
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
