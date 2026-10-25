import API_URL from "../../config";
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import "./Login.css";

const ResetPassword = () => {

  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await fetch(
      `${API_URL}/auth/resetpassword/${token}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      }
    );

    const data = await res.json();
    setMessage(data.message);

    if(data.success){
      setTimeout(()=>{
        navigate("/login");
      },2000);
    }
  };

  return (
    <>
      <Navbar />

      <div className="auth-wrapper">
        <div className="auth-card">

          <div className="left-panel">
            <h1>Edusip</h1>
            <p>
              Create a new secure password.
            </p>
          </div>

          <div className="right-panel">

            <form onSubmit={handleSubmit}>
              <h2>Reset Password</h2>

              <input
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
                required
              />

              <button type="submit" className="login-btn">
                Reset Password
              </button>

              {message && <p>{message}</p>}

            </form>

          </div>

        </div>
      </div>

      <Footer />
    </>
  );
};

export default ResetPassword;