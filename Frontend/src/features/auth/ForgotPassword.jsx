import API_URL from "../../config";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./auth.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgotpassword`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setMessage(data.message || "If that email has an account, a reset link is on its way.");
      else setError(data.message || "Could not send the reset link. Try again.");
    } catch {
      setError("Cannot reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="au">
           <div className="au-shell">
        <p className="au-brand">EduSip</p>
        <form className="au-card" onSubmit={handleSubmit}>
          <h2 className="au-title">Reset your password</h2>
          <p className="au-sub">Enter the email you signed up with and we will send you a reset link.</p>

          {error && <div className="au-error" role="alert">{error}</div>}
          {message && <div className="au-info" role="status">{message}</div>}

          <div className="au-field">
            <label className="au-label" htmlFor="email">Email</label>
            <input className="au-input" id="email" type="email" autoComplete="email"
              placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <button type="submit" className="au-btn" disabled={busy}>
            {busy ? "Sending..." : "Send reset link"}
          </button>

          <p className="au-foot"><Link to="/login">Back to log in</Link></p>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;