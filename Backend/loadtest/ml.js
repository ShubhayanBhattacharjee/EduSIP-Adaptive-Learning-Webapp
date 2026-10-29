import http from "k6/http";
import { check, sleep } from "k6";

const ML = __ENV.ML_URL || "http://127.0.0.1:8000";
const KEY = __ENV.ML_KEY || "";
const TEST = __ENV.TEST || "smoke";
const H = { headers: { "Content-Type": "application/json", "X-API-KEY": KEY } };

const profiles = {
  smoke:  { executor: "constant-vus", vus: 1, duration: "20s" },
  load:   { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "1m", target: 50 }, { duration: "3m", target: 50 }, { duration: "1m", target: 0 }] },
  stress: { executor: "ramping-vus", startVUs: 0, stages: [
            { duration: "2m", target: 100 }, { duration: "2m", target: 300 }, { duration: "2m", target: 600 }, { duration: "2m", target: 0 }] },
  spike:  { executor: "ramping-vus", startVUs: 10, stages: [{ duration: "10s", target: 500 }, { duration: "1m", target: 500 }, { duration: "10s", target: 10 }] },
};

export const options = {
  scenarios: { main: { ...profiles[TEST], exec: "run" } },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<500"] },
};

const candidates = Array.from({ length: 100 }, (_, i) => ({
  question_id: `q${i}`, difficulty: Math.random() * 4 - 2, question_attempts: Math.floor(Math.random() * 50), topic: `t${i % 8}`,
}));

export function run() {
  const ability = Math.random() * 4 - 2;
  check(http.get(`${ML}/health`, { tags: { name: "health" } }), { "health 200": (r) => r.status === 200 });

  check(http.post(`${ML}/next-question`, JSON.stringify({ ability, candidates, target: 0.7, explore: 0.1 }), { ...H, tags: { name: "next-question" } }),
    { "next-question 200": (r) => r.status === 200 });

  check(http.post(`${ML}/update-state`, JSON.stringify({ ability, difficulty: 0.2, success: Math.random() > 0.5, student_attempts: 10, question_attempts: 20 }), { ...H, tags: { name: "update-state" } }),
    { "update-state 200": (r) => r.status === 200 });

  check(http.post(`${ML}/estimate-level`, JSON.stringify({ items: Array.from({ length: 10 }, (_, i) => ({
    subject: "Math", topic: `t${i % 4}`, success: Math.random() > 0.5, label: ["easy", "medium", "hard"][i % 3] })) }), { ...H, tags: { name: "estimate-level" } }),
    { "estimate-level 200": (r) => r.status === 200 });

  check(http.post(`${ML}/study-plan`, JSON.stringify({ minutes: 30, topics: Array.from({ length: 20 }, (_, i) => ({
    subject: "Math", topic: `t${i}`, ability, attempts: i, days_since_last: i })) }), { ...H, tags: { name: "study-plan" } }),
    { "study-plan 200": (r) => r.status === 200 });
  sleep(0.5);
}