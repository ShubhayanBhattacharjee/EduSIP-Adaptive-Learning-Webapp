const mongoose = require("mongoose");

// Who changed what, and when. Written by the user-management routes; only a super admin can read it.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorEmail: String,
    action: { type: String, required: true },      // role_change | disable | enable | group_change
    target: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetEmail: String,
    details: mongoose.Schema.Types.Mixed,          // { from, to }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);