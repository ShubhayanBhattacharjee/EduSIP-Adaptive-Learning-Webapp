import API_URL from "../../config";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./auth.css";

const Register = () => {
  const [formData, setFormData] = useState({
    fullname: "", username: "", email: "", password: "", confirmPassword: "",
    role: "", bio: "", skills: [],
  });
  const [skillInput, setSkillInput] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);   // message shown after a successful sign-up

  const { register } = useAuth();

  const isStudent = formData.role === "student";
  const roleChosen = formData.role !== "";

  const handleChange = (e) => setFormData({ ...formData, [e.target.id]: e.target.value });
  const pickRole = (role) => { setFormData({ ...formData, role }); setError(""); };

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !formData.skills.includes(s) && formData.skills.length < 20) {
      setFormData({ ...formData, skills: [...formData.skills, s] });
    }
    setSkillInput("");
  };
  const handleSkillKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); addSkill(); }
  };
  const removeSkill = (i) =>
    setFormData({ ...formData, skills: formData.skills.filter((_, idx) => idx !== i) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!roleChosen) return setError("Choose Student or Teacher to continue.");
    if (formData.password.length < 8) return setError("Password must be at least 8 characters.");
    if (formData.password !== formData.confirmPassword) return setError("Passwords do not match.");

    setBusy(true);
    const result = await register(
      formData.fullname, formData.username, formData.email, formData.bio,
      formData.skills, formData.role, formData.password, formData.confirmPassword,
    );
    setBusy(false);

    if (!result.success) return setError(result.error || "Registration failed. Try again.");

    if (result.teacherPending) {
      setDone("Your teacher account is created. An administrator must approve it before you can create classes. Verify your email, then log in.");
    } else if (result.verificationRequired) {
      setDone(result.emailSent
        ? "Your account is created. Open the link we emailed you to verify it, then log in."
        : "Your account is created, but we could not send the verification email. Log in and choose \"Resend verification email\".");
    } else {
      setDone("Your account is created. You can log in now.");
    }
  };

  const handleGoogleSignup = () => { window.location.href = `${API_URL}/auth/google`; };

  if (done) {
    return (
            <div className="au">
        <div className="au-shell wide">
          <p className="au-brand">EduSip</p>
          <div className="au-card au-done" role="status">
            <h2 className="au-title" style={{ textAlign: "center" }}>Account created</h2>
            <p className="au-sub">{done}</p>
            <Link to="/login" className="au-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
              Go to log in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
        <div className="au">
      <div className="au-shell wide">
        <p className="au-brand">EduSip</p>
        <form className="au-card" onSubmit={handleSubmit}>
          <h2 className="au-title">Create your account</h2>
          <p className="au-sub">Start by choosing how you will use EduSip.</p>

          {error && <div className="au-error" role="alert">{error}</div>}

          <fieldset className="au-roles">
            <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>I am a</legend>
            <div className="au-role">
              <input type="radio" id="role-student" name="role" value="student"
                checked={formData.role === "student"} onChange={() => pickRole("student")} />
              <label htmlFor="role-student"><strong>Student</strong><span>Take quizzes and join classes</span></label>
            </div>
            <div className="au-role">
              <input type="radio" id="role-teacher" name="role" value="teacher"
                checked={formData.role === "teacher"} onChange={() => pickRole("teacher")} />
              <label htmlFor="role-teacher"><strong>Teacher</strong><span>Run classes and see progress</span></label>
            </div>
          </fieldset>

          {roleChosen && (
            <>
              <div className="au-two">
                <div className="au-field">
                  <label className="au-label" htmlFor="fullname">Full name</label>
                  <input className="au-input" id="fullname" type="text" autoComplete="name"
                    value={formData.fullname} onChange={handleChange} required />
                </div>
                <div className="au-field">
                  <label className="au-label" htmlFor="username">Username</label>
                  <input className="au-input" id="username" type="text" autoComplete="username"
                    value={formData.username} onChange={handleChange} required
                    minLength={3} maxLength={30} pattern="[a-zA-Z0-9_.\-]{3,30}"
                    title="3 to 30 letters, numbers, dot, dash or underscore" />
                </div>
              </div>
              <p className="au-hint" style={{ marginTop: -8, marginBottom: 16 }}>
                Username: 3 to 30 letters, numbers, dot, dash or underscore.
              </p>

              <div className="au-field">
                <label className="au-label" htmlFor="email">Email</label>
                <input className="au-input" id="email" type="email" autoComplete="email"
                  placeholder="you@example.com" value={formData.email} onChange={handleChange} required />
              </div>

              {isStudent && (
                <>
                  <div className="au-field">
                    <label className="au-label" htmlFor="bio">Short bio (optional)</label>
                    <textarea className="au-input" id="bio" rows="3" maxLength={500}
                      value={formData.bio} onChange={handleChange} />
                  </div>
                  <div className="au-field">
                    <label className="au-label" htmlFor="skill">Skills (optional)</label>
                    <input className="au-input" id="skill" type="text" placeholder="Type a skill and press Enter"
                      value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={handleSkillKey} onBlur={addSkill} maxLength={40} />
                    {formData.skills.length > 0 && (
                      <div className="au-chips">
                        {formData.skills.map((s, i) => (
                          <span key={s} className="au-chip">
                            {s}
                            <button type="button" onClick={() => removeSkill(i)} aria-label={`Remove ${s}`}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="au-two">
                <div className="au-field">
                  <label className="au-label" htmlFor="password">Password</label>
                  <div className="au-pw">
                    <input className="au-input" id="password" type={showPass ? "text" : "password"}
                      autoComplete="new-password" minLength={8} maxLength={72}
                      value={formData.password} onChange={handleChange} required />
                    <button type="button" className="au-pw-toggle" onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? "Hide passwords" : "Show passwords"}>
                      {showPass ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div className="au-field">
                  <label className="au-label" htmlFor="confirmPassword">Confirm password</label>
                  <input className="au-input" id="confirmPassword" type={showPass ? "text" : "password"}
                    autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange} required />
                </div>
              </div>
              <p className="au-hint" style={{ marginTop: -8, marginBottom: 20 }}>At least 8 characters.</p>

              <button type="submit" className="au-btn" disabled={busy}>
                {busy ? "Creating account..." : "Create account"}
              </button>

              {isStudent && (
                <>
                  <div className="au-divider"><span>or</span></div>
                  <button type="button" className="au-btn au-ghost" onClick={handleGoogleSignup}>
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" />
                    Sign up with Google
                  </button>
                </>
              )}
            </>
          )}

                    <p className="au-foot">Already have an account? <Link to="/login">Log in</Link></p>
        </form>
        <p className="au-outside"><Link to="/">Back to home</Link></p>
      </div>
    </div>
  );
};

export default Register;