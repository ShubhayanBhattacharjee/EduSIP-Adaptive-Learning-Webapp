import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/roles";
import "./Login.css";   // old file, still needed by the pages not redesigned yet. Delete it after the last auth page.
import "./auth.css";

const Login = () => {
  const { login, googleLogin, resendVerification, user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(homeFor(user.role));
  }, [user, navigate]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.id]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNeedsVerify(false);
    setResent(false);
    setBusy(true);
    const result = await login(formData.email, formData.password);
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      setNeedsVerify(result.code === "EMAIL_NOT_VERIFIED");
    }
  };

  const handleResend = async () => {
    await resendVerification(formData.email);
    setResent(true);
  };
  return (
    <div className="au">
      <div className="au-shell">
        <p className="au-brand">EduSip</p>

        <form className="au-card" onSubmit={handleSubmit}>
          <h2 className="au-title">Welcome back</h2>
          <p className="au-sub">Sign in to continue your quizzes, classes and progress.</p>

          {error && <div className="au-error" role="alert">{error}</div>}
          {needsVerify && (
            <p className="au-info">
              {resent
                ? "If that account still needs verification, a new link is on its way."
                : <button type="button" className="au-link" onClick={handleResend}>Resend verification email</button>}
            </p>
          )}

          <div className="au-field">
            <label className="au-label" htmlFor="email">Email</label>
            <input className="au-input" type="email" id="email" autoComplete="username"
              placeholder="you@example.com" value={formData.email} onChange={handleChange} required />
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="password">Password</label>
            <div className="au-pw">
              <input className="au-input" type={showPass ? "text" : "password"} id="password"
                autoComplete="current-password" value={formData.password} onChange={handleChange} required />
              <button type="button" className="au-pw-toggle" onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? "Hide password" : "Show password"}>
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="au-row">
            <Link to="/forgot-password" className="au-link">Forgot password?</Link>
          </div>

          <button type="submit" className="au-btn" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>

          <div className="au-divider"><span>or</span></div>

          <button type="button" className="au-btn au-ghost" onClick={googleLogin}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" />
            Continue with Google
          </button>

          <p className="au-foot">New to EduSip? <Link to="/register">Create an account</Link></p>
        </form>

        <p className="au-outside"><Link to="/">Back to home</Link></p>
      </div>
    </div>
  );
};

export default Login;