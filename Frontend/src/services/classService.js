import API_URL from "../config";
const BASE = `${API_URL}/classes`;

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

async function call(path = "", method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  }
  if (!res.ok) {
    const err = new Error(data.message || "Request failed");
    err.code = data.code;          // e.g. TEACHER_PENDING, CONSENT_REQUIRED
    err.status = res.status;
    throw err;
  }
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
  // announcements
  addAnnouncement: (id, text) => call(`/${id}/announcements`, "POST", { text }),
  deleteAnnouncement: (id, aid) => call(`/${id}/announcements/${aid}`, "DELETE"),
  // assignments
  assignments: (id) => call(`/${id}/assignments`),
  createAssignment: (id, body) => call(`/${id}/assignments`, "POST", body),
  deleteAssignment: (id, aid) => call(`/${id}/assignments/${aid}`, "DELETE"),
  // download the class report as a CSV file
  exportCsv: async (id) => {
    const res = await fetch(`${BASE}/${id}/export`, { headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Export failed");
    }
    const blob = await res.blob();
    const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = match ? match[1] : "class.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  // student
  join: (code, consent) => call("/join", "POST", { code, consent }),
  mine: () => call("/mine"),
  leave: (id) => call(`/${id}/leave`, "DELETE"),
  myAssignments: () => call("/assignments/mine"),
};
