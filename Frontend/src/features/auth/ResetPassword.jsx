import API_URL from "../../config";
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import "./auth.css";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const timer = useRef(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/resetpassword/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        setDone(true);
        timer.current = setTimeout(() => navigate("/login"), 2500);
      } else {
        setError(data.message || "This reset link is invalid or has expired. Request a new one.");
      }
    } catch {
      setError("Cannot reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="au">
              <div className="au-shell">
        <p className="au-brand">EduSip</p>
          <div className="au-card au-done" role="status">
            <h2 className="au-title" style={{ textAlign: "center" }}>Password changed</h2>
            <p className="au-sub">Taking you to log in...</p>
            <Link to="/login" className="au-link">Go to log in now</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="au">
            <div className="au-shell">
        <p className="au-brand">EduSip</p>
        <form className="au-card" onSubmit={handleSubmit}>
          <h2 className="au-title">Choose a new password</h2>
          <p className="au-sub">Use at least 8 characters.</p>

          {error && (
            <div className="au-error" role="alert">
              {error} {" "}
              <Link to="/forgot-password" className="au-link">Request a new link</Link>
            </div>
          )}

          <div className="au-field">
            <label className="au-label" htmlFor="password">New password</label>
            <div className="au-pw">
              <input className="au-input" id="password" type={showPass ? "text" : "password"}
                autoComplete="new-password" minLength={8} maxLength={72}
                value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="au-pw-toggle" onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Hide passwords" : "Show passwords"}>
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="confirm">Confirm new password</label>
            <input className="au-input" id="confirm" type={showPass ? "text" : "password"}
              autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>

          <button type="submit" className="au-btn" disabled={busy}>
            {busy ? "Saving..." : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;