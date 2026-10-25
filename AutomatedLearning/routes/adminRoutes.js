const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const multer = require("multer");
const pilot = require("../controllers/pilotController");
const users = require("../controllers/userAdminController");
const superAdmin = require("../middleware/superAdminMiddleware");
const placementAdmin = require("../controllers/placementController");

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },                     // 2 MB, one file
  fileFilter: (req, file, cb) => cb(null, /\.csv$/i.test(file.originalname)),   // only .csv
});

router.post("/add-question", protect, adminMiddleware, adminController.addQuestion);
router.post("/upload-csv", protect, adminMiddleware, upload.single("file"), adminController.uploadCSV);
router.get("/analytics", protect, adminMiddleware, adminController.getAnalytics);
router.post("/generate-questions", protect, adminMiddleware, adminController.generateQuestions);
router.get("/pending-questions", protect, adminMiddleware, adminController.getPending);
router.patch("/questions/:id/review", protect, adminMiddleware, adminController.reviewQuestion);
router.post("/questions/bulk-review", protect, adminMiddleware, adminController.bulkReview);
router.get("/topics", protect, adminMiddleware, adminController.getTopics);
router.post("/topics", protect, adminMiddleware, adminController.upsertTopic);
router.get("/placement-test", protect, adminMiddleware, placementAdmin.getPlacementTest);
router.post("/placement-test/rebuild", protect, adminMiddleware, placementAdmin.rebuildPlacementTest);
router.post("/users/:id/reset-placement", protect, adminMiddleware, placementAdmin.resetPlacement);
router.get("/users", protect, adminMiddleware, users.listUsers);
router.patch("/users/:id/role", protect, adminMiddleware, users.setRole);
router.patch("/users/:id/status", protect, adminMiddleware, users.setStatus);
router.patch("/users/:id/group", protect, adminMiddleware, users.setGroup);
router.get("/platform-stats", protect, superAdmin, users.platformStats);
router.get("/audit-log", protect, superAdmin, users.auditLog);
router.get("/pilot-report", protect, adminMiddleware, pilot.pilotReport);
router.post("/reconcile", protect, adminMiddleware, pilot.runReconcile);

module.exports = router;