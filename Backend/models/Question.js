const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
    subject: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },

    // Starting label. Real answers then correct the learned number (elo) below.
    difficulty: {
        type: String,
        enum: ["easy", "medium", "hard"],
        default: "medium"
    },
    level: { type: Number, min: 1, max: 10, default: null },
    questionText: { type: String, required: true },
    options: {
        type: [String],
        required: true,
        validate: {
            validator: function (v) {
                return v.length === 4;
            },
            message: "A question must have exactly 4 options"
        }
    },
    correctAnswer: { type: Number, required: true, min: 0, max: 3 },
    hint: { type: String, default: "" },   // the admin form already sends this; it was silently dropped before

    // ---- learned from real answers (Elo) ----
    elo: { type: Number, default: null },        // null until the first answer; then used instead of the label
    attempts: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },  // answers that were right on the first try without a hint

    // ---- AI-made questions wait for admin approval ----
    // Old questions have no status. Every query uses { $nin: ["pending", "rejected"] }, which matches a missing field.
    status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
    source: { type: String, enum: ["admin", "ai"], default: "admin" },
    misconceptions: { type: [String], default: [] }   // for each option: the mistake that leads to it
}, { timestamps: true });

/* Optimized Indexes */
questionSchema.index({ subject: 1, difficulty: 1 });
questionSchema.index({ subject: 1, topic: 1, status: 1 });

module.exports = mongoose.model("Question", questionSchema);