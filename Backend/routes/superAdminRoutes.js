const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const superAdmin = require("../middleware/superAdminMiddleware");
const sa = require("../controllers/superAdminController");

// Every route in this file is for super admins only.
router.use(protect, superAdmin);

router.get("/overview", sa.overview);

router.get("/staff", sa.listStaff);
router.post("/staff", sa.createStaff);
router.post("/staff/:id/reset-password", sa.resetStaffPassword);

router.post("/users/:id/force-logout", sa.forceLogout);
router.delete("/users/:id", sa.deleteUser);

router.get("/classes", sa.listClasses);
router.get("/teachers", sa.listTeachers);
router.patch("/classes/:id/teacher", sa.transferClass);
router.delete("/classes/:id", sa.deleteClass);

router.get("/audit-log", sa.auditLog);

router.get("/settings", sa.getSettings);
router.put("/settings", sa.updateSettings);
router.delete("/settings/:key", sa.resetSetting);

router.get("/ml/info", sa.mlInfo);

module.exports = router;
