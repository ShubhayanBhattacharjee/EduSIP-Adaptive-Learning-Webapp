const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { uniqueUsername } = require("../utils/username");

const mailer = require("../utils/mailer");
const AuditLog = require("../models/AuditLog");

const STAFF_ROLES = ["admin", "superadmin"];
// TEMPORARY: lets admins keep using the old /auth/login form until the staff login page exists in the frontend.
const legacyStaffLogin = () => process.env.LEGACY_STAFF_LOGIN === "true";

// ---- email verification helpers ----
const VERIFY_HOURS = 24;
const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const skipVerification = () => process.env.SKIP_EMAIL_VERIFICATION === "true";   // local testing only

async function sendVerificationEmail(email, code) {
  const link = `${process.env.CLIENT_URL}/verify-email/${code}`;
  await mailer.sendMail({
    to: email,
    subject: "Verify your email",
    html: `<h2>Welcome!</h2><p>Click the link below to verify your email address:</p>
           <a href="${link}">${link}</a><p>This link expires in ${VERIFY_HOURS} hours.</p>`,
  });
}

// Saves a fresh code on the user and emails it. Returns false if the email could not be sent
// (the account is kept; the user can ask for a new link).
async function issueVerification(user) {
  const code = crypto.randomBytes(24).toString("hex");
  user.emailVerifyToken = sha256(code);
  user.emailVerifyExpire = new Date(Date.now() + VERIFY_HOURS * 3600 * 1000);
  await user.save();
  try {
    await sendVerificationEmail(user.email, code);
    user.emailVerifySentAt = new Date();
    await user.save();
    return true;
  } catch (mailError) {
    console.error("Verification email failed:", mailError.message);
    return false;
  }
}
//jwt(json web token) is a secure way to send information between client and server in the form of a digitally signed token 


// scope "public" = student/teacher login, scope "staff" = admin/superadmin login. The scope is signed into the token.
const generateToken = (userId, scope = "public") => {
  const staff = scope === "staff";
  return jwt.sign(
    { id: userId, scope },                                    // payload
    process.env.JWT_SECRET,                                   // secret key
    { expiresIn: staff ? (process.env.STAFF_JWT_EXPIRE || "8h") : (process.env.JWT_EXPIRE || "7d") }
  );
};

