const Question = require("../models/Question");
const Response = require("../models/Response");
const SkillState = require("../models/SkillState");
const Exposure = require("../models/Exposure");
const AntiCheatEvent = require("../models/AntiCheatEvent");
const Topic = require("../models/Topic");
const User = require("../models/User");
const ml = require("./mlService");

// ---------------------------------------------------------------------------------
// The adaptive logic. The backend owns ALL state (MongoDB). The ML service is stateless:
// it receives numbers and returns numbers. This file is the only place that connects them.
// ---------------------------------------------------------------------------------

const OVERALL = "__overall__";            // subject-wide ability row in SkillState
const SESSION_LENGTH = { practice: 10, level: 10, placement: 10 };   // placement length really comes from the stored test

// ---- the 1-10 scale. MUST match ml/src/level.py (SCALE_CENTER 5, SCALE_SLOPE 2) ----
// One scale for students AND questions: a level-6 question is a fair match for a level-6 student.
const LABEL_ABILITY = { easy: -1, medium: 0, hard: 1 };
const toScale = (x) => Math.min(10, Math.max(1, Math.floor(5 + 2 * Number(x) + 0.5)));
const bandOf = (level) => (level <= 3 ? "Beginner" : level <= 5 ? "Developing" : level <= 7 ? "Proficient" : "Advanced");
const seedElo = (q) => (q.level != null ? (Number(q.level) - 5) / 2 : (LABEL_ABILITY[q.difficulty] ?? 0));
const questionLevel = (q) => toScale(q.elo ?? seedElo(q));

const SETTINGS = {
  // target = wanted chance of success; explore = share of picks used to learn new questions;
  // kMultiplier = how much faster ability moves (the level test must move fast);
  // coveragePenalty = spreads the level test over topics.
  practice: { target: 0.7, explore: 0.1, kMultiplier: 2, coveragePenalty: 0 },
  level: { target: 0.5, explore: 0, kMultiplier: 4, coveragePenalty: 0.08 },
};

const MIN_TRUST_TO_LEARN = 0.3;           // below this the answer is recorded but moves no rating
const RECENT_DAYS = 3;                    // avoid repeating a question seen in the last 3 days

