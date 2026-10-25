const crypto = require("crypto");
const mongoose = require("mongoose");
const Question = require("../models/Question");
const Response = require("../models/Response");
const Exposure = require("../models/Exposure");
const QuizAttempt = require("../models/QuizAttempt");
const SkillState = require("../models/SkillState");
const Topic = require("../models/Topic");
const User = require("../models/User");
const ml = require("../services/mlService");
const adaptive = require("../services/adaptiveService");
const placement = require("../services/placementService");
const { generateRecommendations } = require("../services/recommendationService");

const { OVERALL, SESSION_LENGTH, ci, pickNext, applyAnswer, findRemedial, toScale, questionLevel, buildStudyPlan } = adaptive;

const MAX_HINTS = 3;
// REQUIRE_PLACEMENT=true: a student must finish the placement test before any practice. Default off so existing users are not locked out.
const REQUIRE_PLACEMENT = process.env.REQUIRE_PLACEMENT === "true";

const APPROVED = { $nin: ["pending", "rejected"] };   // old questions have no status: still allowed
const MAX_SECONDS = 600;                               // one answer can never count for more than 10 minutes

/* ------------------------------------------------------------------
   Use the subject/topic spelling stored in the database, whatever case
   the browser sent ("maths" -> "Maths"). Returns null if it does not exist.
------------------------------------------------------------------ */
async function canonical(subject, topic) {
  const filter = { subject: ci(subject), status: APPROVED };
  if (topic) filter.topic = ci(topic);
  const q = await Question.findOne(filter).select("subject topic").lean();
  return q ? { subject: q.subject, topic: q.topic } : null;
}

/* ------------------------------------------------------------------
   KNOWLEDGE (0 to 1): the share of the student's last 20 answers in this
   subject that were right without a hint. Simple, honest, easy to explain.
------------------------------------------------------------------ */
async function knowledgeScore(userId, subject) {
  const last = await Response.find({ user: userId, subject }).sort({ createdAt: -1 }).limit(20).select("success").lean();
  if (!last.length) return 0.5;
  return Number((last.filter((r) => r.success).length / last.length).toFixed(2));
}

/* =====================================================
   START QUIZ
   body: { subject, topic, mode? }   mode = "practice" (default) or "level"
   Returns the FIRST question only. The next one arrives with each answer.
===================================================== */
exports.startQuiz = async (req, res) => {
  try {
    const { subject, topic } = req.body;
    const mode = req.body.mode === "level" ? "level" : "practice";

    if (REQUIRE_PLACEMENT && req.user.role === "student") {
      const st = await placement.status(req.user.id);
      if (!st.done) {
        return res.status(428).json({ success: false, code: "PLACEMENT_REQUIRED", message: "Take the 10-question placement test first" });
      }
    }

    if (!subject || (mode === "practice" && !topic)) {
      return res.status(400).json({ success: false, message: "Subject and Topic are required" });
    }

    const found = await canonical(subject, mode === "practice" ? topic : null);
    if (!found) {
      return res.status(404).json({ success: false, message: "No questions found for this subject/topic" });
    }

    const wanted = parseInt(req.body.questions, 10);
    const total = Number.isInteger(wanted) ? Math.min(Math.max(wanted, 3), 40) : SESSION_LENGTH[mode];
    const minutes = Math.min(Math.max(parseInt(req.body.minutes, 10) || 0, 0), 240) || null;
    const sessionId = crypto.randomUUID();

    const first = await pickNext({
      userId: req.user.id, subject: found.subject, topic: found.topic, sessionId, mode, total,
      target: req.body.target,
    });
    if (!first) {
      return res.status(404).json({ success: false, message: "No questions available" });
    }

    res.status(200).json({
      success: true,
      sessionId,
      mode,
      total, minutes,
      questions: [first.question],          // same field name the old frontend reads
      policy: first.policy,
    });
  } catch (error) {
    console.error("Start quiz error:", error);
    res.status(500).json({ success: false, message: "Error starting quiz" });
  }
};

