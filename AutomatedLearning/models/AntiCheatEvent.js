const mongoose = require("mongoose");

// Proctoring events saved to the database (they were only console.log before).
const antiCheatEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, index: true },
    eventType: { type: String, required: true },   // tab_switch, multiple_faces, ...
    details: mongoose.Schema.Types.Mixed,
    clientTime: Date,
    violationCount: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("AntiCheatEvent", antiCheatEventSchema);