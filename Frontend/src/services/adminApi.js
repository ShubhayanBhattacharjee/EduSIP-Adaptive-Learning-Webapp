import API_URL from "../config";

// One small client for all admin pages. Throws an Error (with .status) when the server says no.
async function call(path, method = "GET", body) {
  const res = await fetch(`${API_URL}/admin${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/staff/login";
  }
  if (!res.ok || data.success === false) {
    const err = new Error(data.message || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const adminApi = {
  analytics: () => call("/analytics"),
  catalog: () => call("/catalog"),
  // question bank
  questions: (params) => call(`/questions${qs(params)}`),
  questionStats: (id) => call(`/questions/${id}/stats`),
  updateQuestion: (id, body) => call(`/questions/${id}`, "PATCH", body),
  deleteQuestion: (id) => call(`/questions/${id}`, "DELETE"),
  purgeRejected: () => call("/questions/purge-rejected", "POST"),
  // review queue + AI generator
  pending: (params) => call(`/pending-questions${qs(params)}`),
  review: (id, action, edits) => call(`/questions/${id}/review`, "PATCH", { action, edits }),
  bulkReview: (ids, action) => call("/questions/bulk-review", "POST", { ids, action }),
  generate: (body) => call("/generate-questions", "POST", body),
  // topics
  saveTopic: (body) => call("/topics", "POST", body),
  deleteTopic: (id) => call(`/topics/${id}`, "DELETE"),
  // placement
  placement: () => call("/placement-test"),
  rebuildPlacement: (questionIds) => call("/placement-test/rebuild", "POST", questionIds ? { questionIds } : {}),
  resetPlacement: (userId) => call(`/users/${userId}/reset-placement`, "POST"),
  // users
  users: (params) => call(`/users${qs(params)}`),
  setRole: (id, role) => call(`/users/${id}/role`, "PATCH", { role }),
  setStatus: (id, disabled) => call(`/users/${id}/status`, "PATCH", { disabled }),
  setGroup: (id, group) => call(`/users/${id}/group`, "PATCH", { group }),
  teacherApproval: (id, approved) => call(`/users/${id}/teacher-approval`, "PATCH", { approved }),
  verifyEmail: (id) => call(`/users/${id}/verify-email`, "PATCH"),
  // system
  system: () => call("/system"),
  reconcile: () => call("/reconcile", "POST", {}),
  mlReload: () => call("/ml/reload", "POST"),
};

export default adminApi;