/* =====================================================
   SUBJECTS / TOPICS (only approved questions)
===================================================== */
exports.getSubjects = async (req, res) => {
  try {
    const subjects = await Question.distinct("subject", { status: APPROVED });
    res.status(200).json({ success: true, subjects });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

exports.getTopicsBySubject = async (req, res) => {
  try {
    const { subject } = req.query;
    if (!subject) return res.json({ success: false, message: "Subject is required" });

    const topics = await Question.distinct("topic", { subject: ci(subject), status: APPROVED });
    res.json({ success: true, topics });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   SUBMIT ANSWER
   body: { questionId, selectedAnswer, sessionId?, hintUsed? }
   The SERVER decides the time taken and what counts as success.
===================================================== */
exports.submitAnswer = async (req, res) => {
  try {
    const { questionId, selectedAnswer, sessionId, hintUsed } = req.body;
    const userId = req.user.id;

    const picked = Number(selectedAnswer);
    if (!mongoose.isValidObjectId(questionId) || typeof sessionId !== "string" || !sessionId
        || !Number.isInteger(picked) || picked < 0 || picked > 3) {
      return res.status(400).json({ success: false, message: "questionId, sessionId and selectedAnswer (0-3) are required" });
    }
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ success: false, message: "Question not found" });

    // 1. Was this question really shown to this student, and not answered yet?
    //    Marking it answered in the same step stops double-clicks and replays.
    const exposure = await Exposure.findOneAndUpdate(
      { user: userId, question: question._id, answered: false, sessionId },
      { $set: { answered: true } },
      { sort: { servedAt: -1 }, new: true }
    );
    if (!exposure) {
      return res.status(409).json({ success: false, message: "This question was not served to you, or is already answered" });
    }

    // 2. Facts the server decides itself.
    const isCorrect = Number(question.correctAnswer) === picked;
    const hints = Math.max(exposure.hintsUsed || 0, hintUsed ? 1 : 0);
    const success = isCorrect && hints === 0;                       // right AND no hint: what the ML predicts
    const timeTaken = Math.min(Math.round((Date.now() - exposure.servedAt.getTime()) / 1000), MAX_SECONDS);

    // 3. Update ability and question difficulty (skipped for flagged sessions or if ML is down).
    const result = await applyAnswer({ userId, question, exposure, success });

    // 4. Save everything we know. This is the data that makes the model finer over time.
    await Response.create({
      user: userId,
      question: question._id,
      sessionId: exposure.sessionId,
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      selectedAnswer: picked,
      isCorrect,
      hintsUsed: hints,
      hintUsed: hints > 0,
      success,
      timeTaken,
      mode: exposure.mode,
      policy: exposure.policy,
      reason: exposure.reason,
      predictedSuccess: exposure.predictedSuccess,
      propensity: exposure.propensity,
      modelVersion: exposure.modelVersion,
      abilityBefore: result.abilityBefore,
      abilityAfter: result.abilityAfter,
      difficultyBefore: result.difficultyBefore,
      trust: result.trust,
      learned: result.learned,
    });

    // 5. Is the session finished? If not, pick the next question.
    const answeredCount = await Response.countDocuments({ user: userId, sessionId: exposure.sessionId });
    const isPlacement = exposure.mode === "placement";
    const total = isPlacement ? (await placement.getActiveTest()).questionIds.length : (exposure.sessionTotal || SESSION_LENGTH[exposure.mode]);
    const done = answeredCount >= total;

    let nextQuestion = null;
    let remedial = null;
    if (!done) {
      if (isPlacement) {
        nextQuestion = (await placement.next(userId, exposure.sessionId)).question;     // fixed order, same for everyone
      } else {
        const next = await pickNext({
          userId, subject: question.subject, topic: question.topic,
          sessionId: exposure.sessionId, mode: exposure.mode, total: exposure.sessionTotal,
        });
        nextQuestion = next ? next.question : null;
        if (exposure.mode === "practice") {
          remedial = await findRemedial({ userId, subject: question.subject, topic: question.topic });
        }
      }
    }

    // Placement over: compute the level now (if the ML service is down this stays pending and /placement/finish retries).
    let placementResult;
    if (isPlacement && (done || !nextQuestion)) {
      const f = await placement.finalize(userId, exposure.sessionId);
      placementResult = f.ok ? await placement.summary(userId) : { pending: true, reason: f.reason };
    }

    // The "difficulty ladder": what the student just faced, where they stand, and what comes next (all on the 1-10 scale).
    let feedback;
    if (!isPlacement) {
      const answeredLevel = questionLevel(question);
      const yourLevel = result.learned ? toScale(result.abilityAfter) : (exposure.abilityAtPick != null ? toScale(exposure.abilityAtPick) : null);
      const nextLevel = nextQuestion ? nextQuestion.level : null;
      const direction = nextLevel == null ? null : nextLevel > answeredLevel ? "harder" : nextLevel < answeredLevel ? "easier" : "same";
      const message = nextLevel == null ? null
        : isCorrect && !hints ? (direction === "harder" ? `Correct. Stepping up to level ${nextLevel}.` : `Correct. Next question is level ${nextLevel}.`)
        : isCorrect ? `Correct, but you used a hint, so it counts as half a win. Next question is level ${nextLevel}.`
        : direction === "easier" ? `Not this time. Easing to level ${nextLevel} to build confidence.` : `Not this time. Next question stays near level ${nextLevel}.`;
      feedback = { answeredLevel, yourLevel, nextLevel, direction, message };
    }

    res.status(200).json({
      success: true,
      isCorrect,
      hintUsed: hints > 0,
      timeTaken,
      nextQuestion,
      done: done || !nextQuestion,
      answeredCount,
      total,
      remedial,                                   // { backTo, reason } or null
      feedback,                                   // { answeredLevel, yourLevel, nextLevel, direction, message } (not in the placement test)
      placement: placementResult,                 // only when the placement test just ended
      integrity: result.trust < 1 ? { trust: result.trust } : undefined,
    });
  } catch (error) {
    console.error("Submit answer error:", error);
    res.status(500).json({ success: false, message: "Error submitting answer" });
  }
};

/* =====================================================
   HINT  (counted by the server, so it cannot be hidden)
   body: { questionId, sessionId? }
===================================================== */
exports.useHint = async (req, res) => {
  try {
    const { questionId, sessionId } = req.body;
    if (!mongoose.isValidObjectId(questionId) || typeof sessionId !== "string" || !sessionId) {
      return res.status(400).json({ success: false, message: "questionId and sessionId are required" });
    }
    const where = { user: req.user.id, question: questionId, answered: false, sessionId };
    const exposure = await Exposure.findOneAndUpdate(
      { ...where, mode: { $ne: "placement" }, hintsUsed: { $lt: MAX_HINTS } },
      { $inc: { hintsUsed: 1 } },
      { sort: { servedAt: -1 }, new: true }
    );
    if (!exposure) {
      const cur = await Exposure.findOne(where);
      if (!cur) return res.status(409).json({ success: false, message: "Question not active" });
      if (cur.mode === "placement") return res.status(403).json({ success: false, message: "Hints are off during the placement test" });
      return res.status(409).json({ success: false, message: `You have used all ${MAX_HINTS} hints for this question` });
    }

    const level = exposure.hintsUsed;                              // 1 = gentle nudge ... 3 = most detailed
    const q = await Question.findById(questionId).select("hint topic questionText options correctAnswer").lean();
    let text = level === 1 && q && q.hint ? q.hint : null;        // an admin-written hint is used first
    if (!text && q) {
      const ai = await ml.hint({
        question: q.questionText, options: q.options, topic: q.topic, hint_level: level,
        correct_answer: q.options[q.correctAnswer],                 // only steers the AI away from it; never sent to the student
        success_chance: exposure.predictedSuccess ?? undefined,
      });
      text = ai && ai.hint;
    }
    if (!text) {
      text = ["Read the question again and remove the options you know are wrong.",
        "Name the idea or formula this question is testing, then check each option against it.",
        "Work the problem step by step on paper, stopping before the last step."][level - 1];
    }
    res.json({
      success: true, hint: text, hintLevel: level, hintsLeft: MAX_HINTS - level,
      note: "A question answered with a hint does not count as a clean success.",
    });
  } catch (error) {
    console.error("Hint error:", error);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   FINISH QUIZ
   body: { sessionId, subject?, topic? }   (old frontends can still send questionIds)
===================================================== */
exports.finishQuiz = async (req, res) => {
  try {
    const { sessionId, questionIds } = req.body;
    const userId = req.user.id;

    // Already finished? Return the saved result instead of counting the streak twice.
    if (sessionId) {
      const existing = await QuizAttempt.findOne({ user: userId, sessionId });
      if (existing) {
        return res.json({
          success: true, quizId: existing._id, totalQuestions: existing.totalQuestions,
          correctAnswers: existing.correctAnswers, accuracy: existing.accuracy, totalTime: existing.totalTime,
          questions: existing.questions, responses: existing.responses,
          recommendation: existing.recommendation, knowledge: existing.recommendation?.knowledgeScore,
        });
      }
    }

    const query = sessionId
      ? { user: userId, sessionId }
      : { user: userId, question: { $in: questionIds || [] } };
    const rows = await Response.find(query).sort({ createdAt: 1 }).populate("question");
    const filtered = rows.filter((r) => r.question);

    if (!filtered.length) {
      return res.status(400).json({ success: false, message: "No answers found for this quiz" });
    }

    const mode = filtered[0].mode || "practice";
    const subject = mode === "placement" ? "Placement test" : (filtered[0].subject || req.body.subject);
    const topic = mode === "placement" ? "Placement test" : mode === "level" ? "Level test" : (filtered[0].topic || req.body.topic);

    const totalQuestions = filtered.length;
    const correctAnswers = filtered.filter((r) => r.isCorrect).length;
    const totalTime = filtered.reduce((sum, r) => sum + (r.timeTaken || 0), 0);
    const accuracy = Number(((correctAnswers / totalQuestions) * 100).toFixed(1));

    const knowledge = mode === "placement" ? Number((correctAnswers / totalQuestions).toFixed(2)) : await knowledgeScore(userId, subject);

    const questions = filtered.map((r) => ({
      questionId: r.question._id,
      questionText: r.question.questionText,
      options: r.question.options,
      correctAnswer: r.question.correctAnswer,
      difficulty: r.question.difficulty,
      topic: r.question.topic,
    }));
    const responses = filtered.map((r) => ({
      questionId: r.question._id,
      selectedAnswer: r.selectedAnswer,
      isCorrect: r.isCorrect,
      timeTaken: r.timeTaken,
      difficulty: r.difficulty,
      topic: r.topic,
    }));

    const recommendation = await generateRecommendations({ accuracy, responses, knowledge, subject });

    const savedQuiz = await QuizAttempt.create({
      user: userId, subject, topic, sessionId: sessionId || undefined, mode,
      questions, responses, totalQuestions, correctAnswers, accuracy, totalTime, recommendation,
    });

    // Streak and activity (same logic as before)
    const user = await User.findById(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last = new Date(user.streak.lastActiveDate || 0);
    last.setHours(0, 0, 0, 0);
    const diff = (today - last) / (1000 * 60 * 60 * 24);

    if (diff === 1) user.streak.current += 1;
    else if (diff > 1) user.streak.current = 1;
    user.streak.longest = Math.max(user.streak.longest, user.streak.current);
    user.streak.lastActiveDate = today;

    const activity = user.activityDates.find((a) => new Date(a.date).getTime() === today.getTime());
    if (activity) activity.count += 1;
    else user.activityDates.push({ date: today, count: 1 });
    await user.save();

    res.json({
      success: true, quizId: savedQuiz._id, totalQuestions, correctAnswers, accuracy, totalTime,
      questions, responses, recommendation, knowledge,
    });
  } catch (error) {
    console.error("Finish quiz error:", error);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   RESUME: the quiz the student left half-way (served within the last 2 hours, not finished)
   GET /quiz/active  ->  { active: null } or { active: { sessionId, mode, subject, topic, total, answered, hintsUsed, question } }
===================================================== */
exports.activeSession = async (req, res) => {
  try {
    const open = await Exposure.findOne({
      user: req.user.id, answered: false, mode: { $ne: "placement" },
      servedAt: { $gt: new Date(Date.now() - 2 * 3600 * 1000) },
    }).sort({ servedAt: -1 }).lean();
    if (!open) return res.json({ success: true, active: null });

    if (await QuizAttempt.exists({ user: req.user.id, sessionId: open.sessionId })) return res.json({ success: true, active: null });
    const q = await Question.findById(open.question).lean();
    if (!q) return res.json({ success: true, active: null });

    const answered = await Response.countDocuments({ user: req.user.id, sessionId: open.sessionId });
    const total = open.sessionTotal || SESSION_LENGTH[open.mode] || 10;
    if (answered >= total) return res.json({ success: true, active: null });

    res.json({
      success: true,
      active: {
        sessionId: open.sessionId, mode: open.mode, subject: open.subject, topic: open.topic,
        total, answered, hintsUsed: open.hintsUsed || 0, question: adaptive.publicQuestion(q),
      },
    });
  } catch (error) {
    console.error("Active session error:", error);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   MY SKILLS: the student's level (1-10) in every topic they have been rated in
   GET /quiz/my-skills?subject=
===================================================== */
exports.mySkills = async (req, res) => {
  try {
    const filter = { user: req.user.id };
    if (req.query.subject) filter.subject = ci(req.query.subject);
    const rows = await SkillState.find(filter).lean();
    const shape = (s) => {
      const level = toScale(s.ability);
      return {
        subject: s.subject, topic: s.topic === OVERALL ? null : s.topic, ability: Number(s.ability.toFixed(2)),
        level, band: adaptive.bandOf(level), attempts: s.attempts || 0, lastPracticedAt: s.lastPracticedAt || null,
      };
    };
    res.json({
      success: true,
      subjects: rows.filter((s) => s.topic === OVERALL).map(shape).sort((a, b) => a.subject.localeCompare(b.subject)),
      topics: rows.filter((s) => s.topic !== OVERALL).map(shape).sort((a, b) => a.level - b.level),
    });
  } catch (error) {
    console.error("My skills error:", error);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   STUDY PLAN: what should this student study now, and how much?
   GET /quiz/study-plan?minutes=30&subject=Maths
===================================================== */
exports.getStudyPlan = async (req, res) => {
  try {
    const minutes = Math.min(Math.max(parseInt(req.query.minutes, 10) || 30, 5), 240);
    const built = await buildStudyPlan(req.user.id, { minutes, subject: req.query.subject });
    if (!built) return res.status(503).json({ success: false, message: "Study planner is not available right now" });
    res.json({ success: true, plan: built.plan, startHere: built.empty ? null : adaptive.startHere(built.plan) });
  } catch (error) {
    console.error("Study plan error:", error);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   PLACEMENT TEST (the common 10 questions for every new student)
   GET  /quiz/placement/status   -> { done, canRetake, placement, level, startHere }
   POST /quiz/placement/start    -> { sessionId, total, answered, question }   (continues a half-finished test)
   POST /quiz/placement/finish   -> retries the level calculation if the ML service was down at the end
   Questions are then answered through the normal POST /quiz/answer (no hints in this test).
===================================================== */
exports.placementStatus = async (req, res) => {
  try {
    res.json({ success: true, ...(await placement.summary(req.user.id)) });
  } catch (error) {
    console.error("Placement status error:", error);
    res.status(500).json({ success: false });
  }
};

exports.placementStart = async (req, res) => {
  try {
    const r = await placement.startOrResume(req.user.id, crypto);
    if (r.error === "done") return res.status(409).json({ success: false, code: "PLACEMENT_DONE", message: "You have already taken the placement test", placement: r.placement });
    if (r.error) return res.status(404).json({ success: false, message: "The placement test is not ready yet. Ask an admin to add questions." });
    res.json({ success: true, mode: "placement", sessionId: r.sessionId, total: r.total, answered: r.answered, resumed: r.resumed, questions: [r.question] });
  } catch (error) {
    console.error("Placement start error:", error);
    res.status(500).json({ success: false, message: error.message && error.message.startsWith("Need at least") ? error.message : "Error starting placement test" });
  }
};

exports.placementFinish = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (typeof sessionId !== "string" || !sessionId) return res.status(400).json({ success: false, message: "sessionId is required" });
    const f = await placement.finalize(req.user.id, sessionId);
    if (!f.ok) return res.status(f.reason === "ml_unavailable" ? 503 : 409).json({ success: false, reason: f.reason, trust: f.trust });
    res.json({ success: true, ...(await placement.summary(req.user.id)) });
  } catch (error) {
    console.error("Placement finish error:", error);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   HISTORY / SINGLE QUIZ
===================================================== */
exports.getQuizHistory = async (req, res) => {
  try {
    const history = await QuizAttempt.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .select("subject topic mode totalQuestions correctAnswers accuracy createdAt");
    res.json({ success: true, history });
  } catch {
    res.status(500).json({ success: false });
  }
};

exports.getQuizById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid quiz id" });
    const quiz = await QuizAttempt.findOne({ _id: req.params.id, user: req.user.id });
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    res.json({ success: true, quiz });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   AI EXPLANATION for one answered question (used by the review page)
   body: { quizId, questionId }
   The browser sends ids only. The server reads the question, the student's answer and the key from the
   saved attempt, so nobody can ask the AI about answers they never gave, or send the ML key from a browser.
===================================================== */
exports.explainAnswer = async (req, res) => {
  try {
    const { quizId, questionId } = req.body;
    if (!mongoose.isValidObjectId(quizId) || !mongoose.isValidObjectId(questionId)) {
      return res.status(400).json({ success: false, message: "quizId and questionId are required" });
    }
    const quiz = await QuizAttempt.findOne({ _id: quizId, user: req.user.id }).lean();
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    const q = quiz.questions.find((x) => String(x.questionId) === questionId);
    if (!q) return res.status(404).json({ success: false, message: "Question is not part of this quiz" });
    const r = quiz.responses.find((x) => String(x.questionId) === questionId);

    const out = await ml.explain({
      question: q.questionText,
      student_answer: r ? q.options[r.selectedAnswer] : "Not answered",
      correct_answer: q.options[q.correctAnswer],
      topic: q.topic || "General",
    });
    if (!out || !out.explanation) return res.status(503).json({ success: false, message: "The AI tutor is not available right now" });
    res.json({ success: true, explanation: out.explanation });
  } catch (error) {
    console.error("Explain error:", error);
    res.status(500).json({ success: false, message: "Could not get an explanation" });
  }
};

/* =====================================================
   RECOMMENDED TOPIC: weakest topic by the learned ability
   (falls back to the old accuracy rule for students with no ability rows yet)
===================================================== */
exports.recommendTopic = async (req, res) => {
  try {
    const { subject } = req.query;
    const filter = { user: req.user.id, topic: { $ne: OVERALL }, attempts: { $gte: 1 } };
    if (subject) filter.subject = ci(subject);

    const weakest = await SkillState.find(filter).sort({ ability: 1 }).limit(1).lean();
    if (weakest.length) {
      return res.json({ success: true, recommendedTopic: weakest[0].topic, subject: weakest[0].subject });
    }

    const match = { user: req.user.id };
    if (subject) match.subject = ci(subject);
    const result = await Response.aggregate([
      { $match: { ...match, user: (await User.findById(req.user.id).select("_id").lean())._id } },
      { $group: { _id: "$topic", total: { $sum: 1 }, correct: { $sum: { $cond: ["$isCorrect", 1, 0] } } } },
      { $project: { topic: "$_id", accuracy: { $multiply: [{ $divide: ["$correct", "$total"] }, 100] } } },
      { $sort: { accuracy: 1 } },
      { $limit: 1 },
    ]);
    if (!result.length) return res.json({ success: false });
    res.json({ success: true, recommendedTopic: result[0].topic, accuracy: result[0].accuracy.toFixed(2) });
  } catch {
    res.status(500).json({ success: false });
  }
};