const mongoose = require("mongoose");

// A platform setting a super admin changed from the screen. One row per setting that differs from the .env default.
// Reset a setting and its row is deleted, so the .env value applies again. See services/settingsService.js.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setting", settingSchema);
