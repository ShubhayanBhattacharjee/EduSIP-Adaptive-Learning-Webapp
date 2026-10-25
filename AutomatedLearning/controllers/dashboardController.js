const mongoose = require("mongoose");
const Response = require("../models/Response");
const User = require("../models/User");
const Question = require("../models/Question");
const QuizAttempt = require("../models/QuizAttempt");
const { getYouTubeVideos } = require("../services/mlService");
const placement = require("../services/placementService");



// --- Student Dashboard Analytics ---
exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId)
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });

    const userObjId = new mongoose.Types.ObjectId(userId);

    // 👤 USER INFO
    const user = await User.findById(userId).select(
      "streak activityDates username fullname bio skills email"
    );

    /* =====================================================
       1️⃣ SUBJECT STATS
    ===================================================== */
    const subjectData = await Response.aggregate([
      { $match: { user: userObjId } },
      {
        $lookup: {
          from: "questions",
          localField: "question",
          foreignField: "_id",
          as: "questionDetails",
        },
      },
      { $unwind: "$questionDetails" },
      {
        $group: {
          _id: "$questionDetails.subject",
          totalQuestions: { $sum: 1 },
          correctAnswers: { $sum: { $cond: ["$isCorrect", 1, 0] } },
          totalTime: { $sum: { $ifNull: ["$timeTaken", 0] } },
        },
      },
    ]);

    const subjects = subjectData.map((s) => ({
      subject: s._id,
      totalQuestions: s.totalQuestions,
      correctAnswers: s.correctAnswers,
      accuracy: s.totalQuestions
        ? Number(((s.correctAnswers / s.totalQuestions) * 100).toFixed(1))
        : 0,
      avgTime: s.totalQuestions
        ? Number((s.totalTime / s.totalQuestions).toFixed(1))
        : 0,
    }));

    /* =====================================================
       2️⃣ OVERALL STATS
    ===================================================== */
    const totalAttempts = subjects.reduce(
      (sum, s) => sum + s.totalQuestions,
      0
    );
    const totalCorrect = subjects.reduce(
      (sum, s) => sum + s.correctAnswers,
      0
    );
    const totalTime = subjectData.reduce(
      (sum, s) => sum + s.totalTime,
      0
    );

    const overallAccuracy = totalAttempts
      ? Number(((totalCorrect / totalAttempts) * 100).toFixed(1))
      : 0;

    const avgResponseTime = totalAttempts
      ? Number((totalTime / totalAttempts).toFixed(1))
      : 0;

    /* =====================================================
       3️⃣ DIFFICULTY TREND
    ===================================================== */
    const recentResponses = await Response.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(15)
      .select("difficulty isCorrect createdAt");

    const difficultyTrend = recentResponses
      .reverse()
      .map((r) => ({
        level:
          r.difficulty === "hard"
            ? 3
            : r.difficulty === "medium"
            ? 2
            : 1,
        isCorrect: r.isCorrect,
        label:
          r.difficulty.charAt(0).toUpperCase() +
          r.difficulty.slice(1),
      }));

    /* =====================================================
       4️⃣ IMPROVEMENT TREND
    ===================================================== */
    const lastResponses = await Response.find({ user: userId })
      .sort({ createdAt: 1 })
      .limit(30)
      .select("isCorrect createdAt");

    let runningCorrect = 0;

    const improvementTrend = lastResponses.map((r, index) => {
      if (r.isCorrect) runningCorrect++;

      return {
        attempt: index + 1,
        accuracy: Number(
          ((runningCorrect / (index + 1)) * 100).toFixed(1)
        ),
      };
    });

    /* =====================================================
       5️⃣ DIFFICULTY PERFORMANCE
    ===================================================== */
    const difficultyStats = await Response.aggregate([
      { $match: { user: userObjId } },
      {
        $group: {
          _id: "$difficulty",
          total: { $sum: 1 },
          correct: { $sum: { $cond: ["$isCorrect", 1, 0] } },
        },
      },
    ]);

    const difficultyPerformance = difficultyStats.map((d) => ({
      difficulty: d._id,
      total: d.total,
      accuracy: d.total
        ? Number(((d.correct / d.total) * 100).toFixed(1))
        : 0,
    }));

    /* =====================================================
       6️⃣ ACTIVITY HEATMAP
    ===================================================== */
    const activity = (user.activityDates || []).map((a) => ({
      date: new Date(a.date).toLocaleDateString("en-CA"),
      count: a.count,
    }));

    /* =====================================================
       🔥 7️⃣ SMART RECOMMENDATION (FIXED)
       👉 Uses stored recommendation (NO DUPLICATION)
    ===================================================== */
    const latestQuiz = await QuizAttempt.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .select("recommendation");

    const recommendations = latestQuiz?.recommendation || {
      message: "No recommendations yet.",
      videos: [],
      weakTopics: [],
      strongTopics: [],
    };

    /* =====================================================
       LEVEL + "START HERE" (from the placement test, kept current by every answer)
       placementDone=false  -> the frontend should send the student to the placement test
    ===================================================== */
    let learning = { placementDone: false, level: null, startHere: null, placement: null };
    try {
      learning = await placement.summary(userId);
    } catch (e) {
      console.error("Dashboard level summary failed:", e.message);
    }

    /* =====================================================
       ✅ FINAL RESPONSE
    ===================================================== */
    res.status(200).json({
      success: true,

      user: {
        fullname: user.fullname,
        email: user.email,
        username: user.username,
        bio: user.bio,
        skills: user.skills,
      },

      stats: {
        overallAccuracy,
        totalAttempts,
        totalCorrect,
        avgResponseTime,
      },

      subjects: subjects.sort((a, b) => b.accuracy - a.accuracy),

      difficultyTrend,
      improvementTrend,
      difficultyPerformance,

      streak: {
        current: user.streak?.current || 0,
        longest: user.streak?.longest || 0,
      },

      activity,

      recommendations, // ✅ CLEAN + CONSISTENT

      // { placementDone, canRetake, placement, level: { ability, level 1-10, band, subjects[] },
      //   startHere: { subject, topic, questions, minutes, mode, targetSuccess, reason, headline } }
      learning,
    });
  } catch (error) {
    console.error("Analytics error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};



// --- Strength & Weak Subject ---
exports.getStudentPerformance = async (req, res) => {

  try {

    const userId = req.user.id;

    const responses = await Response.find({ user: userId });

    if (!responses.length) {
      return res.json({
        success: true,
        strongSubject: null,
        weakSubject: null,
        details: []
      });
    }



    const questionIds = responses.map(r => r.question);

    const questions = await Question.find({
      _id: { $in: questionIds }
    });

    const questionMap = {};

    questions.forEach(q => {
      questionMap[q._id] = q;
    });



    const subjectStats = {};

    for (const r of responses) {

      const question = questionMap[r.question];

      if (!question) continue;

      if (!subjectStats[question.subject]) {
        subjectStats[question.subject] = {
          correct: 0,
          total: 0
        };
      }

      subjectStats[question.subject].total += 1;

      if (r.selectedAnswer === question.correctAnswer) {
        subjectStats[question.subject].correct += 1;
      }

    }



    const accuracies = Object.keys(subjectStats).map(subject => {

      const { correct, total } = subjectStats[subject];

      return {
        subject,
        accuracy: (correct / total) * 100
      };

    });



    accuracies.sort((a, b) => b.accuracy - a.accuracy);



    res.json({

      success: true,

      strongSubject: accuracies[0]?.subject || null,

      weakSubject: accuracies[accuracies.length - 1]?.subject || null,

      details: accuracies

    });

  }
  catch (error) {

    console.error("Student performance error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

};