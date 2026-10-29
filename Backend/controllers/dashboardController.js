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

        // Run every independent query at the same time instead of one after another
    const [
      user,
      facet,
      recentResponses,
      lastResponses,
      latestQuiz,
      learning,
    ] = await Promise.all([
      User.findById(userId)
        .select("streak activityDates username fullname bio skills email")
        .lean(),

      // One pass over this student's responses (no join with questions): per-subject and per-difficulty totals.
      // Needs "subject" saved on each Response (run scripts/backfill-response-subject.js once for old ones).
      Response.aggregate([
        { $match: { user: userObjId } },
        {
          $facet: {
            subjects: [
              { $match: { subject: { $type: "string", $ne: "" } } },
              {
                $group: {
                  _id: "$subject",
                  totalQuestions: { $sum: 1 },
                  correctAnswers: { $sum: { $cond: ["$isCorrect", 1, 0] } },
                  cleanCorrect: { $sum: { $cond: [{ $eq: ["$success", true] }, 1, 0] } },
                  totalTime: { $sum: { $ifNull: ["$timeTaken", 0] } },
                },
              },
            ],
            difficulty: [
              {
                $group: {
                  _id: "$difficulty",
                  total: { $sum: 1 },
                  correct: { $sum: { $cond: ["$isCorrect", 1, 0] } },
                },
              },
            ],
          },
        },
      ]),

      Response.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(15)
        .select("difficulty isCorrect createdAt")
        .lean(),

      Response.find({ user: userId })
        .sort({ createdAt: 1 })
        .limit(30)
        .select("isCorrect createdAt")
        .lean(),

      QuizAttempt.findOne({ user: userId })
        .sort({ createdAt: -1 })
        .select("recommendation")
        .lean(),

      placement.summary(userId).catch((e) => {
        console.error("Dashboard level summary failed:", e.message);
        return { placementDone: false, level: null, startHere: null, placement: null };
      }),
    ]);

    const subjectData = (facet[0] && facet[0].subjects) || [];
    const difficultyStats = (facet[0] && facet[0].difficulty) || [];

    /* =====================================================
       1️⃣ SUBJECT STATS
    ===================================================== */

    const subjects = subjectData.map((s) => ({
      subject: s._id,
      totalQuestions: s.totalQuestions,
      correctAnswers: s.correctAnswers,
      noHintRate: s.totalQuestions ? Number(((s.cleanCorrect / s.totalQuestions) * 100).toFixed(1)) : 0,
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
    const totalClean = subjectData.reduce((sum, s) => sum + s.cleanCorrect, 0);
    const totalTime = subjectData.reduce(
      (sum, s) => sum + s.totalTime,
      0
    );

    const overallAccuracy = totalAttempts
      ? Number(((totalCorrect / totalAttempts) * 100).toFixed(1))
      : 0;

    const noHintRate = totalAttempts ? Number(((totalClean / totalAttempts) * 100).toFixed(1)) : 0;

    const avgResponseTime = totalAttempts
      ? Number((totalTime / totalAttempts).toFixed(1))
      : 0;

    /* =====================================================
       3️⃣ DIFFICULTY TREND
    ===================================================== */


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
          String(r.difficulty || "medium").charAt(0).toUpperCase() +
          String(r.difficulty || "medium").slice(1),
      }));

    /* =====================================================
       4️⃣ IMPROVEMENT TREND
    ===================================================== */

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
    /* =====================================================
       ✅ FINAL RESPONSE
    ===================================================== */
    const sortedSubjects = [...subjects].sort((a, b) => b.accuracy - a.accuracy);

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
        noHintRate,
        totalAttempts,
        totalCorrect,
        avgResponseTime,
      },

      subjects: sortedSubjects,

      // replaces the separate GET /dashboard/performance call
      performance: {
        strongSubject: sortedSubjects[0]?.subject || null,
        weakSubject: sortedSubjects.length ? sortedSubjects[sortedSubjects.length - 1].subject : null,
      },

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



exports.getStudentPerformance = async (req, res) => {
  try {
    const userObjId = new mongoose.Types.ObjectId(req.user.id);

    // One query: join only the two fields we need from each question, then count per subject in the database
    const rows = await Response.aggregate([
      { $match: { user: userObjId, subject: { $type: "string", $ne: "" } } },
      { $group: { _id: "$subject", total: { $sum: 1 }, correct: { $sum: { $cond: ["$isCorrect", 1, 0] } } } },
    ]);

    if (!rows.length) {
      return res.json({ success: true, strongSubject: null, weakSubject: null, details: [] });
    }

    const accuracies = rows
      .map((r) => ({ subject: r._id, accuracy: (r.correct / r.total) * 100 }))
      .sort((a, b) => b.accuracy - a.accuracy);

    res.json({
      success: true,
      strongSubject: accuracies[0]?.subject || null,
      weakSubject: accuracies[accuracies.length - 1]?.subject || null,
      details: accuracies,
    });
  } catch (error) {
    console.error("Student performance error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};