import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import { homeFor } from "../../utils/roles";
import "./Login.css";

const Login = () => {
  const { login, googleLogin, user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) navigate(homeFor(user.role));
  }, [user, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const result = await login(formData.email, formData.password);
    if (!result.success) setError(result.error);
  };

  return (
    <>
      <Navbar />

      <div className="page-content">
        <div className="auth-wrapper">
          <div className="right-panel">
            <form onSubmit={handleSubmit} className="login-form">

              <h2>Welcome back</h2>
              <p className="form-subtitle">
                Sign in to continue your journey.
              </p>

              {error && <div className="error-message">{error}</div>}

              <div className="field-group">
                <input
                  type="email"
                  id="email"
                  placeholder="Email address"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="field-group">
                <div className="password-box">
                  <input
                    type={showPass ? "text" : "password"}
                    id="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                  <span
                    className="password-toggle"
                    onClick={() => setShowPass(!showPass)}
                  >
                    {showPass ? "🔒" : "👁"}
                  </span>
                </div>
              </div>

              <Link to="/forgot-password" className="forgot-link">
                Forgot your password?
              </Link>

              <button type="submit" className="login-btn">
                Log In
              </button>

              <div className="divider"><span>or</span></div>

              <button type="button" className="google-btn" onClick={googleLogin}>
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                />
                Continue with Google
              </button>

              <p className="auth-footer-text">
                Don't have an account?{" "}
                <Link to="/register">Create Account</Link>
              </p>
              <p className="auth-footer-text">
                <Link to="/">← Back to Home</Link>
              </p>

            </form>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default Login;