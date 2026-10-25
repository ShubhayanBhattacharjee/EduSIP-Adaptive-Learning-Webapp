import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
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

  const load = useCallback(() => {
    classApi.list()
      .then((d) => setClasses(d.classes))
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await classApi.create(name);
      setName("");
      setMsg("");
      load();
    } catch (err) { setMsg(err.message); }
  };

  const copy = (code) => {
    navigator.clipboard.writeText(code);
    setMsg(`Code ${code} copied`);
  };

  const totalStudents = classes.reduce((n, c) => n + c.studentCount, 0);

  return (
    <>
      <Navbar />
      <div className="t-page">
        <div className="t-head">
          <div>
            <h1>Hello, {user?.fullname?.split(" ")[0] || "Teacher"} 👋</h1>
            <p className="t-sub">{classes.length} classes · {totalStudents} students</p>
          </div>
          <form className="t-inline" onSubmit={create}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New class name"
              maxLength={100}
            />
            <button className="t-btn" type="submit">+ Create</button>
          </form>
        </div>

        {msg && <div className="t-msg">{msg}</div>}
        {loading && <p className="t-sub">Loading...</p>}
        {!loading && !classes.length && (
          <div className="t-card t-empty">No classes yet. Create one, then share its join code with your students.</div>
        )}

        <div className="t-grid">
          {classes.map((c) => (
            <div className="t-card" key={c.id}>
              <h3>{c.name}</h3>
              <p className="t-sub">{c.studentCount} students</p>
              <div className="t-code" onClick={() => copy(c.joinCode)} title="Click to copy">
                {c.joinCode}
              </div>
              <button className="t-btn" onClick={() => navigate(`/teacher/class/${c.id}`)}>
                Open class →
              </button>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
};

export default TeacherDashboard;