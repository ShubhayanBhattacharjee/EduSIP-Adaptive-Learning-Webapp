import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.FRONT_URL || "http://localhost:3000";
const routes = ["/", "/login", "/register", "/dashboard", "/quiz"];

export const options = {
  stages: [{ duration: "30s", target: 100 }, { duration: "1m", target: 300 }, { duration: "30s", target: 0 }],
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<800"] },
};

export default function () {
  const r = http.get(`${BASE}${routes[Math.floor(Math.random() * routes.length)]}`);
  check(r, { "200": (x) => x.status === 200 });
  sleep(1);
}