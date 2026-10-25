import React, { useState } from "react";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await fetch("http://localhost:5000/auth/forgotpassword", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setMessage(data.message);
  };

  return (
    <div className="page-content">
      <Navbar />

      <div className="auth-wrapper">
        <div className="auth-bg"></div>
        <div className="auth-card">

          <div className="left-panel">
            <h1>EduSip</h1>
            <p>
              Reset your password securely.
              <br />
              We'll send you a reset link.
            </p>
          </div>

          <div className="right-panel">
            <form onSubmit={handleSubmit}>
              <h2>Forgot Password</h2>

              <input
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <button type="submit" className="login-btn">
                Send Reset Link
              </button>

              {message && <p className="info-message">{message}</p>}
            </form>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ForgotPassword;