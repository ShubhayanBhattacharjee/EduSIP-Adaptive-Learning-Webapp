const mongoose = require("mongoose");
const PlacementTest = require("../models/PlacementTest");
const Question = require("../models/Question");
const User = require("../models/User");
const placement = require("../services/placementService");
const { questionLevel } = require("../services/adaptiveService");

// Admin: look at the active placement test.
exports.getPlacementTest = async (req, res) => {
  try {
    const test = await placement.getActiveTest();
    const qs = await Question.find({ _id: { $in: test.questionIds } }).select("subject topic difficulty level elo questionText").lean();
    const byId = new Map(qs.map((q) => [String(q._id), q]));
    const questions = test.questionIds.map((id) => byId.get(String(id))).filter(Boolean)
      .map((q) => ({ _id: q._id, subject: q.subject, topic: q.topic, level: questionLevel(q), questionText: q.questionText }));
    res.json({ success: true, version: test.version, source: test.source, questions });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Admin: rebuild it. Body {} = choose automatically; { questionIds: [...] } = use exactly these, in this order.
// A new version only affects students who have not taken the test yet.
exports.rebuildPlacementTest = async (req, res) => {
  try {
    const ids = req.body && req.body.questionIds;
    let test;
    if (Array.isArray(ids) && ids.length) {
      if (!ids.every((i) => mongoose.isValidObjectId(i))) return res.status(400).json({ success: false, message: "questionIds must be valid ids" });
      test = await placement.buildManualTest(ids, req.user.id);
    } else {
      test = await placement.buildAutoTest(req.user.id);
    }
    res.json({ success: true, version: test.version, source: test.source, count: test.questionIds.length });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

// Admin: let one student take the placement test again.
exports.resetPlacement = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false });
    await User.updateOne({ _id: req.params.id }, { $set: { "placement.done": false } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false });
  }
};
