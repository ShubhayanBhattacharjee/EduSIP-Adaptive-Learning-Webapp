const mongoose = require("mongoose");

// Work a teacher sets for a class: "practise Fractions, 10 questions, by Friday".
// A student has done it when they finish a matching quiz after the assignment was created.
const assignmentSchema = new mongoose.Schema(
  {
    class: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    subject: { type: String, required: true, trim: true },
    topic: { type: String, trim: true, default: "" },                 // empty for a level test
    mode: { type: String, enum: ["practice", "level"], default: "practice" },
    questions: { type: Number, min: 3, max: 40, default: 10 },
    minutes: { type: Number, min: 0, max: 240, default: 0 },
    dueAt: { type: Date },
    kind: { type: String, enum: ["quiz", "reading"], default: "quiz" },
    details: { type: String, trim: true, maxlength: 1000, default: "" },   // what to read (reading only)
    completedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // reading only
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assignment", assignmentSchema);
