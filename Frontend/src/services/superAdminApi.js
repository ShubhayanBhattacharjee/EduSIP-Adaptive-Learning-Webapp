import API_URL from "../config";

// Client for the super admin pages. Throws an Error (with .status) when the server says no.
// `path` starts with the area: "/superadmin/..." for super admin routes, "/admin/..." for the shared admin routes.
async function request(path, method = "GET", body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/staff/login";
  }
  return res;
}

async function call(path, method = "GET", body) {
  const res = await request(path, method, body);
  const data = await res.json().catch(() => ({}));
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

export const superAdminApi = {
  overview: () => call("/superadmin/overview"),
  // staff
  staff: () => call("/superadmin/staff"),
  createStaff: (body) => call("/superadmin/staff", "POST", body),
  resetStaffPassword: (id, password) => call(`/superadmin/staff/${id}/reset-password`, "POST", { password }),
  setRole: (id, role) => call(`/admin/users/${id}/role`, "PATCH", { role }),
  setStatus: (id, disabled) => call(`/admin/users/${id}/status`, "PATCH", { disabled }),
  // users
  forceLogout: (id) => call(`/superadmin/users/${id}/force-logout`, "POST", {}),
  deleteUser: (id, confirmEmail) => call(`/superadmin/users/${id}`, "DELETE", { confirmEmail }),
  // classes
  classes: (params) => call(`/superadmin/classes${qs(params)}`),
  teachers: () => call("/superadmin/teachers"),
  moveClass: (id, teacherId) => call(`/superadmin/classes/${id}/teacher`, "PATCH", { teacherId }),
  deleteClass: (id) => call(`/superadmin/classes/${id}`, "DELETE"),
  // audit log
  auditLog: (params) => call(`/superadmin/audit-log${qs(params)}`),
  // Downloads the CSV through fetch (the login header cannot be sent by a plain link).
  downloadAuditCsv: async (params) => {
    const res = await request(`/superadmin/audit-log${qs({ ...params, format: "csv" })}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Export failed");
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  // settings
  settings: () => call("/superadmin/settings"),
  saveSettings: (changes) => call("/superadmin/settings", "PUT", { changes }),
  resetSetting: (key) => call(`/superadmin/settings/${key}`, "DELETE"),
  // ML
  mlInfo: () => call("/superadmin/ml/info"),
  mlReload: () => call("/admin/ml/reload", "POST"),
  reconcile: () => call("/admin/reconcile", "POST", {}),
  system: () => call("/admin/system"),
};

export default superAdminApi;
