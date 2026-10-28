import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/roles";
import "./auth.css";

// Internal page for admins and super admins: /staff/login (not linked from the public pages).
const StaffLogin = () => {
  const { staffLogin, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(homeFor(user.role), { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await staffLogin(form.email, form.password);
    setBusy(false);
    if (!r.success) setError(r.error);
  };

  return (
    <div className="au">
            <div className="au-shell">
        <p className="au-brand">EduSip</p>
        <form className="au-card" onSubmit={submit}>
          <h2 className="au-title">Staff sign in</h2>
          <p className="au-sub">For EduSip administrators. Students and teachers log in on the main page.</p>

          {error && <div className="au-error" role="alert">{error}</div>}

          <div className="au-field">
            <label className="au-label" htmlFor="email">Email</label>
            <input className="au-input" id="email" type="email" autoComplete="username"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="password">Password</label>
            <div className="au-pw">
              <input className="au-input" id="password" type={showPass ? "text" : "password"}
                autoComplete="current-password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              <button type="button" className="au-pw-toggle" onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Hide password" : "Show password"}>
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button type="submit" className="au-btn" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>

          <p className="au-foot"><Link to="/login">Student or teacher? Log in here</Link></p>
        </form>
      </div>
    </div>
  );
};

export default StaffLogin;