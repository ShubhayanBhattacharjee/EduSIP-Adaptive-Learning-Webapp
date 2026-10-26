const mongoose = require("mongoose");

// A teacher's class. Students join with the joinCode and can leave at any time.
// A teacher can only see the progress of students who are in one of their classes.
const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    joinCode: { type: String, required: true, unique: true },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    announcements: [{ text: { type: String, maxlength: 500 }, createdAt: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

classSchema.index({ students: 1 });

module.exports = mongoose.model("Class", classSchema);