const mongoose = require("mongoose");

// Written the moment a question is SHOWN. It is the only trusted record of what the
// system predicted, how likely it was to pick that question (propensity) and when the
// student saw it (so time taken is measured by the server, not the browser).
const exposureSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, required: true, index: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    subject: String,
    topic: String,
    mode: { type: String, enum: ["practice", "level", "placement"], default: "practice" },
    policy: { type: String, enum: ["adaptive", "control", "fallback", "fixed"], default: "adaptive" },
    reason: String,              // target | explore | random | fallback
    predictedSuccess: Number,    // chance the model gave, 0 to 1
    propensity: Number,          // chance this exact question was chosen (null for fallback)
    target: Number,
    abilityAtPick: Number,
    modelVersion: String,
    servedAt: { type: Date, default: Date.now },
    sessionTotal: Number,
    hintsUsed: { type: Number, default: 0 },   // counted by the server on every hint request
    answered: { type: Boolean, default: false },
  },
  { timestamps: true }
);

exposureSchema.index({ user: 1, sessionId: 1, question: 1 });
exposureSchema.index({ servedAt: 1 }, { expireAfterSeconds: 7 * 86400, partialFilterExpression: { answered: false } });

module.exports = mongoose.model("Exposure", exposureSchema);