const Response = require("../models/Response");
const Question = require("../models/Question");
const adaptive = require("./adaptiveService");
const ml = require("./mlService");

// Answers saved while the ML service was down have learned:false and moved no rating.
// This replays them, oldest first, once the service is back. Flagged sessions (low trust)
// are NOT replayed. Each row is claimed atomically first, so two runs can never count one answer twice.
// Note: the replay uses today's ratings, so the step sizes are close to, not identical to, the original ones.
let running = false;

const last = { at: null, result: null };      // shown on the admin System page

async function reconcile({ limit = 300 } = {}) {
  const out = await runReconcile({ limit });
  if (!out.skipped || out.skipped !== "already running") { last.at = new Date(); last.result = out; }
  return out;
}

async function runReconcile({ limit = 300 } = {}) {
  if (running) return { skipped: "already running" };
  running = true;
  try {
    if (!(await ml.health())) return { skipped: "ML service is down", replayed: 0 };

    const rows = await Response.find({
      learned: false,
      sessionId: { $exists: true, $ne: null },          // trust cannot be checked without a session
      trust: { $gte: adaptive.MIN_TRUST_TO_LEARN },
    }).sort({ createdAt: 1 }).limit(limit).select("_id").lean();

    let replayed = 0, flagged = 0, missingQuestion = 0;
    for (const { _id } of rows) {
      const r = await Response.findOneAndUpdate(
        { _id, learned: false },
        { $set: { learned: true, replayedAt: new Date() } },     // claim it
        { new: false }
      ).lean();
      if (!r) continue;                                          // another run took it

      const question = await Question.findById(r.question);
      if (!question) { missingQuestion++; continue; }

      const result = await adaptive.applyAnswer({
        userId: r.user, question,
        exposure: { mode: r.mode || "practice", sessionId: r.sessionId },
        success: !!r.success,
      });
      if (result.learned) { replayed++; continue; }

      // Not applied. Give the claim back.
      if (result.trust < adaptive.MIN_TRUST_TO_LEARN) {
        // proctoring events arrived after the answer: now flagged, never retry this row
        await Response.updateOne({ _id }, { $set: { learned: false, trust: result.trust }, $unset: { replayedAt: 1 } });
        flagged++;
      } else {
        await Response.updateOne({ _id }, { $set: { learned: false }, $unset: { replayedAt: 1 } });
        return { replayed, flagged, missingQuestion, stopped: "ML service went down again" };
      }
    }
    return { replayed, flagged, missingQuestion, checked: rows.length };
  } finally {
    running = false;
  }
}

module.exports = { reconcile, last };