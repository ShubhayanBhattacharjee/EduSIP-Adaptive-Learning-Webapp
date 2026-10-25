const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const Exposure = require("../models/Exposure");

// Save proctoring events in the database. The adaptive service reads them to decide
// how much to trust a session. If the browser does not send sessionId, we attach the
// student's most recent session from the last 2 hours.
router.post("/log-event", protect, async (req, res) => {
  try {
    const { eventType, details, timestamp, violationCount } = req.body;
    if (!eventType) return res.status(400).json({ success: false, message: "eventType is required" });

    let sessionId = req.body.sessionId;
    if (!sessionId) {
      const recent = await Exposure.findOne({
        user: req.user.id,
        servedAt: { $gt: new Date(Date.now() - 2 * 3600 * 1000) },
      }).sort({ servedAt: -1 }).select("sessionId").lean();
      sessionId = recent ? recent.sessionId : undefined;
    }

    await AntiCheatEvent.create({
      user: req.user.id,
      sessionId,
      eventType: String(eventType).slice(0, 50),
            details: JSON.stringify(details ?? "").length > 2000 ? "(too large, dropped)" : details,
      clientTime: timestamp ? new Date(timestamp) : undefined,
      violationCount,
    });

    res.json({ success: true, message: "Event logged successfully" });
  } catch (error) {
    console.error("Error logging anti-cheat event:", error);
    res.status(500).json({ success: false, message: "Failed to log event" });
  }
});

module.exports = router;