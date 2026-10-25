const mongoose = require("mongoose");

// The ONE placement test every new student takes: an ordered list of questions.
// Only one document is active at a time. Rebuilding creates version + 1, and students
// who already finished an older version keep their result.
const placementTestSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, unique: true },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    active: { type: Boolean, default: true },
    source: { type: String, enum: ["auto", "manual"], default: "auto" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlacementTest", placementTestSchema);
