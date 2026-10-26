import React, { useCallback, useEffect, useState } from "react";
import superAdminApi from "../../services/superAdminApi";
import "../admin/AdminPages.css";
import "./SuperAdminPages.css";

const MIN_PASSWORD = 12;
const when = (d) => (d ? new Date(d).toLocaleString() : "never");
const empty = { fullname: "", email: "", password: "", role: "admin" };

const StaffManagement = () => {
  const [staff, setStaff] = useState(null);
  const [form, setForm] = useState(empty);
  const [resetFor, setResetFor] = useState(null);       // the staff member whose password is being reset
  const [newPass, setNewPass] = useState("");
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState(false);
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => { superAdminApi.staff().then((d) => setStaff(d.staff)).catch((e) => say(e.message, true)); }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    try { await fn(); say(ok); load(); } catch (e) { say(e.message, true); }
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await superAdminApi.createStaff(form);
      say(`${form.role === "superadmin" ? "Super admin" : "Admin"} created. They sign in at /staff/login.`);
      setForm(empty);
      load();
    } catch (er) { say(er.message, true); } finally { setBusy(false); }
  };

  const doReset = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await superAdminApi.resetStaffPassword(resetFor._id, newPass);
      if (resetFor.isYou) {
        localStorage.removeItem("token"); localStorage.removeItem("user");
        window.location.href = "/staff/login";               // your own logins were cancelled
        return;
      }
      say(`Password changed for ${resetFor.email}. Every login they had is cancelled.`);
      setResetFor(null); setNewPass("");
    } catch (er) { say(er.message, true); } finally { setBusy(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="ap-page">
      <h2>Staff</h2>
      <p className="ap-sub">Admins run the question bank and users. Super admins also manage staff, classes, settings and the audit log.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}

      <div className="ap-card">
        <h3>Add a staff account</h3>
        <form className="ap-form" onSubmit={create} autoComplete="off">
          <div className="ap-two">
            <label>Full name<input value={form.fullname} onChange={set("fullname")} required minLength={2} maxLength={100} /></label>
            <label>Email<input type="email" value={form.email} onChange={set("email")} required /></label>
          </div>
          <div className="ap-two">
            <label>Password (at least {MIN_PASSWORD} characters)<input type="password" value={form.password} onChange={set("password")} required minLength={MIN_PASSWORD} autoComplete="new-password" /></label>
            <label>Role
              <select value={form.role} onChange={set("role")}><option value="admin">Admin</option><option value="superadmin">Super admin</option></select>
            </label>
          </div>
          <div><button className="ap-btn" disabled={busy}>{busy ? "Creating…" : "Create account"}</button></div>
        </form>
        <p className="ap-sub">Someone who already has an account? Change their role in <b>Users</b> instead. They then sign in at /staff/login with the password they already have (Google-only accounts have none, so create a staff account for them).</p>
      </div>

      {resetFor && (
        <div className="ap-card">
          <h3>New password for {resetFor.email}</h3>
          <form className="ap-form" onSubmit={doReset} autoComplete="off">
            <label>New password (at least {MIN_PASSWORD} characters)
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={MIN_PASSWORD} autoComplete="new-password" />
            </label>
            {resetFor.isYou && <p className="ap-sub">This is your own account. You will be signed out and must sign in again.</p>}
            <div className="ap-actions">
              <button className="ap-btn" disabled={busy}>Change password</button>
              <button type="button" className="ap-btn ghost" onClick={() => { setResetFor(null); setNewPass(""); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {!staff && <p className="ap-sub">Loading…</p>}
      {staff && (
        <div className="ap-scroll">
          <table className="ap-table">
            <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Added</th><th>Actions</th></tr></thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u._id}>
                  <td><b>{u.fullname}</b>{u.isYou ? " (you)" : ""}<br /><span className="ap-sub">{u.email}</span></td>
                  <td>
                    {u.isYou ? u.role : (
                      <select className="ap-row-input" value={u.role}
                        onChange={(e) => {
                          const role = e.target.value;
                          const demote = !["admin", "superadmin"].includes(role);
                          if (demote && !window.confirm(`Remove staff access from ${u.fullname}? They become a ${role}.`)) return;
                          run(() => superAdminApi.setRole(u._id, role), "Role changed.");
                        }}>
                        <option value="superadmin">superadmin</option><option value="admin">admin</option>
                        <option value="teacher">teacher (remove staff access)</option><option value="student">student (remove staff access)</option>
                      </select>
                    )}
                  </td>
                  <td>{u.disabled ? <span className="ap-chip bad">disabled</span> : <span className="ap-chip ok">active</span>}</td>
                  <td>{when(u.lastLoginAt)}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}{u.createdByEmail ? <><br /><span className="ap-sub">by {u.createdByEmail}</span></> : null}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="ap-btn sm ghost" onClick={() => { setResetFor(u); setNewPass(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Reset password</button>{" "}
                    {!u.isYou && (
                      <>
                        <button className="ap-btn sm ghost" onClick={() => window.confirm(`Sign ${u.fullname} out everywhere?`) && run(() => superAdminApi.forceLogout(u._id), "Signed out everywhere.")}>Sign out</button>{" "}
                        <button className={`ap-btn sm ${u.disabled ? "ok" : "danger"}`}
                          onClick={() => (u.disabled || window.confirm(`Disable ${u.fullname}? They are signed out immediately.`)) && run(() => superAdminApi.setStatus(u._id, !u.disabled), u.disabled ? "Enabled." : "Disabled.")}>
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
