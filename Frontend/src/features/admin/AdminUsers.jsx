import React, { useCallback, useEffect, useState } from "react";
import adminApi from "../../services/adminApi";
import superAdminApi from "../../services/superAdminApi";
import { useAuth } from "../../context/AuthContext";
import "./AdminPages.css";

const AdminUsers = () => {
  const { user: me } = useAuth();
  const [f, setF] = useState({ search: "", role: "", status: "", pendingTeachers: "", page: 1 });
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ text: "", err: false });
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => { adminApi.users({ ...f, limit: 20 }).then(setData).catch((e) => say(e.message, true)); }, [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);   // wait while typing

  const run = async (fn, ok) => {
    try { await fn(); say(ok); load(); } catch (e) { say(e.message, true); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });
  const roles = me && me.role === "superadmin" ? ["student", "teacher", "admin", "superadmin"] : ["student", "teacher"];

  return (
    <div className="ap-page">
      <h2>Users</h2>
      <p className="ap-sub">Approve teachers, switch accounts off, fix email problems, set pilot groups.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}

      <div className="ap-bar">
        <input placeholder="Search name, email or username" value={f.search} onChange={set("search")} />
        <select value={f.role} onChange={set("role")} disabled={f.pendingTeachers === "1"}>
          <option value="">All roles</option>{["student", "teacher", "admin", "superadmin"].map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={f.status} onChange={set("status")}>
          <option value="">Any status</option><option value="disabled">Disabled</option><option value="unverified">Email not verified</option>
        </select>
        <button className={`ap-btn sm ${f.pendingTeachers === "1" ? "" : "ghost"}`} onClick={() => setF({ ...f, pendingTeachers: f.pendingTeachers === "1" ? "" : "1", page: 1 })}>
          Teachers waiting for approval
        </button>
      </div>

      {!data && <p className="ap-sub">Loading…</p>}
      {data && !data.users.length && <p className="ap-sub">No users match.</p>}
      {data && !!data.users.length && (
        <div className="ap-scroll">
          <table className="ap-table">
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Pilot group</th><th>Placement</th><th>Actions</th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u._id}>
                  <td><b>{u.fullname}</b>{u.isYou ? " (you)" : ""}<br /><span className="ap-sub">{u.email}</span></td>
                  <td>
                    {u.canManage ? (
                      <select className="ap-row-input" value={u.role} onChange={(e) => run(() => adminApi.setRole(u._id, e.target.value), "Role changed.")}>
                        {[...new Set([...roles, u.role])].map((r) => <option key={r} disabled={!roles.includes(r)}>{r}</option>)}
                      </select>
                    ) : u.role}
                  </td>
                  <td>
                    {u.disabled && <span className="ap-chip bad">disabled</span>}
                    {!u.emailVerified && <span className="ap-chip warn">email not verified</span>}
                    {u.role === "teacher" && u.teacherApproved === false && <span className="ap-chip warn">waiting for approval</span>}
                    {!u.disabled && u.emailVerified && !(u.role === "teacher" && u.teacherApproved === false) && <span className="ap-chip ok">active</span>}
                  </td>
                  <td>
                    {u.role === "student" ? (
                      <select className="ap-row-input" value={u.group || ""} onChange={(e) => run(() => adminApi.setGroup(u._id, e.target.value || null), "Group changed.")}>
                        <option value="">auto</option><option value="adaptive">adaptive</option><option value="control">control</option>
                      </select>
                    ) : "–"}
                  </td>
                  <td>
                    {u.role !== "student" ? "–" : u.placementDone ? (
                      <>Level {u.placement && u.placement.level}{" "}
                        <button className="ap-btn sm ghost" onClick={() => window.confirm("Let this student take the placement test again?") && run(() => adminApi.resetPlacement(u._id), "Placement reset.")}>Reset</button></>
                    ) : "not taken"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {u.canManage ? (
                      <>
                        {u.role === "teacher" && (
                          u.teacherApproved === false
                            ? <button className="ap-btn sm ok" onClick={() => run(() => adminApi.teacherApproval(u._id, true), "Teacher approved.")}>Approve</button>
                            : <button className="ap-btn sm ghost" onClick={() => window.confirm("Remove this teacher's access to class tools?") && run(() => adminApi.teacherApproval(u._id, false), "Approval removed.")}>Revoke</button>
                        )}{" "}
                        {!u.emailVerified && <button className="ap-btn sm ghost" onClick={() => run(() => adminApi.verifyEmail(u._id), "Email marked as verified.")}>Verify email</button>}{" "}
                        <button className={`ap-btn sm ${u.disabled ? "ok" : "danger"}`}
                          onClick={() => (u.disabled || window.confirm(`Disable ${u.fullname}? They are signed out immediately.`)) && run(() => adminApi.setStatus(u._id, !u.disabled), u.disabled ? "Enabled." : "Disabled.")}>
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                        {me && me.role === "superadmin" && (
                          <>{" "}
                            <button className="ap-btn sm ghost" onClick={() => window.confirm(`Sign ${u.fullname} out everywhere?`) && run(() => superAdminApi.forceLogout(u._id), "Signed out everywhere.")}>Sign out</button>{" "}
                            <button className="ap-btn sm danger" onClick={() => {
                              const typed = window.prompt(`Permanently delete ${u.fullname} and all their learning data?\nType their email (${u.email}) to confirm:`);
                              if (typed) run(() => superAdminApi.deleteUser(u._id, typed), "User deleted.");
                            }}>Delete</button>
                          </>
                        )}
                      </>
                    ) : <span className="ap-sub">no access</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="ap-pager">
          <button className="ap-btn sm ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>← Prev</button>
          <span className="ap-sub">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} users</span>
          <button className="ap-btn sm ghost" disabled={data.page * data.limit >= data.total} onClick={() => setF({ ...f, page: f.page + 1 })}>Next →</button>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
