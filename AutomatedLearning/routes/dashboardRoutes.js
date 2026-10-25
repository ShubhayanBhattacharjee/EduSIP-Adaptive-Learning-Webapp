const express = require("express");
const router = express.Router();
const { getAnalytics, getStudentPerformance } = require("../controllers/dashboardController");
const { protect } = require("../middleware/authMiddleware");

router.get("/analytics", protect, getAnalytics);
router.get("/performance", protect, getStudentPerformance);
router.post("/response", protect, (req, res) =>res.status(410).json({ success: false, message: "Use POST /quiz/answer" }));

module.exports = router;