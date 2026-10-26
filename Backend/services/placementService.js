const Question = require("../models/Question");
const Response = require("../models/Response");
const Exposure = require("../models/Exposure");
const SkillState = require("../models/SkillState");
const PlacementTest = require("../models/PlacementTest");
const User = require("../models/User");
const ml = require("./mlService");
const adaptive = require("./adaptiveService");

// ---------------------------------------------------------------------------------
// PLACEMENT TEST: the same 10 questions, in the same order, for every new student.
//
// Why fixed and not adaptive? Because the result must be comparable between students
// ("level 6" must mean the same thing for everyone), and because it is the cleanest data
// for calibrating those 10 questions. The adaptive part starts AFTER this test.
//
// Flow:  start -> (answer x10, no hints) -> finalize -> ML /estimate-level -> User.placement
//        + SkillState rows seeded -> dashboard shows the level and a "start here" card.
// ---------------------------------------------------------------------------------

const APPROVED = { $nin: ["pending", "rejected"] };
const settings = require("./settingsService");
const MIN_SIZE = 5;                                         // below this the test would be too weak to trust
const WANTED_LEVELS = [5, 3, 7, 5, 4, 8, 3, 6, 9, 6];   // strong students need harder questions to show it    // a spread: mostly middle, some easy, some hard

// Deterministic choice (no randomness), so rebuilding on the same bank gives the same test.
function chooseQuestions(bank, size) {
  const groups = new Map();                                 // subject -> topic -> questions
  for (const q of [...bank].sort((a, b) => String(a._id).localeCompare(String(b._id)))) {
    if (!groups.has(q.subject)) groups.set(q.subject, new Map());
    const topics = groups.get(q.subject);
    if (!topics.has(q.topic)) topics.set(q.topic, []);
    topics.get(q.topic).push(q);
  }
  // visiting order: round-robin over subjects, and inside a subject round-robin over topics
  const subjects = [...groups.keys()].sort();
  const cursor = new Map(subjects.map((s) => [s, 0]));
  const used = new Set();
  const picked = [];
  let guard = 0;
  while (picked.length < size && guard++ < size * 50) {
    let progressed = false;
    for (const s of subjects) {
      if (picked.length >= size) break;
      const topicNames = [...groups.get(s).keys()].sort();
      const topic = topicNames[cursor.get(s) % topicNames.length];
      cursor.set(s, cursor.get(s) + 1);
      const want = WANTED_LEVELS[picked.length % WANTED_LEVELS.length];
      const options = groups.get(s).get(topic).filter((q) => !used.has(String(q._id)));
      if (!options.length) continue;
      options.sort((a, b) => Math.abs(adaptive.questionLevel(a) - want) - Math.abs(adaptive.questionLevel(b) - want));
      used.add(String(options[0]._id));
      picked.push(options[0]);
      progressed = true;
    }
    if (!progressed) break;
  }
  // easy first, hard last: a calmer start, and the order is the same for everyone
  return picked.sort((a, b) => adaptive.questionLevel(a) - adaptive.questionLevel(b) || String(a._id).localeCompare(String(b._id)));
}

async function saveTest(questionIds, { source, createdBy }) {
  const last = await PlacementTest.findOne({}).sort({ version: -1 }).lean();
  await PlacementTest.updateMany({ active: true }, { $set: { active: false } });
  return PlacementTest.create({ version: (last ? last.version : 0) + 1, questionIds, active: true, source, createdBy });
}

async function buildAutoTest(createdBy) {
  const bank = await Question.find({ status: APPROVED }).select("subject topic difficulty level elo").lean();
  const chosen = chooseQuestions(bank, settings.get("placementSize"));
  if (chosen.length < MIN_SIZE) throw new Error(`Need at least ${MIN_SIZE} approved questions for a placement test (found ${chosen.length}).`);
  return saveTest(chosen.map((q) => q._id), { source: "auto", createdBy });
}

async function buildManualTest(ids, createdBy) {
  const found = await Question.find({ _id: { $in: ids }, status: APPROVED }).select("_id").lean();
  const ok = new Set(found.map((q) => String(q._id)));
  const ordered = ids.filter((i) => ok.has(String(i)));
  if (ordered.length < MIN_SIZE) throw new Error(`Need at least ${MIN_SIZE} approved questions (got ${ordered.length}).`);
  return saveTest(ordered, { source: "manual", createdBy });
}

async function getActiveTest() {
  const t = await PlacementTest.findOne({ active: true }).lean();
  return t || buildAutoTest();
}

async function status(userId) {
  const u = await User.findById(userId).select("placement").lean();
  const p = (u && u.placement) || {};
  const ageDays = p.completedAt ? (Date.now() - new Date(p.completedAt).getTime()) / 864e5 : null;
  return { done: !!p.done, canRetake: !!p.done && ageDays !== null && ageDays >= settings.get("placementRetakeDays"), placement: p.done ? p : null };
}

// Serve question number n (0-based) of the fixed test, and record the exposure.
async function serve(userId, sessionId, test) {
  const answered = new Set((await Response.distinct("question", { user: userId, sessionId })).map(String));
  const nextId = test.questionIds.map(String).find((id) => !answered.has(id));
  if (!nextId) return null;
  const q = await Question.findById(nextId).select("-correctAnswer -misconceptions -hint").lean();
  if (!q) return null;
  await Exposure.create({
    user: userId, sessionId, question: q._id, subject: q.subject, topic: q.topic, mode: "placement",
    policy: "fixed", reason: "fixed", propensity: 1, modelVersion: `placement-v${test.version}`,
  });
  return adaptive.publicQuestion(q);
}

