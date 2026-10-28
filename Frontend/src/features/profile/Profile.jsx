import API_URL from "../../config";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/roles";
import usericon from "../../assets/usericon.png";
import "./Profile.css";

const ROLE_LABEL = { student: "Student", teacher: "Teacher", admin: "Admin", superadmin: "Super admin" };

const Profile = () => {
  const { user, token, updateProfile } = useAuth();
  const [me, setMe] = useState(user || {});
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // get the latest details from the server
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.success) setMe(d.user); })
      .catch(() => {});
  }, [token]);

  const startEdit = () => {
    setBio(me.bio || "");
    setSkills((me.skills || []).join(", "));
    setError("");
    setSaved(false);
    setEditing(true);
  };

  const save = async () => {
    const list = skills.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setError("");
    const res = await updateProfile(bio, list);
    setBusy(false);
    if (res.success) {
      setMe((m) => ({ ...m, bio, skills: list }));
      setEditing(false);
      setSaved(true);
    } else {
      setError(res.error || "Could not save your profile.");
    }
  };

  return (
    <div className="pf">
      <div className="pf-wrap">
        <Link to={homeFor(me.role || user?.role)} className="pf-back">Back</Link>

        <div className="pf-card">
          <div className="pf-top">
            <span className="pf-avatar-wrap"><img src={usericon} alt="" className="pf-avatar" /></span>
            <div className="pf-id">
              <h1 className="pf-name">{me.fullname}</h1>
              <p className="pf-muted">@{me.username || "username"}</p>
              <p className="pf-muted">{me.email}</p>
            </div>
            {me.role && <span className="pf-role">{ROLE_LABEL[me.role] || me.role}</span>}
          </div>

          <div className="pf-block">
            <h2 className="pf-label">Bio</h2>
            {editing ? (
              <textarea className="pf-input" rows={3} maxLength={500} value={bio}
                onChange={(e) => setBio(e.target.value)} placeholder="Tell us a little about yourself" />
            ) : (
              <p className="pf-bio">{me.bio || "No bio added yet."}</p>
            )}
          </div>

          <div className="pf-block">
            <h2 className="pf-label">Skills</h2>
            {editing ? (
              <>
                <input className="pf-input" value={skills} onChange={(e) => setSkills(e.target.value)}
                  placeholder="react, python, ..." />
                <p className="pf-muted pf-hint">Separate skills with commas.</p>
              </>
            ) : (me.skills || []).length > 0 ? (
              <div className="pf-chips">
                {me.skills.map((s, i) => <span key={i} className="pf-chip">{s}</span>)}
              </div>
            ) : (
              <p className="pf-muted">No skills added yet.</p>
            )}
          </div>

          {error && <p className="pf-error" role="alert">{error}</p>}
          {saved && !editing && <p className="pf-ok" role="status">Profile saved.</p>}

          <div className="pf-actions">
            {editing ? (
              <>
                <button type="button" className="pf-btn pf-primary" onClick={save} disabled={busy}>
                  {busy ? "Saving..." : "Save changes"}
                </button>
                <button type="button" className="pf-btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
              </>
            ) : (
              <button type="button" className="pf-btn" onClick={startEdit}>Edit profile</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;