const { getYouTubeVideos } = require("./mlService");

exports.generateRecommendations = async ({
  accuracy,
  responses,
  knowledge,
  subject,
}) => {

  if (!responses || responses.length === 0) {
    return {
      message: "No data available yet.",
      videos: [],
      knowledgeLevel: "unknown",
    };
  }

  // =====================================================
  // 🔥 KNOWLEDGE LEVEL CLASSIFICATION
  // =====================================================
  let knowledgeLevel = "medium";

  if (knowledge < 0.4) knowledgeLevel = "weak";
  else if (knowledge > 0.75) knowledgeLevel = "strong";

  // =====================================================
  // ✅ Topic Stats
  // =====================================================
  const topicStats = {};

  responses.forEach((r) => {
    if (!r.topic) return;

    if (!topicStats[r.topic]) {
      topicStats[r.topic] = { total: 0, correct: 0 };
    }

    topicStats[r.topic].total++;
    if (r.isCorrect) topicStats[r.topic].correct++;
  });

  // =====================================================
  // ✅ Topic Performance
  // =====================================================
  const topicPerformance = Object.keys(topicStats).map(
    (topic) => {
      const { total, correct } = topicStats[topic];
      return {
        topic,
        accuracy: (correct / total) * 100,
      };
    }
  );

  const weakTopics = topicPerformance
    .filter((t) => t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy);

  const strongTopics = topicPerformance.filter((t) => t.accuracy >= 80);

  // =====================================================
  // 🎯 SMART MESSAGE
  // =====================================================
  let message = "";

  if (accuracy === 100 && knowledgeLevel === "strong") {
    message = "Perfect score! You're mastering this topic 🚀🔥";
  } else if (knowledgeLevel === "strong") {
    message = `Excellent understanding! You're strong in ${strongTopics
      .map((t) => t.topic)
      .join(", ")}`;
  } else if (knowledgeLevel === "medium") {
    message = `Good progress 👍 Focus more on ${weakTopics
      .map((t) => t.topic)
      .join(", ")}`;
  } else {
    message = `You're struggling ⚠️ Start revising ${weakTopics
      .map((t) => t.topic)
      .join(", ")}`;
  }

  if (!message) message = "Keep practicing to improve!";

  // =====================================================
  // 🎯 SELECT TOPICS
  // =====================================================
  let selectedTopics = [];

  if (knowledgeLevel === "weak") {
    selectedTopics = weakTopics.slice(0, 3).map((t) => t.topic);
  } else if (knowledgeLevel === "medium") {
    selectedTopics = weakTopics.slice(0, 2).map((t) => t.topic);
  } else {
    selectedTopics = strongTopics.slice(0, 2).map((t) => t.topic);
  }

  if (selectedTopics.length === 0) {
    selectedTopics = topicPerformance.slice(0, 2).map((t) => t.topic);
  }

  // =====================================================
  // 🎥 FETCH VIDEOS (🔥 FIXED LOGIC)
  // =====================================================
  const videoResults = await Promise.all(
    selectedTopics.map((topic) => {
      let searchQuery = "";

      if (knowledgeLevel === "weak") {
        searchQuery = `${subject} ${topic} basics for beginners`;
      } else if (knowledgeLevel === "medium") {
        searchQuery = `${subject} ${topic} important concepts explanation`;
      } else {
        searchQuery = `${subject} ${topic} advanced problems tricks`;
      }

      return getYouTubeVideos(searchQuery);
    })
  );

  // =====================================================
  // 🎥 CLEAN VIDEO LIST
  // =====================================================
  let videos = [];

  videoResults.forEach((list, index) => {
    const topic = selectedTopics[index];

    list.forEach((v) => {
      videos.push({
        title: v.title,
        url: v.url,
        thumbnail: v.thumbnail,
        topic,
      });
    });
  });

  // =====================================================
  // 🚫 REMOVE DUPLICATES
  // =====================================================
  const uniqueVideosMap = new Map();

  videos.forEach((v) => {
    if (!uniqueVideosMap.has(v.url)) {
      uniqueVideosMap.set(v.url, v);
    }
  });

  videos = Array.from(uniqueVideosMap.values());

  // =====================================================
  // 🎯 LIMIT VIDEOS (MAX 6)
  // =====================================================
  videos = videos.slice(0, 6);

  // =====================================================
  // 🔥 FINAL RESPONSE
  // =====================================================
  return {
    message,
    knowledgeLevel,
    knowledgeScore: knowledge,
    weakTopics: weakTopics.map((t) => t.topic),
    strongTopics: strongTopics.map((t) => t.topic),
    videos,
  };
};