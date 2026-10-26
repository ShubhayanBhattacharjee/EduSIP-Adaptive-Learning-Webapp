// IMPORTS
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const passport = require("passport");
const path = require("path");
const helmet = require("helmet");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Load env variables
dotenv.config();

// DATABASE 
const connectDB = require("./config/db");

// ROUTES
const authRoutes = require("./routes/authRoutes");
const quizRoutes = require("./routes/quizRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const adminRoutes = require("./routes/adminRoutes"); //  Added admin routes
const antiCheatRoutes = require("./routes/antiCheatRoutes"); // Added anti-cheat routes
const classRoutes = require("./routes/classRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");   // super admin only
const settings = require("./services/settingsService");

// PASSPORT CONFIG
require("./config/passport");

// APP INIT 
const app = express();

// MIDDLEWARE
if (!process.env.CLIENT_URL) throw new Error("CLIENT_URL is required");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET is required and must be at least 32 characters");
// Settings that are fine on a laptop and dangerous on a real server.
if (process.env.NODE_ENV === "production") {
  if (process.env.SKIP_EMAIL_VERIFICATION === "true") throw new Error("SKIP_EMAIL_VERIFICATION must not be true in production");
  if (process.env.LEGACY_STAFF_LOGIN === "true") throw new Error("LEGACY_STAFF_LOGIN must not be true in production");
  if (!process.env.ML_API_KEY) throw new Error("ML_API_KEY is required in production");
}
if (process.env.FORCE_ADAPTIVE === "true") console.warn("FORCE_ADAPTIVE=true: everyone gets the adaptive version, so there is NO control group for the pilot report.");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));  // keeps /uploads images loading cross-origin
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));
// Behind a proxy or load balancer (Render, Nginx...) set TRUST_PROXY=1 so every student is not seen as the same IP.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// RATE LIMITS. They must be registered BEFORE the routes: Express runs middleware in order, so a limiter placed
// after a router never sees the requests that router answers.
const perMinute = (limit) => rateLimit({ windowMs: 60 * 1000, limit });
// Login attempts are counted per IP + email (a whole classroom on one IP is not locked out together);
// a successful login does not count.
const loginKey = (req) => `${ipKeyGenerator(req.ip)}|${String((req.body && req.body.email) || "").trim().toLowerCase()}`;
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: loginKey, skipSuccessfulRequests: true });
const staffLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, keyGenerator: loginKey, skipSuccessfulRequests: true });

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/auth/login", loginLimiter);
app.use("/auth/staff/login", staffLoginLimiter);
app.use("/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));
// AI explanations cost money and are slow: 15 per minute per login
app.use("/quiz/explain", rateLimit({ windowMs: 60 * 1000, limit: 15, keyGenerator: (req) => req.headers.authorization || ipKeyGenerator(req.ip) }));
app.use("/quiz", perMinute(600));
app.use("/classes", perMinute(120));
app.use("/admin", perMinute(120));
app.use("/superadmin", perMinute(120));
app.use("/dashboard", perMinute(120));
// proctoring events: counted per login (not per IP), so a classroom behind one IP is not blocked together
app.use("/api/anti-cheat", rateLimit({ windowMs: 60 * 1000, limit: 300, keyGenerator: (req) => req.headers.authorization || ipKeyGenerator(req.ip) }));
app.use(passport.initialize());
// app.use(express.static(path.join(__dirname, "../FRONTEND")));

// BASIC ROUTE
app.get("/", (req, res) => {
  res.json({ message: "Backend Server Running Successfully 🚀" });
});

// API ROUTES
app.use("/auth", authRoutes);
app.use("/quiz", quizRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/admin", adminRoutes); // ✅ Mounted admin routes
app.use("/api/anti-cheat", antiCheatRoutes); // ✅ Mounted anti-cheat routes
app.use("/classes", classRoutes);
app.use("/superadmin", superAdminRoutes);

// 404 HANDLER
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route Not Found"
  });
});

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error("Server Error:", req.method, req.originalUrl, err.status || "", err.message);
  if (!err.status || err.status >= 500) console.error(err.stack);
  const status = err.code === "LIMIT_FILE_SIZE" ? 413 : (err.statusCode || err.status || 500);
  res.status(status).json({
    success: false,
    message: status >= 500 ? "Internal Server Error" : (err.message || "Request error")   // never show internals to the browser
  });
});

// SERVER START
const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    console.log("MongoDB Connected");
    await settings.load().catch((e) => console.error("Settings load failed (using .env values):", e.message));
    settings.startRefresh();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    const { reconcile } = require("./services/reconcileService");
    const everyMin = Number(process.env.RECONCILE_MINUTES || 10);
    if (everyMin > 0) {
      setInterval(() => {
        reconcile()
          .then((r) => { if (r.replayed || r.flagged) console.log("Reconciled late answers:", r); })
          .catch((e) => console.error("Reconcile failed:", e.message));
      }, everyMin * 60 * 1000).unref();
    }
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });