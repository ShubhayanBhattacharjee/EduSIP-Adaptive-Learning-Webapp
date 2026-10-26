const axios = require("axios");

// Talks to the Python ML service. Every function returns null (or a clearly marked
// fallback) when the service is down, so the quiz never silently pretends the model answered.
const client = axios.create({
  baseURL: process.env.ML_URL || "http://127.0.0.1:8000",
  timeout: Number(process.env.ML_TIMEOUT_MS || 8000),
  headers: process.env.ML_API_KEY ? { "X-API-KEY": process.env.ML_API_KEY } : {},
});

const LABEL_ABILITY = { easy: -1, medium: 0, hard: 1 };

async function call(path, body) {
  try {
    const { data } = await client.post(path, body);
    return data;
  } catch (error) {
    console.error(`ML ${path} failed:`, error.response?.data || error.message);
    return null;
  }
}

// Which question next? Returns { question_id, p_success, propensity, reason, model_version, source }.
// If the ML service is down we use a visible, simple rule and mark it source:"fallback".
exports.nextQuestion = async ({ ability, candidates, target, explore, topicCounts, coveragePenalty }) => {
  const data = await call("/next-question", {
    ability, candidates, exclude: [], target, explore,
    topic_counts: topicCounts || {}, coverage_penalty: coveragePenalty || 0,
  });
  if (data) return { ...data, source: "ml" };

  // Fallback rule: pick the question whose label is closest to the student's level.
  const best = [...candidates].sort((a, b) =>
    Math.abs((a.difficulty ?? LABEL_ABILITY[a.label] ?? 0) - ability) -
    Math.abs((b.difficulty ?? LABEL_ABILITY[b.label] ?? 0) - ability)
  )[0];
  return {
    question_id: best.question_id,
    p_success: null,
    propensity: null,          // unknown: never use fallback picks in causal analysis
    reason: "fallback",
    model_version: "fallback-rule",
    source: "fallback",
  };
};

// After an answer: new ability for the student and new difficulty for the question,
// or null if the service is down (the answer is still saved, but no rating moves).
exports.updateState = (body) => call("/update-state", body);

// Placement test: answers -> level 1-10 and per-subject / per-topic abilities (see ml/src/level.py).
exports.estimateLevel = (items) => call("/estimate-level", { items });

// What should this student study now? (see ml/src/planner.py)
exports.studyPlan = (body) => call("/study-plan", body);

exports.tutorPlan = (topics) => call("/tutor/plan", { topics });
exports.hint = (body) => call("/tutor/hint", body);
exports.explain = (body) => call("/ai-explain", body);

// Admin tool: the AI writes questions and the service checks them. Slow (one AI call
// per question), so allow 2 minutes.
exports.generateQuestions = async (body) => {
  try {
    const { data } = await client.post("/generate-questions", body, { timeout: 120000 });
    return data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message);
  }
};

// After scripts/refit_elo.py writes new numbers: load them without restarting the ML service.
exports.reloadParams = () => call("/reload-params", {});

// Super admin screen: the method, its settings and the research numbers.
exports.modelInfo = async () => {
  try {
    const { data } = await client.get("/model-info", { timeout: 5000 });
    return data;
  } catch {
    return null;
  }
};

exports.health = async () => {
  try {
    const { data } = await client.get("/health", { timeout: 3000 });
    return data;
  } catch {
    return null;
  }
};

// ---- YouTube recommendations (unchanged behaviour; recommendationService still imports this) ----
exports.getYouTubeVideos = async (query) => {
  try {
    const res = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        part: "snippet",
        q: query,
        key: process.env.YOUTUBE_API_KEY,   // read when called, not when the file loads
        maxResults: 2,
        type: "video",
      },
    });
    return res.data.items.map((item) => ({
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnail: item.snippet.thumbnails.medium.url,
    }));
  } catch (err) {
    console.error("YT API Error:", err.message);
    return [];
  }
};