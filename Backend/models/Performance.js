const mongoose = require("mongoose");

const performanceSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId,ref: "User",required: true},
    topic: {type: String,required: true},
    totalQuestions: {type: Number,default: 0 },
    correctAnswers: {type: Number,default: 0 },
    accuracy: {type: Number,default: 0 },
    averageTime: {type: Number,default: 0 }
  },
  { timestamps: true }
);

// One user should have only one record per topic
performanceSchema.index({ user: 1, topic: 1 }, { unique: true });
module.exports = mongoose.model("Performance", performanceSchema);