// Start, or continue a test that was left half-way (same session, same question).
async function startOrResume(userId, crypto) {
  const st = await status(userId);
  if (st.done && !st.canRetake) return { error: "done", placement: st.placement };

  const test = await getActiveTest();
  const open = await Exposure.findOne({ user: userId, mode: "placement", answered: false }).sort({ servedAt: -1 });
  if (open) {
    const q = await Question.findById(open.question).select("-correctAnswer -misconceptions -hint").lean();
    const count = await Response.countDocuments({ user: userId, sessionId: open.sessionId });
    if (q) return { sessionId: open.sessionId, total: test.questionIds.length, answered: count, question: adaptive.publicQuestion(q), resumed: true };
  }
  const sessionId = crypto.randomUUID();
  const question = await serve(userId, sessionId, test);
  if (!question) return { error: "empty" };
  return { sessionId, total: test.questionIds.length, answered: 0, question, resumed: false };
}

// Called after every placement answer. Returns the next question, or null when the test is over.
async function next(userId, sessionId) {
  const test = await getActiveTest();
  const question = await serve(userId, sessionId, test);
  return { question, total: test.questionIds.length };
}

async function seedSkill(userId, subject, topic, ability, answered) {
  let s = await SkillState.findOne({ user: userId, subject, topic });
  if (s && (s.attempts || 0) > 0 && !s.placed) return;       // a student with real practice history keeps it
  if (!s) s = await SkillState.create({ user: userId, subject, topic });
  s.ability = ability; s.attempts = answered; s.placed = true; s.lastPracticedAt = new Date();
  await s.save();
}

// Turn the 10 answers into a level. Safe to call twice (idempotent), and safe if the ML service was down.
async function finalize(userId, sessionId) {
  const done = await status(userId);
  if (done.done && done.placement && done.placement.sessionId === sessionId) return { ok: true, placement: done.placement, already: true };

  const rows = await Response.find({ user: userId, sessionId, mode: "placement" }).sort({ createdAt: 1 }).lean();
  const test = await getActiveTest();
  if (rows.length < test.questionIds.length) {
    return { ok: false, reason: "incomplete", answered: rows.length, total: test.questionIds.length };
  }

  const trust = await adaptive.integrityTrust(userId, sessionId);
  if (trust < adaptive.MIN_TRUST_TO_LEARN) return { ok: false, reason: "flagged", trust };   // not saved: the student may retake

  const qs = await Question.find({ _id: { $in: rows.map((r) => r.question) } }).select("elo difficulty level").lean();
  const byId = new Map(qs.map((q) => [String(q._id), q]));
  const items = rows.map((r) => {
    const q = byId.get(String(r.question)) || {};
    return { subject: r.subject, topic: r.topic, success: !!r.isCorrect, difficulty: q.elo ?? adaptive.seedElo(q), label: q.difficulty || "medium" };
  });

  const est = await ml.estimateLevel(items);
  if (!est) return { ok: false, reason: "ml_unavailable" };

  const o = est.overall;
  const placement = {
    done: true, completedAt: new Date(), sessionId, ability: o.ability, se: o.se, level: o.level, band: o.band,
    confidence: o.confidence, correct: est.correct, total: est.total, testVersion: test.version,
    subjects: est.subjects.map((s) => ({ subject: s.subject, ability: s.ability, level: s.level, band: s.band, answered: s.answered })),
  };
  await User.updateOne({ _id: userId }, { $set: { placement } });
  for (const s of est.subjects) await seedSkill(userId, s.subject, adaptive.OVERALL, s.ability, s.answered);
  for (const t of est.topics) await seedSkill(userId, t.subject, t.topic, t.ability, t.answered);
  return { ok: true, placement };
}

// The student's CURRENT level: the placement result, kept up to date by every later answer.
async function liveLevel(userId, placementDoc) {
  const rows = await SkillState.find({ user: userId, topic: adaptive.OVERALL }).lean();
  if (!rows.length) {
    if (!placementDoc) return null;
    return { ability: placementDoc.ability, level: placementDoc.level, band: placementDoc.band, subjects: placementDoc.subjects || [] };
  }
  const w = rows.map((r) => Math.max(r.attempts || 0, 1));
  const ability = rows.reduce((sum, r, i) => sum + r.ability * w[i], 0) / w.reduce((a, b) => a + b, 0);
  const level = adaptive.toScale(ability);
  return {
    ability: Number(ability.toFixed(3)), level, band: adaptive.bandOf(level),
    subjects: rows.map((r) => ({ subject: r.subject, ability: Number(r.ability.toFixed(3)), level: adaptive.toScale(r.ability), band: adaptive.bandOf(adaptive.toScale(r.ability)), answered: r.attempts || 0 })),
  };
}

// Everything the dashboard needs about "where am I and what next".
async function summary(userId, minutes = 20) {
  const st = await status(userId);
  const level = await liveLevel(userId, st.placement);
  let startHere = null;
  if (st.done) {
    const plan = await adaptive.buildStudyPlan(userId, { minutes });
    if (plan && !plan.empty) startHere = adaptive.startHere(plan.plan);
  }
  return { placementDone: st.done, canRetake: st.canRetake, placement: st.placement, level, startHere };
}

module.exports = {
  liveLevel, summary, get SIZE() { return settings.get("placementSize"); }, chooseQuestions, buildAutoTest, buildManualTest, getActiveTest, status, startOrResume, next, finalize,
};
