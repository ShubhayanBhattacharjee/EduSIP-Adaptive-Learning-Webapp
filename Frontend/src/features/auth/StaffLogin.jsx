import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/roles";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import "./Login.css";

// Internal page for admins and super admins: /staff/login (not linked from the public pages).
const StaffLogin = () => {
  const { staffLogin, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
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
    <>
      <Navbar />
      <div className="page-content">
        <div className="auth-wrapper">
          <div className="right-panel">
            <form onSubmit={submit} className="login-form">
              <h2>Staff sign in</h2>
              <p className="form-subtitle">Administrators only.</p>
              {error && <div className="error-message">{error}</div>}
              <div className="field-group">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" value={form.email} required autoComplete="username"
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" value={form.password} required autoComplete="current-password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <button type="submit" className="login-btn" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
            </form>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default StaffLogin;
