import API_URL from "../config";

// One small client for the student endpoints. Throws an Error with .status, .code and .data when the server says no.
async function call(path, method = "GET", body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || "Request failed");
    err.status = res.status;
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data;
}

export const quizApi = {
  subjects: () => call("/quiz/subjects"),
  topics: (subject) => call(`/quiz/topics?subject=${encodeURIComponent(subject)}`),
  start: (body) => call("/quiz/start", "POST", body),
  answer: (body) => call("/quiz/answer", "POST", body),
  hint: (body) => call("/quiz/hint", "POST", body),
  finish: (body) => call("/quiz/finish", "POST", body),
  active: () => call("/quiz/active"),
  studyPlan: (minutes = 30) => call(`/quiz/study-plan?minutes=${minutes}`),
  mySkills: () => call("/quiz/my-skills"),
  placementStatus: () => call("/quiz/placement/status"),
  placementStart: () => call("/quiz/placement/start", "POST"),
  placementFinish: (sessionId) => call("/quiz/placement/finish", "POST", { sessionId }),
};

export default quizApi;
