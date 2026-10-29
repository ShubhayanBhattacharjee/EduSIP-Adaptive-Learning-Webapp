const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    questions: [
        {
            questionId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Question"
            },
            questionText: String,
            options: [String],
            correctAnswer: Number,
            difficulty: String,
            topic: String
        }
    ],
    responses: [
        {
            questionId: mongoose.Schema.Types.ObjectId,
            selectedAnswer: Number,
            isCorrect: Boolean,
            timeTaken: Number,
            topic: String,          // ✅ ADD THIS
            difficulty: String      // (optional but good)
        }
    ],
    sessionId: String,
    mode: { type: String, default: "practice" },
    totalQuestions: Number,
    correctAnswers: Number,
    accuracy: Number,
    totalTime: Number,
    topic: {
        type: String,
        required: true
    },
    recommendation: {
        message: String,
        knowledgeLevel: String,
        knowledgeScore: Number,
        weakTopics: [String],
        strongTopics: [String],
        videos: [
            {
                title: String,
                url: String,
                thumbnail: String,
                topic: String
            }
        ]
    }
}, { timestamps: true });

// Dashboard + history always ask "this student's attempts, newest first"
quizAttemptSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);