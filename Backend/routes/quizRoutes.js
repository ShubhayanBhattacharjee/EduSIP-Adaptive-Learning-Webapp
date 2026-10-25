const express = require("express");
const router = express.Router();
const {
  startQuiz, submitAnswer, useHint, finishQuiz, getSubjects, getTopicsBySubject,
  getQuizHistory, getQuizById, recommendTopic, getStudyPlan,
  placementStatus, placementStart, placementFinish,
} = require("../controllers/quizController");
const { protect } = require("../middleware/authMiddleware");

router.get("/subjects", protect, getSubjects);
router.get("/topics", protect, getTopicsBySubject);
router.get("/recommend-topic", protect, recommendTopic);
router.get("/study-plan", protect, getStudyPlan);
router.get("/placement/status", protect, placementStatus);
router.post("/placement/start", protect, placementStart);
router.post("/placement/finish", protect, placementFinish);
router.post("/start", protect, startQuiz);
router.post("/answer", protect, submitAnswer);
router.post("/hint", protect, useHint);
router.post("/finish", protect, finishQuiz);
router.get("/history", protect, getQuizHistory);
router.get("/:id", protect, getQuizById);   // keep LAST: it matches any path

module.exports = router;