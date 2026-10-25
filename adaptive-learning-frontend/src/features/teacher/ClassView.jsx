import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import { classApi } from "../../services/classService";
import "./Teacher.css";

export const ago = (d) => {
  if (!d) return "never";
  const days = Math.floor((Date.now() - new Date(d)) / 864e5);
  return days < 1 ? "today" : `${days}d ago`;
};

const ClassView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    classApi.overview(id).then(setData).catch((e) => setMsg(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, done) => {
    try { await fn(); if (done) done(); load(); } catch (e) { setMsg(e.message); }
  };

  const rename = () => {
    const n = window.prompt("New class name", data.class.name);
    if (n && n.trim()) act(() => classApi.rename(id, n));
  };
  const newCode = () => {
    if (window.confirm("Old code will stop working. Continue?")) act(() => classApi.newCode(id));
  };
  const del = () => {
    if (window.confirm("Delete this class? Students are not deleted.")) {
      act(() => classApi.remove(id), () => navigate("/teacher"));
    }
  };
  const kick = (s) => {
    if (window.confirm(`Remove ${s.fullname} from this class?`)) act(() => classApi.removeStudent(id, s.id));
  };

  if (!data) return <><Navbar /><div className="t-page"><p className="t-sub">{msg || "Loading..."}</p></div></>;

  const students = data.students.filter((s) =>
    (s.fullname + (s.username || "")).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <Navbar />
      <div className="t-page">
        <Link to="/teacher" className="t-back">← All classes</Link>

        <div className="t-head">
          <div>
            <h1>{data.class.name}</h1>
            <p className="t-sub">
              {data.students.length} students · Join code <b className="t-code-inline">{data.class.joinCode}</b>
            </p>
          </div>
          <div className="t-inline">
            <button className="t-btn t-ghost" onClick={rename}>Rename</button>
            <button className="t-btn t-ghost" onClick={newCode}>New code</button>
            <button className="t-btn t-danger" onClick={del}>Delete</button>
          </div>
        </div>

        {msg && <div className="t-msg">{msg}</div>}

        <div className="t-two">
          <div className="t-card">
            <h3>⚠️ Needs attention</h3>
            {!data.needsAttention.length && <p className="t-sub">Everyone is on track.</p>}
            {data.needsAttention.map((s) => (
              <div className="t-row" key={s.id} onClick={() => navigate(`/teacher/class/${id}/student/${s.id}`)}>
                <b>{s.fullname}</b>
                <span className="t-sub">{s.reasons.join(" · ")}</span>
              </div>
            ))}
          </div>

          <div className="t-card">
            <h3>📉 Weakest topics in class</h3>
            {!data.weakTopics.length && <p className="t-sub">Not enough data yet.</p>}
            {data.weakTopics.map((w) => (
              <div className="t-row" key={w.subject + w.topic}>
                <b>{w.subject} / {w.topic}</b>
                <span className="t-sub">avg {w.averageAbility} · {w.students} students</span>
              </div>
            ))}
          </div>
        </div>

        <div className="t-card">
          <div className="t-head">
            <h3>Students</h3>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student" />
          </div>
          {!data.students.length && (
            <p className="t-sub">No students yet. Share code <b>{data.class.joinCode}</b>.</p>
          )}
          {!!students.length && (
            <div className="t-scroll">
              <table className="t-table">
                <thead>
                  <tr><th>Name</th><th>Answers</th><th>Last 14d</th><th>Streak</th><th>Last active</th><th>Flags</th><th></th></tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} onClick={() => navigate(`/teacher/class/${id}/student/${s.id}`)}>
                      <td><b>{s.fullname}</b><br /><span className="t-sub">@{s.username}</span></td>
                      <td>{s.totalAnswers}</td>
                      <td>{s.recentSuccessRate === null ? "–" : `${Math.round(s.recentSuccessRate * 100)}%`}</td>
                      <td>🔥 {s.streak}</td>
                      <td>{ago(s.lastActive)}</td>
                      <td>{s.flaggedAnswers ? <span className="badge needs-work">{s.flaggedAnswers}</span> : "–"}</td>
                      <td>
                        <button className="t-btn t-danger t-sm" onClick={(e) => { e.stopPropagation(); kick(s); }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
};

export default ClassView;