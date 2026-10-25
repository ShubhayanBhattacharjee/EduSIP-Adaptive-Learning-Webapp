import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import API_URL from "../../config";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import "./Login.css";

// Opened from the link in the verification email: /verify-email/:code
const VerifyEmail = () => {
  const { code } = useParams();
  const [state, setState] = useState({ loading: true, ok: false, message: "" });

  useEffect(() => {
    fetch(`${API_URL}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code }),
    })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => setState({ loading: false, ok, message: data.message || (ok ? "Email verified." : "Invalid or expired link.") }))
      .catch(() => setState({ loading: false, ok: false, message: "Cannot reach the server. Try again." }));
  }, [code]);

  return (
    <>
      <Navbar />
      <div className="page-content">
        <div className="auth-wrapper">
          <div className="right-panel">
            <div className="login-form">
              <h2>{state.loading ? "Verifying..." : state.ok ? "Email verified" : "Verification failed"}</h2>
              {!state.loading && <p className="form-subtitle">{state.message}</p>}
              {!state.loading && (
                <p className="auth-footer-text">
                  <Link to="/login">{state.ok ? "Go to login" : "Back to login (you can request a new link there)"}</Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default VerifyEmail;
