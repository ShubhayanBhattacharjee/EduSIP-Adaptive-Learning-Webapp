import API_URL from "../config";
const BASE = `${API_URL}/classes`;

async function call(path = "", method = "GET", body) {
  const res = await fetch(BASE + path, {
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
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

export const classApi = {
  // teacher
  list: () => call(),
  create: (name) => call("", "POST", { name }),
  rename: (id, name) => call(`/${id}`, "PATCH", { name }),
  remove: (id) => call(`/${id}`, "DELETE"),
  newCode: (id) => call(`/${id}/regenerate-code`, "POST"),
  overview: (id) => call(`/${id}/overview`),
  student: (id, sid) => call(`/${id}/students/${sid}`),
  removeStudent: (id, sid) => call(`/${id}/students/${sid}`, "DELETE"),
  // student
  join: (code) => call("/join", "POST", { code }),
  mine: () => call("/mine"),
  leave: (id) => call(`/${id}/leave`, "DELETE"),
};