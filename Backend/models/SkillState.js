const mongoose = require("mongoose");

// One row per student per topic: how strong the student is there (Elo ability).
// topic "__overall__" holds the subject-wide ability used by the level test.
const skillStateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
    ability: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    lastPracticedAt: { type: Date },
    placed: { type: Boolean, default: false },   // this ability was first set by the placement test
  },
  { timestamps: true }
);

skillStateSchema.index({ user: 1, subject: 1, topic: 1 }, { unique: true });

module.exports = mongoose.model("SkillState", skillStateSchema);