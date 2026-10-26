import API_URL from "../../config";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import "./Register.css";

const Register = () => {
  const [formData, setFormData] = useState({
    fullname: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "", // empty — user must pick first
    bio: "",
    skills: [],
  });

  const [skillInput, setSkillInput] = useState("");
  const [error, setError] = useState("");

  const { register } = useAuth();
  const navigate = useNavigate();

  const isStudent = formData.role === "student";
  // const isAdmin = formData.role === "admin";
  const roleChosen = formData.role !== "";

  const handleChange = (e) => {
    const { id, value, type } = e.target;
    if (type === "radio") {
      setFormData({ ...formData, role: value });
    } else {
      setFormData({ ...formData, [id]: value });
    }
  };

  const handleAddSkill = (e) => {
    if (e.key === "Enter" && skillInput.trim()) {
      e.preventDefault();
      if (!formData.skills.includes(skillInput.trim())) {
        setFormData({
          ...formData,
          skills: [...formData.skills, skillInput.trim()],
        });
      }
      setSkillInput("");
    }
  };

  const removeSkill = (index) => {
    const updated = [...formData.skills];
    updated.splice(index, 1);
    setFormData({ ...formData, skills: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roleChosen) {
      setError("Please select a role to continue");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const result = await register(
      formData.fullname,
      formData.username,
      formData.email,
      formData.bio,
      formData.skills,
      formData.role,
      formData.password,
      formData.confirmPassword,
    );

    if (result.success) {
      if (result.teacherPending) {
        alert("Teacher account created. An administrator must approve it before you can create classes. You can log in once your email is verified.");
      } else if (result.verificationRequired) {
        alert(result.emailSent
          ? "Account created. Check your email and click the link to verify it, then log in."
          : "Account created, but we could not send the verification email. Log in and use 'Resend verification email'.");
      }
      navigate("/login");
    }
    else setError(result.error || "Registration failed");
  };

  const handleGoogleSignup = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  return (
    <>
      <Navbar />
      <div className="page-content">
        <div className="reg-wrapper">
          <div className="auth-card register-card">
            <div className="left-panel" />

            <div className="right-panel">
              <form onSubmit={handleSubmit}>
                <h2>Create Account</h2>
                <p className="form-subtitle">
                  Choose your role to get started.
                </p>

                {error && <div className="error-message">{error}</div>}

                {/* ── STEP 1: Role selector always on top ── */}
                <div className="role-select">
                  <div className="role-option">
                    <input
                      type="radio"
                      id="role-student"
                      name="role"
                      value="student"
                      checked={formData.role === "student"}
                      onChange={handleChange}
                    />
                    <label htmlFor="role-student">🎓 Student</label>
                  </div>
                  <div className="role-option">
                    <input
                      type="radio"
                      id="role-teacher"
                      name="role"
                      value="teacher"
                      checked={formData.role === "teacher"}
                      onChange={handleChange}
                    />
                    <label htmlFor="role-teacher">👩‍🏫 Teacher</label>
                  </div>
                </div>

                {/* ── STEP 2: Rest of form — only shown once role is picked ── */}
                {roleChosen && (
                  <>
                    <input
                      type="text"
                      id="fullname"
                      placeholder="Full Name"
                      value={formData.fullname}
                      onChange={handleChange}
                      required
                    />

                    <input
                      type="text"
                      id="username"
                      placeholder="Username"
                      value={formData.username}
                      onChange={handleChange}
                      required
                    />

                    <input
                      type="email"
                      id="email"
                      placeholder="Email address"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />

                    {/* Bio + Skills only for students */}
                    {isStudent && (
                      <>
                        <textarea
                          id="bio"
                          placeholder="Write a short bio..."
                          value={formData.bio}
                          onChange={handleChange}
                          rows="3"
                        />

                        <div className="skills-input-container">
                          <input
                            type="text"
                            placeholder="Add skills (press Enter)"
                            value={skillInput}
                            onChange={(e) => setSkillInput(e.target.value)}
                            onKeyDown={handleAddSkill}
                          />
                          <div className="skills-preview">
                            {formData.skills.map((skill, i) => (
                              <span key={i} className="skill-chip">
                                {skill}
                                <button
                                  type="button"
                                  onClick={() => removeSkill(i)}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <input
                      type="password"
                      id="password"
                      placeholder="Password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                    />

                    <input
                      type="password"
                      id="confirmPassword"
                      placeholder="Confirm Password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                    />

                    <button type="submit">Register</button>

                    <div className="divider">
                      <span>or</span>
                    </div>

                    <button
                      type="button"
                      className="google-btn"
                      onClick={handleGoogleSignup}
                    >
                      <img
                        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                        alt="Google"
                      />
                      Sign up with Google
                    </button>
                  </>
                )}

                <p className="auth-footer-text">
                  Already have an account? <Link to="/login">Log In</Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default Register;