// Weight of each proctoring event. Unknown event types count as 1.
const EVENT_WEIGHT = {
  tab_switch: 1, window_blur: 0.5, fullscreen_exit: 1, copy_paste: 1,
  multiple_faces: 2, forbidden_object: 2, gaze_away: 0.5, audio: 1,
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ci = (s) => new RegExp(`^${escapeRegex(s)}$`, "i");   // exact, case-insensitive, no regex injection

// What the student's browser may see. Never the answer, never the hint.
const publicQuestion = (q) => ({
  _id: q._id, subject: q.subject, topic: q.topic, difficulty: q.difficulty,
  level: questionLevel(q),                 // 1 to 10, same scale as the student's level
  questionText: q.questionText, options: q.options,
});

// Adaptive for half the students, plain random practice for the other half (the pilot's
// control group). FORCE_ADAPTIVE=true in .env gives everyone the adaptive version (demos).
// An admin can also set user.group by hand.
async function policyFor(userId) {
  if (process.env.FORCE_ADAPTIVE === "true") return "adaptive";
  const u = await User.findById(userId).select("group").lean();
  if (u && (u.group === "adaptive" || u.group === "control")) return u.group;
  return process.env.PILOT_MODE === "true" && parseInt(String(userId).slice(-1), 16) % 2 !== 0 ? "control" : "adaptive";
}

async function getSkill(userId, subject, topic) {
  const key = { user: userId, subject, topic };
  let s = await SkillState.findOne(key);
  if (s) return s;
  let ability = 0;
  if (topic !== OVERALL) {                 // a new topic starts from the student's subject-wide level
    const overall = await SkillState.findOne({ user: userId, subject, topic: OVERALL }).lean();
    if (overall) ability = overall.ability;
  }
  try {
    s = await SkillState.create({ ...key, ability });
  } catch (e) {
    if (e.code !== 11000) throw e;         // two requests created it at once: just read it
    s = await SkillState.findOne(key);
  }
  return s;
}

// 1 = clean session. Each proctoring event lowers it. Shared by every answer in the session.
async function integrityTrust(userId, sessionId) {
  const events = await AntiCheatEvent.find({ user: userId, sessionId }).select("eventType").lean();
  const points = events.reduce((sum, e) => sum + (EVENT_WEIGHT[e.eventType] ?? 1), 0);
  return Math.max(0, Number((1 - 0.15 * points).toFixed(2)));
}

const toCandidate = (q) => ({
  question_id: String(q._id),
  difficulty: q.elo ?? seedElo(q),            // learned number once the question has answers
  label: q.difficulty,                     // starting guess until then
  question_attempts: q.attempts || 0,
  topic: q.topic,
});

// Choose the next question and record, on the server, exactly what we did and why.
async function pickNext({ userId, subject, topic, sessionId, mode, total, target }) {
  const cfg = { ...SETTINGS[mode] };
  if (mode === "practice") {
    // The study plan can ask for an easier (remediate 0.75) or harder (stretch 0.6) session. The wish is stored with the
    // first question of the session and reused for every next question, so the browser only has to send it once.
    let wanted = Number(target);
    if (!(wanted >= 0.4 && wanted <= 0.9)) {
      const first = await Exposure.findOne({ user: userId, sessionId }).sort({ servedAt: 1 }).select("target").lean();
      wanted = first && first.target;
    }
    if (wanted >= 0.4 && wanted <= 0.9) cfg.target = wanted;
  }
  const filter = { subject, status: { $nin: ["pending", "rejected"] } };   // old questions have no status: still allowed
  if (mode === "practice") filter.topic = topic;
  const bank = await Question.find(filter).select("-correctAnswer -misconceptions -hint").lean();

  const inSession = new Set((await Response.distinct("question", { user: userId, sessionId })).map(String));
  const since = new Date(Date.now() - RECENT_DAYS * 864e5);
  const recent = new Set((await Response.distinct("question", { user: userId, createdAt: { $gt: since } })).map(String));

  let pool = bank.filter((q) => !inSession.has(String(q._id)) && !recent.has(String(q._id)));
  if (pool.length < 5) pool = bank.filter((q) => !inSession.has(String(q._id)));   // small bank: allow repeats from earlier days
  if (!pool.length) return null;

  const state = await getSkill(userId, subject, mode === "level" ? OVERALL : topic);
  let policy = await policyFor(userId);

  let pick;
  if (policy === "control") {
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    pick = { question_id: String(chosen._id), p_success: null, propensity: 1 / pool.length, reason: "random", model_version: "control-random" };
  } else {
    let topicCounts = {};
    if (cfg.coveragePenalty > 0) {          // level test: how many questions per topic so far
      const done = await Response.find({ user: userId, sessionId }).select("topic").lean();
      for (const r of done) topicCounts[r.topic] = (topicCounts[r.topic] || 0) + 1;
    }
    pick = await ml.nextQuestion({
      ability: state.ability, candidates: pool.map(toCandidate),
      target: cfg.target, explore: cfg.explore, topicCounts, coveragePenalty: cfg.coveragePenalty,
    });
    if (pick.source === "fallback") policy = "fallback";
  }

  // the ML service should only ever return an id from the pool; if it does not, do not crash the quiz
  const chosen = pool.find((q) => String(q._id) === pick.question_id) || pool[0];
  await Exposure.create({
    user: userId, sessionId, question: chosen._id, subject, topic: chosen.topic, mode, policy,
    reason: pick.reason, predictedSuccess: pick.p_success, propensity: pick.propensity, target: cfg.target,
    abilityAtPick: state.ability, modelVersion: pick.model_version, sessionTotal: total,
  });
  return { question: publicQuestion(chosen), policy, reason: pick.reason };
}

// Apply one answer: update ability (topic and subject-wide) and the question's difficulty.
async function applyAnswer({ userId, question, exposure, success }) {
  if (exposure.mode === "placement") {      // the placement test only COLLECTS answers; the level is computed once at the end
    return { trust: await integrityTrust(userId, exposure.sessionId), learned: false,
             abilityBefore: null, abilityAfter: null, difficultyBefore: question.elo ?? null };
  }
  const cfg = SETTINGS[exposure.mode];
  const trust = await integrityTrust(userId, exposure.sessionId);
  const topicState = await getSkill(userId, question.subject, question.topic);
  const overall = await getSkill(userId, question.subject, OVERALL);
  const shown = exposure.mode === "level" ? overall : topicState;

  const result = {
    trust, learned: false,
    abilityBefore: exposure.abilityAtPick ?? shown.ability, abilityAfter: shown.ability,
    difficultyBefore: question.elo ?? null,
  };
  if (trust < MIN_TRUST_TO_LEARN) return result;       // flagged session: keep the record, do not learn from it

  const base = {
    label: question.difficulty, difficulty: question.elo ?? seedElo(question), success, trust,
    question_attempts: question.attempts || 0, k_multiplier: cfg.kMultiplier,
  };
  const t = await ml.updateState({ ...base, ability: topicState.ability, student_attempts: topicState.attempts || 0 });
  if (!t) return result;                               // ML service down: record the answer, skip the update

  topicState.ability = t.new_ability;
  topicState.attempts = (topicState.attempts || 0) + 1;
  topicState.lastPracticedAt = new Date();
  await topicState.save();

  const o = await ml.updateState({ ...base, ability: overall.ability, student_attempts: overall.attempts || 0, update_question: false });
  if (o) {
    overall.ability = o.new_ability;
    overall.attempts = (overall.attempts || 0) + 1;
    overall.lastPracticedAt = new Date();
    await overall.save();
  }

  await Question.updateOne({ _id: question._id }, {
    $set: { elo: t.new_difficulty },
    $inc: { attempts: 1, correctCount: success ? 1 : 0 },
  });

  result.learned = true;
  result.abilityAfter = exposure.mode === "level" ? (o ? o.new_ability : overall.ability) : t.new_ability;
  return result;
}

// Weak-topic finder: after repeated misses, point back to the weakest earlier topic.
async function findRemedial({ userId, subject, topic }) {
  const last = await Response.find({ user: userId, subject, topic }).sort({ createdAt: -1 }).limit(5).select("success").lean();
  const fails = last.filter((r) => !r.success).length;
  if (last.length < 4 || fails < 3) return null;

  const t = await Topic.findOne({ subject, name: topic }).lean();
  if (!t || !t.prerequisites.length) return null;

  const states = await SkillState.find({ user: userId, subject, topic: { $in: t.prerequisites } }).lean();
  const byTopic = new Map(states.map((s) => [s.topic, s]));
  const weakest = t.prerequisites
    .map((p) => ({ topic: p, ability: byTopic.get(p)?.ability ?? 0 }))
    .sort((a, b) => a.ability - b.ability)[0];
  return {
    fromTopic: topic,
    backTo: weakest.topic,
    reason: `You missed ${fails} of your last ${last.length} questions in ${topic}. ${weakest.topic} is the earlier topic it builds on.`,
  };
}

/* ------------------------------------------------------------------
   STUDY PLAN for one student: what to study now, how many questions, how many minutes.
   Used by GET /quiz/study-plan and by the dashboard. Returns null if the ML service is down.
------------------------------------------------------------------ */
async function buildStudyPlan(userId, { minutes = 30, subject } = {}) {
  const filter = { user: userId, topic: { $ne: OVERALL } };
  if (subject) filter.subject = ci(subject);
  const states = await SkillState.find(filter).lean();
  if (!states.length) return { empty: true, plan: { headline: "No topics yet. Take the level test first.", plan: [], topics: [], subjects: [] } };

  const topicDocs = await Topic.find({ subject: { $in: [...new Set(states.map((s) => s.subject))] } }).lean();
  const prereq = new Map(topicDocs.map((t) => [`${t.subject}|${t.name}`, t.prerequisites || []]));

  const recent = await Response.find({ user: userId }).sort({ createdAt: -1 }).limit(50).select("timeTaken").lean();
  const times = recent.map((r) => r.timeTaken).filter((t) => t > 0);
  const avg = times.length >= 5 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : Number(process.env.DEFAULT_SECONDS_PER_QUESTION || 120);
    // topics in the bank this student was never asked about: start them at the subject-wide level
  const subjectsInPlay = [...new Set(states.map((s) => s.subject))];
  const bankTopics = await Question.aggregate([
    { $match: { status: { $nin: ["pending", "rejected"] }, subject: { $in: subjectsInPlay } } },
    { $group: { _id: { subject: "$subject", topic: "$topic" } } },
  ]);
  const have = new Set(states.map((s) => `${s.subject}|${s.topic}`));
  const overallRows = await SkillState.find({ user: userId, topic: OVERALL, subject: { $in: subjectsInPlay } }).lean();
  const subjectAbility = new Map(overallRows.map((r) => [r.subject, r.ability]));
  const unseen = bankTopics.map((b) => b._id).filter((b) => !have.has(`${b.subject}|${b.topic}`))
    .map((b) => ({ subject: b.subject, topic: b.topic, ability: subjectAbility.get(b.subject) ?? 0, attempts: 0, lastPracticedAt: null, placed: false }));
  const now = Date.now();
  const topics = [...states, ...unseen].map((s) => ({
    subject: s.subject, topic: s.topic, ability: s.ability, attempts: s.attempts || 0,
    days_since_last: s.lastPracticedAt ? Math.max(0, (now - new Date(s.lastPracticedAt).getTime()) / 864e5) : null,
    weight: 1, prerequisites: prereq.get(`${s.subject}|${s.topic}`) || [], placed: !!s.placed,
  }));
  const plan = await ml.studyPlan({ topics, minutes, seconds_per_question: Math.min(Math.max(avg, 20), 600) });
  return plan ? { empty: false, plan } : null;
}

// The single "start here" card: first item of the plan, in plain fields the frontend can show.
function startHere(plan) {
  const first = plan && plan.plan && plan.plan[0];
  if (!first) return null;
  return {
    subject: first.subject, topic: first.topic, questions: first.questions, minutes: first.minutes,
    mode: first.mode, targetSuccess: first.target_success, action: first.action, reason: first.reason,
    headline: plan.headline,
  };
}

module.exports = { seedElo, toScale, bandOf, questionLevel, buildStudyPlan, startHere, MIN_TRUST_TO_LEARN, OVERALL, SESSION_LENGTH, ci, escapeRegex, publicQuestion, policyFor, getSkill, integrityTrust, pickNext, applyAnswer, findRemedial };