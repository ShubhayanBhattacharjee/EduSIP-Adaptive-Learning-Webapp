const express = require("express");
const router = express.Router();
const c = require("../controllers/classController");
const { protect, authorize, requireApprovedTeacher } = require("../middleware/authMiddleware");

const teacher = [protect, authorize("teacher", "admin", "superadmin"), requireApprovedTeacher];

// student
router.get("/assignments/mine", protect, authorize("student"), c.myAssignments);
router.post("/join", protect, authorize("student"), c.joinClass);
router.get("/mine", protect, c.myMemberships);
router.delete("/:id/leave", protect, c.leaveClass);
router.post("/assignments/:aid/complete", protect, authorize("student"), c.completeReading);

// teacher / admin
router.post("/", ...teacher, c.createClass);
router.get("/", ...teacher, c.myClasses);
router.get("/:id/overview", ...teacher, c.overview);
router.get("/:id/students/:studentId", ...teacher, c.studentDetail);
router.delete("/:id/students/:studentId", ...teacher, c.removeStudent);
router.patch("/:id", ...teacher, c.renameClass);
router.delete("/:id", ...teacher, c.deleteClass);
router.post("/:id/regenerate-code", ...teacher, c.regenerateCode);
router.get("/:id/export", ...teacher, c.exportClass);
router.post("/:id/announcements", ...teacher, c.addAnnouncement);
router.delete("/:id/announcements/:aid", ...teacher, c.deleteAnnouncement);
router.get("/:id/assignments", ...teacher, c.listAssignments);
router.post("/:id/assignments", ...teacher, c.createAssignment);
router.delete("/:id/assignments/:aid", ...teacher, c.deleteAssignment);

module.exports = router;