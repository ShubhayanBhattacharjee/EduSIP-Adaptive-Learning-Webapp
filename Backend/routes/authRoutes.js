// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const passport = require("passport");

const {
  registerUser,
  loginUser,
  staffLogin,
  forgotPassword,
  resetPassword,
  googleAuthSuccess,
  updateProfile,
  verifyEmail,
  resendVerification,
  me
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");


// Email/password auth
router.post("/register", registerUser);
router.post("/login", loginUser);              // students and teachers
router.post("/staff/login", staffLogin);      // admins and super admins only (internal)
router.post("/forgotpassword", forgotPassword);
router.put("/resetpassword/:token", resetPassword);
router.put("/update-profile", protect, updateProfile);
// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/auth/google/failure" }),
  googleAuthSuccess
);
router.get("/google/failure", (req, res) => {
  res.status(401).json({ success: false, message: "Google authentication failed" });
});
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);
router.get("/me", protect, me);

module.exports = router;