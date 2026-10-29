const mongoose = require("mongoose");

const responseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
  sessionId: { type: String, index: true },
  subject: String,                                   // the old controller wrote this, but the old schema dropped it
  topic: String,
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },   // label at the time
  selectedAnswer: { type: Number, required: true, min: 0, max: 3 },
  isCorrect: { type: Boolean, required: true },
  hintsUsed: { type: Number, default: 0 },
  hintUsed: { type: Boolean, default: false },       // kept so old dashboards still work
  success: { type: Boolean, default: false },        // correct AND no hint: this is what the ML predicts
  timeTaken: { type: Number, default: 0 },           // seconds; measured by the server in the new controller
  mode: { type: String, enum: ["practice", "level", "placement"], default: "practice" },

  // ---- what the system knew and did (needed for honest evaluation later) ----
  policy: String,              // adaptive | control | fallback
  reason: String,
  predictedSuccess: Number,
  propensity: Number,
  modelVersion: String,
  abilityBefore: Number,
  abilityAfter: Number,
  difficultyBefore: Number,
  trust: { type: Number, default: 1 },               // 1 = clean session
  learned: { type: Boolean, default: true },         // false if the answer was NOT used to update any rating
  replayedAt: Date 
}, { timestamps: true });

responseSchema.index({ user: 1, createdAt: -1 });
responseSchema.index({ user: 1, subject: 1, createdAt: -1 });   // dashboard + knowledgeScore: one student's answers in a subject
responseSchema.index({ topic: 1, createdAt: -1 });
responseSchema.index({ createdAt: -1 });   // admin + super admin "last 7 / 30 days" counts

module.exports = mongoose.model("Response", responseSchema);