const jwt = require("jsonwebtoken");
const User = require("../models/User");

const STAFF_ROLES = ["admin", "superadmin"];

// Two kinds of login exist (see controllers/authController.js):
//   scope "public" -> students and teachers, issued by POST /auth/login or Google
//   scope "staff"  -> admins and super admins, issued ONLY by POST /auth/staff/login
// The scope is signed inside the token, so a student or teacher can never turn their token into a staff one.
const protect = async (req, res, next) => {
  let token;

  try {
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const scope = decoded.scope === "staff" ? "staff" : "public";   // tokens issued before this change have no scope = public

    const user = await User.findById(decoded.id).select(
      "-password -resetPasswordToken -resetPasswordExpire"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }
    if (user.disabled) {
      return res.status(403).json({ success: false, message: "This account is disabled" });
    }
    if (user.tokensValidAfter && decoded.iat < Math.floor(user.tokensValidAfter.getTime() / 1000)) {
      return res.status(401).json({ success: false, message: "Session expired, please log in again" });
    }

    const isStaff = STAFF_ROLES.includes(user.role);
    // An admin must come in through the staff login. A public token that belongs to someone who is
    // (or has become) an admin is refused, and a staff token whose owner is no longer an admin is refused too.
    if (isStaff && scope !== "staff") {
      return res.status(401).json({ success: false, code: "STAFF_LOGIN_REQUIRED", message: "Please sign in through the staff login" });
    }
    if (!isStaff && scope === "staff") {
      return res.status(401).json({ success: false, message: "Session expired, please log in again" });
    }

    req.user = {
      id: user._id.toString(),
      fullname: user.fullname,
      username: user.username,
      email: user.email,
      bio: user.bio,
      skills: user.skills,
      role: user.role,
      scope,
      teacherApproved: user.teacherApproved,
      isAdmin: isStaff
    };

    next();

  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired"
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid token"
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }
    next();
  };
};

// A teacher who signed up on their own cannot use class tools until an admin approves them.
// (teacherApproved is undefined for teachers created before this rule, and they stay approved.)
const requireApprovedTeacher = (req, res, next) => {
  if (req.user.role === "teacher" && req.user.teacherApproved === false) {
    return res.status(403).json({ success: false, code: "TEACHER_PENDING", message: "Your teacher account is waiting for admin approval" });
  }
  next();
};

module.exports = { protect, authorize, requireApprovedTeacher, STAFF_ROLES };
