const express = require("express");
const router = express.Router();
const c = require("../controllers/classController");
const { protect, authorize } = require("../middleware/authMiddleware");

const teacher = [protect, authorize("teacher", "admin", "superadmin")];

// student
router.post("/join", protect, authorize("student"), c.joinClass);
router.get("/mine", protect, c.myMemberships);
router.delete("/:id/leave", protect, c.leaveClass);

// teacher / admin
router.post("/", ...teacher, c.createClass);
router.get("/", ...teacher, c.myClasses);
router.get("/:id/overview", ...teacher, c.overview);
router.get("/:id/students/:studentId", ...teacher, c.studentDetail);
router.delete("/:id/students/:studentId", ...teacher, c.removeStudent);
router.patch("/:id", ...teacher, c.renameClass);
router.delete("/:id", ...teacher, c.deleteClass);
router.post("/:id/regenerate-code", ...teacher, c.regenerateCode);

module.exports = router;