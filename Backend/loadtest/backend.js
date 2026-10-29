import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";

const tokens = new SharedArray("tokens", () => JSON.parse(open("./tokens.json")));
const BASE = __ENV.BASE_URL || "http://localhost:5000";
const TEST = __ENV.TEST || "smoke";

const profiles = {
  smoke:  { executor: "constant-vus", vus: 1, duration: "30s" },
  load:   { executor: "ramping-vus", startVUs: 0, stages: [
            { duration: "1m", target: 50 }, { duration: "3m", target: 50 }, { duration: "1m", target: 0 }] },
  stress: { executor: "ramping-vus", startVUs: 0, stages: [
            { duration: "2m", target: 50 }, { duration: "2m", target: 100 }, { duration: "2m", target: 200 },
            { duration: "2m", target: 300 }, { duration: "2m", target: 0 }] },
  spike:  { executor: "ramping-vus", startVUs: 10, stages: [
            { duration: "30s", target: 10 }, { duration: "10s", target: 300 },
            { duration: "1m", target: 300 }, { duration: "10s", target: 10 }, { duration: "1m", target: 10 }] },
  soak:   { executor: "constant-vus", vus: 30, duration: "30m" },
};

export const options = {
  scenarios: { main: { ...profiles[TEST], exec: "studentFlow" } },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500"],
    "http_req_duration{name:answer}": ["p(95)<2000"],
    "http_req_duration{name:start}": ["p(95)<2000"],
  },
};

function hdr(token) {
  return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}
const j = (r) => { try { return r.json(); } catch (e) { return {}; } };

export function studentFlow() {
  const token = tokens[(__VU - 1) % tokens.length];
  const H = hdr(token);

  group("browse", () => {
    check(http.get(`${BASE}/auth/me`, { ...H, tags: { name: "me" } }), { "me 200": (r) => r.status === 200 });
    check(http.get(`${BASE}/dashboard/analytics`, { ...H, tags: { name: "analytics" } }), { "analytics 200": (r) => r.status === 200 });
    http.get(`${BASE}/quiz/study-plan`, { ...H, tags: { name: "study-plan" } });
    http.get(`${BASE}/quiz/my-skills`, { ...H, tags: { name: "my-skills" } });
    http.get(`${BASE}/quiz/history`, { ...H, tags: { name: "history" } });
  });
  sleep(1);

  const subjects = j(http.get(`${BASE}/quiz/subjects`, { ...H, tags: { name: "subjects" } })).subjects || [];
  if (!subjects.length) return;
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const topics = j(http.get(`${BASE}/quiz/topics?subject=${encodeURIComponent(subject)}`, { ...H, tags: { name: "topics" } })).topics || [];
  if (!topics.length) return;
  const topic = topics[Math.floor(Math.random() * topics.length)];

  group("quiz", () => {
    const sRes = http.post(`${BASE}/quiz/start`, JSON.stringify({ subject, topic, questions: 5 }), { ...H, tags: { name: "start" } });
    check(sRes, { "start 200": (r) => r.status === 200 });
    if (sRes.status !== 200) return;
    const s = j(sRes);
    let q = s.questions && s.questions[0];
    let guard = 0;
    while (q && guard++ < 6) {
      sleep(1 + Math.random() * 2); // student thinking time
      const aRes = http.post(`${BASE}/quiz/answer`, JSON.stringify({
        questionId: q._id, sessionId: s.sessionId, selectedAnswer: Math.floor(Math.random() * 4), hintUsed: false,
      }), { ...H, tags: { name: "answer" } });
      check(aRes, { "answer 200": (r) => r.status === 200 });
      const a = j(aRes);
      if (aRes.status !== 200 || a.done) break;
      q = a.nextQuestion;
    }
    check(http.post(`${BASE}/quiz/finish`, JSON.stringify({ sessionId: s.sessionId }), { ...H, tags: { name: "finish" } }),
      { "finish 200": (r) => r.status === 200 });
  });
  sleep(2);
}