exports.registerUser = async (req, res) => {
  try {
    const { fullname, username, email, bio, skills, password, confirmPassword } = req.body;
    const fullnameStr = (fullname || "").toString().trim();
    const emailStr = (email || "").toString().trim().toLowerCase();
    const usernameStr = (username || "").toString().trim();
    const pwd = String(password || "");                 // never trimmed: what the user types is what is hashed
    const confirmPwd = String(confirmPassword || "");

    if (!fullnameStr || !emailStr || !pwd || !confirmPwd) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (pwd.length < 8 || pwd.length > 72) {      // bcrypt ignores everything after 72 bytes
      return res.status(400).json({ success: false, message: "Password must be 8 to 72 characters" });
    }

    if (pwd !== confirmPwd) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    if (!usernameStr) {
      return res.status(400).json({ success: false, message: "Username is required" });
    }

    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(usernameStr)) {
      return res.status(400).json({ success: false, message: "Username must be 3-30 letters, numbers, dot, dash or underscore" });
    }
    const existingUsername = await User.findOne({ username: usernameStr }).collation({ locale: "en", strength: 2 });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: "Username already taken" });
    }

    const existingUser = await User.findOne({ email: emailStr });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(pwd, salt);

    const user = new User({
      fullname: fullnameStr,
      username: usernameStr,
      email: emailStr,
      bio: String(bio || "").slice(0, 500),
      skills: Array.isArray(skills) ? skills.slice(0, 20).map((s) => String(s).trim().slice(0, 40)).filter(Boolean) : [],
      role: req.body.role === "teacher" ? "teacher" : "student",   // only these two can be chosen at sign-up
      password: hashedPassword,
      emailVerified: skipVerification(),
    });
    let emailSent = true;
    if (skipVerification()) {
      await user.save();
    } else {
      emailSent = await issueVerification(user);   // saves the user, then emails the link
    }

    // ✅ FIXED RESPONSE
    return res.status(201).json({
      success: true,
      verificationRequired: !user.emailVerified,
      emailSent,
      message: user.emailVerified? "User registered successfully": "Registration successful. Check your email to verify your account.",
      user: {
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    // Check if user exists (Google-only accounts have no password)
    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    //compare password
    let isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch && password !== password.trim()) {
      isMatch = await bcrypt.compare(password.trim(), user.password);   // accounts created when sign-up trimmed the password
    }
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    if (user.disabled) {
      return res.status(403).json({ success: false, message: "This account is disabled" });
    }

    // Admins and super admins never sign in here. Same answer as a wrong password, so nobody can find out who is staff.
    const isStaff = STAFF_ROLES.includes(user.role);
    if (isStaff && !legacyStaffLogin()) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ success: false, code: "EMAIL_NOT_VERIFIED", message: "Please verify your email before logging in" });
    }
    const token = generateToken(user._id, isStaff ? "staff" : "public");

    // Send response
    res.status(200).json({
      message: "Login successful",
      token,
      redirect: "/index",
      user: {
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        email: user.email,
        bio: user.bio,
        skills: user.skills,
        role: user.role,
      }
    });

  } catch (error) {
    // console.error("LOGIN ERROR:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/* POST /auth/staff/login   body: { email, password }
   Only for admins and super admins. Students and teachers get the same "Invalid credentials" as a wrong password.
   The token is short-lived (STAFF_JWT_EXPIRE, default 8h) and carries scope "staff". */
exports.staffLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const bad = () => res.status(400).json({ success: false, message: "Invalid credentials" });

    const user = await User.findOne({ email });
    if (!user || !user.password || !STAFF_ROLES.includes(user.role)) return bad();
    if (!(await bcrypt.compare(password, user.password))) return bad();
    if (user.disabled) return res.status(403).json({ success: false, message: "This account is disabled" });

    const token = generateToken(user._id, "staff");
    try {
      await AuditLog.create({ actor: user._id, actorEmail: user.email, action: "staff_login", target: user._id, targetEmail: user.email, details: { ip: req.ip } });
    } catch (e) {
      console.error("Audit log write failed:", e.message);        // never block the login itself
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      redirect: "/admin",
      user: { id: user._id, fullname: user.fullname, username: user.username, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("STAFF LOGIN ERROR:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};


exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Same answer whether the address exists or not, so nobody can test who has an account.
      return res.status(200).json({
        success: true,
        message: "If that email is registered, a reset link has been sent"
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Hash token before saving to DB
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    // Send email (one shared mailer, see utils/mailer.js)
    await mailer.sendMail({
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset.</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link expires in 10 minutes.</p>
      `
    });

    console.log("Reset email sent to:", user.email);

    return res.status(200).json({
      success: true,
      message: "If that email is registered, a reset link has been sent"
    });

  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};


exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || String(password).length < 8 || String(password).length > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be 8 to 72 characters"
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(String(password), salt);
    user.tokensValidAfter = new Date();   // old logins stop working after a reset

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful"
    });

  } catch (error) {
    console.error("Reset Password Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};

// Google Auth Handler
// controllers/authController.js
// Google OAuth callback handler
exports.googleAuthSuccess = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication failed" });
    }

    // If missing fields → update defaults
    if (!req.user.username) {
      req.user.username = await uniqueUsername(req.user.email);
    }

    if (!req.user.bio) req.user.bio = "";
    if (!req.user.skills) req.user.skills = [];

    await req.user.save();

    const token = generateToken(req.user._id);

    // The JWT never travels in a URL (browser history, referrer headers, server logs).
    // The browser gets a one-time code that is worth nothing after 60 seconds or after one use.
    const code = crypto.randomBytes(24).toString("hex");
    googleCodes.set(sha256(code), { token, expires: Date.now() + 60 * 1000 });
    return res.redirect(`${process.env.CLIENT_URL}/google-success?code=${code}`);
  } catch (error) {
    console.error("Google Auth Error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ---- one-time codes for the Google redirect (in memory: fine for one server; use Redis if you run several) ----
const googleCodes = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of googleCodes) if (v.expires < now) googleCodes.delete(k);
}, 60 * 1000).unref();

/* POST /auth/google/exchange   body: { code }   ->  { success, token } */
exports.googleExchange = (req, res) => {
  const key = sha256(String(req.body.code || ""));
  const entry = googleCodes.get(key);
  googleCodes.delete(key);                                   // single use
  if (!entry || entry.expires < Date.now()) {
    return res.status(400).json({ success: false, message: "Sign-in link expired, please try again" });
  }
  res.json({ success: true, token: entry.token });
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id; // from authMiddleware
    const { bio, skills } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update fields
    if (bio !== undefined) user.bio = String(bio).slice(0, 500);
    if (skills !== undefined) {
      if (!Array.isArray(skills)) {
        return res.status(400).json({ success: false, message: "skills must be a list" });
      }
      user.skills = skills.slice(0, 20).map((s) => String(s).trim().slice(0, 40)).filter(Boolean);
    }
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        fullname: user.fullname,
        username: user.username,
        email: user.email,
        bio: user.bio,
        skills: user.skills,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


/* POST /auth/verify-email   body: { token }   (the code from the emailed link) */
exports.verifyEmail = async (req, res) => {
  try {
    const code = String(req.body.token || "");
    if (!code) return res.status(400).json({ success: false, message: "Verification code is required" });

    const user = await User.findOne({ emailVerifyToken: sha256(code), emailVerifyExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired link" });

    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpire = undefined;
    await user.save();
    res.json({ success: true, message: "Email verified. You can log in now." });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* POST /auth/resend-verification   body: { email }   (same answer whether or not the account exists) */
exports.resendVerification = async (req, res) => {
  const generic = { success: true, message: "If that account still needs verification, a new link has been sent" };
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const user = email ? await User.findOne({ email }) : null;
    if (!user || user.emailVerified) return res.json(generic);

    // at most one email per minute per account
    if (user.emailVerifySentAt && Date.now() - user.emailVerifySentAt.getTime() < 60 * 1000) return res.json(generic);

    await issueVerification(user);
    res.json(generic);
  } catch (error) {
    console.error("Resend verification error:", error);
    res.json(generic);
  }
};

exports.me = (req, res) => {
  const { id, fullname, username, email, bio, skills, role } = req.user;
  res.json({ success: true, user: { id, fullname, username, email, bio, skills, role } });
};