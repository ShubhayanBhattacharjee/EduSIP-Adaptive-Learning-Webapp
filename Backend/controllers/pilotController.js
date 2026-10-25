const Response = require("../models/Response");
const { ci } = require("../services/adaptiveService");
const { reconcile } = require("../services/reconcileService");

const MIN_ANSWERS = 30;     // fewer answers than this per group: too early to compare

/* GET /admin/pilot-report?subject=Java&days=30
   Adaptive group vs control group. A higher raw success rate is NOT the goal: the adaptive
   policy aims for about 70% on purpose. Compare level-test gain and engagement, and check
   that the model's predictions are calibrated. */
exports.pilotReport = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const match = {
      createdAt: { $gt: new Date(Date.now() - days * 864e5) },
      policy: { $in: ["adaptive", "control", "fallback"] },
    };
    if (req.query.subject) match.subject = ci(req.query.subject);
    const yes = { $cond: [{ $eq: ["$success", true] }, 1, 0] };

    const [groups, buckets, brier, levelRows] = await Promise.all([
      Response.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$policy", answers: { $sum: 1 }, users: { $addToSet: "$user" }, sessions: { $addToSet: "$sessionId" },
            successes: { $sum: yes },
            hinted: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$hintsUsed", 0] }, 0] }, 1, 0] } },
            avgSeconds: { $avg: "$timeTaken" },
          },
        },
        { $project: { answers: 1, successes: 1, hinted: 1, avgSeconds: 1, students: { $size: "$users" }, sessions: { $size: "$sessions" } } },
      ]),
      Response.aggregate([
        { $match: { ...match, policy: "adaptive", predictedSuccess: { $ne: null } } },
        {
          $bucket: {
            groupBy: "$predictedSuccess", boundaries: [0, 0.3, 0.5, 0.7, 0.9, 1.0001], default: "other",
            output: { n: { $sum: 1 }, avgPredicted: { $avg: "$predictedSuccess" }, actual: { $avg: yes } },
          },
        },
      ]),
      Response.aggregate([
        { $match: { ...match, policy: "adaptive", predictedSuccess: { $ne: null } } },
        { $group: { _id: null, n: { $sum: 1 }, brier: { $avg: { $pow: [{ $subtract: ["$predictedSuccess", yes] }, 2] } } } },
      ]),
      // level tests: where did each session leave the student's subject-wide ability?
      Response.aggregate([
        { $match: { ...match, mode: "level", learned: true } },
        { $sort: { createdAt: 1 } },
        { $group: { _id: { user: "$user", session: "$sessionId" }, policy: { $first: "$policy" }, endedAt: { $last: "$createdAt" }, ability: { $last: "$abilityAfter" } } },
      ]),
    ]);

    // learning gain = ability after the student's latest level test minus after the first one (needs 2+ tests)
    const perUser = new Map();
    for (const s of levelRows) {
      const k = String(s._id.user);
      if (!perUser.has(k)) perUser.set(k, []);
      perUser.get(k).push(s);
    }
    const gains = {};
    for (const sessions of perUser.values()) {
      if (sessions.length < 2) continue;
      sessions.sort((a, b) => a.endedAt - b.endedAt);
      const g = sessions[sessions.length - 1].ability - sessions[0].ability;
      (gains[sessions[0].policy] = gains[sessions[0].policy] || []).push(g);
    }

    const policies = {};
    for (const g of groups) {
      const gl = gains[g._id] || [];
      policies[g._id] = {
        students: g.students, sessions: g.sessions, answers: g.answers,
        answersPerStudent: Number((g.answers / g.students).toFixed(1)),
        successRate: Number((g.successes / g.answers).toFixed(3)),
        hintRate: Number((g.hinted / g.answers).toFixed(3)),
        avgSeconds: g.avgSeconds == null ? null : Number(g.avgSeconds.toFixed(1)),
        levelTestGain: { students: gl.length, mean: gl.length ? Number((gl.reduce((a, b) => a + b, 0) / gl.length).toFixed(3)) : null },
        enoughData: g.answers >= MIN_ANSWERS,
      };
    }

    const warnings = [];
    if (!policies.control) warnings.push("No control group yet. Remove FORCE_ADAPTIVE from .env so half the students get random practice.");
    if (!policies.adaptive) warnings.push("No adaptive answers in this period.");
    if (policies.fallback) warnings.push("Some answers were served by the fallback rule because the ML service was down.");
    for (const [name, p] of Object.entries(policies)) {
      if (!p.enoughData) warnings.push(`${name}: only ${p.answers} answers, too early to compare (need ${MIN_ANSWERS}+).`);
    }

    res.json({
      success: true, days, subject: req.query.subject || "all", policies,
      calibration: {
        brierScore: brier[0] ? Number(brier[0].brier.toFixed(4)) : null,       // lower is better; 0.25 = always guessing 50%
        answers: brier[0] ? brier[0].n : 0,
        buckets: buckets.map((b) => ({
          predictedRange: b._id === "other" ? "other" : `${b._id}+`, answers: b.n,
          avgPredicted: Number(b.avgPredicted.toFixed(3)), actualRate: Number(b.actual.toFixed(3)),
        })),
      },
      warnings,
    });
  } catch (error) {
    console.error("Pilot report error:", error);
    res.status(500).json({ success: false, message: "Failed to build pilot report" });
  }
};

// POST /admin/reconcile : run the replay now instead of waiting for the timer
exports.runReconcile = async (req, res) => {
  try {
    res.json({ success: true, result: await reconcile({ limit: Number(req.body?.limit) || 300 }) });
  } catch (error) {
    console.error("Reconcile error:", error);
    res.status(500).json({ success: false, message: "Reconcile failed" });
  }
};