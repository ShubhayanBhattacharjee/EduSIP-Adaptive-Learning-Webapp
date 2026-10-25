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

// PASSPORT CONFIG
require("./config/passport");

// APP INIT 
const app = express();

// MIDDLEWARE
if (!process.env.CLIENT_URL) throw new Error("CLIENT_URL is required");
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
app.use("/quiz", perMinute(600));
app.use("/classes", perMinute(120));
app.use("/admin", perMinute(120));
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
  .then(() => {
    console.log("MongoDB Connected");

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