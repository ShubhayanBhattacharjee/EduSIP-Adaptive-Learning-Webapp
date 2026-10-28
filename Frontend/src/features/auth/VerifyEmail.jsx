import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import API_URL from "../../config";
import "./auth.css";

// Opened from the link in the verification email: /verify-email/:code
const VerifyEmail = () => {
  const { code } = useParams();
  const [state, setState] = useState({ loading: true, ok: false, message: "" });
  const sent = useRef(false);   // the link can only be used once, so never send it twice

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    fetch(`${API_URL}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) =>
        setState({ loading: false, ok, message: data.message || (ok ? "Your email is verified." : "This link is invalid or has expired.") }))
      .catch(() => setState({ loading: false, ok: false, message: "Cannot reach the server. Try again." }));
  }, [code]);

  return (
    <div className="au">
            <div className="au-shell">
        <p className="au-brand">EduSip</p>
        <div className="au-card au-done" role="status" aria-live="polite">
          <h2 className="au-title" style={{ textAlign: "center" }}>
            {state.loading ? "Verifying your email..." : state.ok ? "Email verified" : "Could not verify your email"}
          </h2>
          {!state.loading && <p className="au-sub">{state.message}</p>}
          {!state.loading && (
            <Link to="/login" className="au-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
              {state.ok ? "Log in" : "Back to log in"}
            </Link>
          )}
          {!state.loading && !state.ok && (
            <p className="au-foot">On the log in page, choose "Resend verification email" to get a new link.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;