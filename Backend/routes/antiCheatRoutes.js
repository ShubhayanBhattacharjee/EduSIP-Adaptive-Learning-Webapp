const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const Exposure = require("../models/Exposure");

// Event types the browser may send. Anything else is rejected, so nobody can flood the table with junk.
const ALLOWED = new Set([
  "tab_switch", "window_blur", "fullscreen_exit", "copy_paste", "devtools_attempt",
  "multiple_faces", "forbidden_object", "no_face", "audio", "quiz_terminated",
]);
// Events that count as a "strike". The server counts them itself, so a modified browser cannot hide them.
const STRIKE_TYPES = ["tab_switch", "window_blur", "fullscreen_exit", "multiple_faces", "forbidden_object", "audio", "no_face", "heartbeat_lost"];
const MAX_STRIKES = 3;

async function strikesFor(userId, sessionId) {
  if (!sessionId) return 0;
  return AntiCheatEvent.countDocuments({ user: userId, sessionId, eventType: { $in: STRIKE_TYPES } });
}

// ---- heartbeat: the browser says "still here" every 10 s; silence while answering = a strike ----
const STALE_MS = 45000;
const BOOTED_AT = Date.now();            // after a server restart, old sessions get a fresh grace period
const lastBeat = new Map();              // "user:session" -> time of last heartbeat
const lastStrike = new Map();            // "user:session" -> time of last heartbeat_lost strike

async function checkHeartbeat(userId, sessionId) {
  if (!sessionId) return;
  const key = `${userId}:${sessionId}`;
  const now = Date.now();
  let last = lastBeat.get(key);
  if (!last) {                           // never heard from the browser: count from when the session started
    const first = await Exposure.findOne({ user: userId, sessionId }).sort({ servedAt: 1 }).select("servedAt").lean();
    last = first ? new Date(first.servedAt).getTime() : now;
  }
  last = Math.max(last, BOOTED_AT);
  if (now - last <= STALE_MS) return;
  if (now - (lastStrike.get(key) || 0) < STALE_MS) return;     // one strike per 45 s at most
  lastStrike.set(key, now);
  await AntiCheatEvent.create({ user: userId, sessionId, eventType: "heartbeat_lost", details: { silentSeconds: Math.round((now - last) / 1000) } });
}


async function resolveSession(userId, given) {
  if (given && typeof given === "string") return given.slice(0, 100);
  const recent = await Exposure.findOne({
    user: userId,
    servedAt: { $gt: new Date(Date.now() - 2 * 3600 * 1000) },
  }).sort({ servedAt: -1 }).select("sessionId").lean();
  return recent ? recent.sessionId : undefined;
}

// Save a proctoring event. The adaptive service reads these to decide how much to trust a session.
router.post("/log-event", protect, async (req, res) => {
  try {
    const { details, timestamp, violationCount } = req.body;
    const eventType = String(req.body.eventType || "").toLowerCase();
    if (!eventType) return res.status(400).json({ success: false, message: "eventType is required" });
    if (!ALLOWED.has(eventType)) return res.status(400).json({ success: false, message: "Unknown eventType" });

    const sessionId = await resolveSession(req.user.id, req.body.sessionId);

    let safeDetails = details ?? null;
    try { if (JSON.stringify(safeDetails ?? "").length > 2000) safeDetails = "(too large, dropped)"; }
    catch { safeDetails = null; }

    const clientTime = timestamp && !isNaN(new Date(timestamp)) ? new Date(timestamp) : undefined;
    await AntiCheatEvent.create({
      user: req.user.id, sessionId, eventType, details: safeDetails, clientTime,
      violationCount: Number.isFinite(Number(violationCount)) ? Number(violationCount) : undefined,
    });

    const strikes = await strikesFor(req.user.id, sessionId);
    res.json({ success: true, message: "Event logged successfully", strikes, maxStrikes: MAX_STRIKES, terminated: strikes >= MAX_STRIKES });
  } catch (error) {
    console.error("Error logging anti-cheat event:", error);
    res.status(500).json({ success: false, message: "Failed to log event" });
  }
});

router.post("/heartbeat", protect, async (req, res) => {
  try {
    const sessionId = await resolveSession(req.user.id, req.body.sessionId);
    if (sessionId) {
      lastBeat.set(`${req.user.id}:${sessionId}`, Date.now());
      if (lastBeat.size > 5000) {        // keep memory small: drop beats older than 3 hours
        const cutoff = Date.now() - 3 * 3600 * 1000;
        for (const [k, t] of lastBeat) if (t < cutoff) { lastBeat.delete(k); lastStrike.delete(k); }
      }
    }
    const strikes = await strikesFor(req.user.id, sessionId);
    res.json({ success: true, strikes, maxStrikes: MAX_STRIKES, terminated: strikes >= MAX_STRIKES });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
module.exports.strikesFor = strikesFor;
module.exports.checkHeartbeat = checkHeartbeat;
module.exports.MAX_STRIKES = MAX_STRIKES;
