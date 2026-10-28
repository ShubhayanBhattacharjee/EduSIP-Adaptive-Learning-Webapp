import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Copy, Plus, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { classApi } from "../../services/classService";
import "./Teacher.css";

const TeacherDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    classApi.list()
      .then((d) => setClasses(d.classes))
      .catch((e) => { if (e.code === "TEACHER_PENDING") setPending(true); else setMsg(e.message); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
  e.preventDefault();
  const clean = name.trim();
  if (!clean) { setMsg("Type a class name first."); return; }
  setCreating(true);
  setMsg("");
  try {
    const r = await classApi.create(clean);
    setName("");
    setMsg(`Class "${r.class.name}" created. Join code: ${r.class.joinCode}`);
    load();
  } catch (err) {
    console.error("Create class failed:", err);
    if (err.code === "TEACHER_PENDING") setPending(true);
    else setMsg(err.status ? `${err.message} (${err.status})` : `Cannot reach the server: ${err.message}`);
  } finally {
    setCreating(false);
  }
};

  const copy = (code) => {
    Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(code)).catch(() => {});
    setMsg(`Code ${code} copied`);
  };

  const totalStudents = classes.reduce((n, c) => n + c.studentCount, 0);
  const firstName = user?.fullname?.split(" ")[0] || "Teacher";

  if (pending) {
    return (
      <div className="t-page">
        <div className="t-card t-empty">
          <h2>Waiting for approval</h2>
          <p>Your teacher account has been created. An administrator needs to approve it before you can create classes. Please check back later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="t-page">
      <header className="t-head">
        <div className="t-head-main">
          <p className="t-eyebrow">Teacher</p>
          <h1>Hello, <em>{firstName}</em></h1>
          <p className="t-sub">
            {classes.length} class{classes.length === 1 ? "" : "es"} · {totalStudents} student{totalStudents === 1 ? "" : "s"}
          </p>
        </div>

        <form className="t-inline" onSubmit={create}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New class name"
            maxLength={100}
            aria-label="New class name"
          />
          <button className="t-btn" type="submit" disabled={creating}>
  <Plus size={16} /> {creating ? "Creating..." : "Create class"}
</button>
        </form>
      </header>

      {msg && <div className="t-msg">{msg}</div>}
      {loading && <p className="t-sub">Loading...</p>}
      {!loading && !classes.length && (
        <div className="t-card t-empty">No classes yet. Create one, then share its join code with your students.</div>
      )}

      <div className="t-grid">
        {classes.map((c) => (
          <section className="t-card t-class" key={c.id}>
            <div className="t-class-top">
              <h3>{c.name}</h3>
              <span className="t-pill"><Users size={13} /> {c.studentCount}</span>
            </div>

            <div>
              <p className="t-label">Join code</p>
              <button type="button" className="t-code" onClick={() => copy(c.joinCode)} title="Click to copy">
                <span>{c.joinCode}</span>
                <Copy size={15} />
              </button>
            </div>

            <button className="t-btn t-ghost" onClick={() => navigate(`/teacher/class/${c.id}`)}>
              Open class <ArrowRight size={16} />
            </button>
          </section>
        ))}
      </div>
    </div>
  );
};

export default TeacherDashboard;