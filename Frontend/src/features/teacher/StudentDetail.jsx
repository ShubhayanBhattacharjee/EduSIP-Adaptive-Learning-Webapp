import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { classApi } from "../../services/classService";
import { ago } from "./ClassView";
import "./Teacher.css";

const StudentDetail = () => {
  const { id, sid } = useParams();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    classApi.student(id, sid).then(setD).catch((e) => setMsg(e.message));
  }, [id, sid]);

  if (!d) return <><div className="t-page"><p className="t-sub">{msg || "Loading..."}</p></div></>;

  return (
    <>
      <div className="t-page">
        <Link to={`/teacher/class/${id}`} className="t-back">← Back to class</Link>

        <div className="t-head">
          <div>
            <h1>{d.student.fullname}</h1>
            <p className="t-sub">@{d.student.username}{d.student.email ? ` · ${d.student.email}` : ""} · 🔥 {d.student.streak} day streak</p>
          </div>
        </div>

        {!!d.levels.length && (
          <div className="t-card">
            <h3>Level by subject</h3>
            <div className="t-inline">
              {d.levels.map((l) => (
                <span className="t-level" key={l.subject}><b>{l.level}</b>/10 <span className="t-sub">{l.subject} · {l.band}</span></span>
              ))}
            </div>
          </div>
        )}

        <div className="t-card">
          <h3>Topic strength (weakest first)</h3>
          {!d.topics.length && <p className="t-sub">No practice yet.</p>}
          {!!d.topics.length && (
            <div className="t-scroll">
              <table className="t-table t-plain">
                <thead><tr><th>Topic</th><th>Ability</th><th>Answers</th><th>Last practiced</th><th>Status</th></tr></thead>
                <tbody>
                  {d.topics.map((t) => (
                    <tr key={t.subject + t.topic}>
                      <td>{t.subject} / {t.topic}</td>
                      <td>{t.ability}</td>
                      <td>{t.attempts}</td>
                      <td>{ago(t.lastPracticedAt)}</td>
                      <td>{t.status ? <span className={`badge ${t.status.replace(/\s+/g, "-")}`}>{t.status}</span> : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="t-two">
          <div className="t-card">
            <h3>Recent quizzes</h3>
            {!d.recentQuizzes.length && <p className="t-sub">None yet.</p>}
            {d.recentQuizzes.map((qz, i) => (
              <div className="t-row" key={i}>
                <b>{qz.subject} / {qz.topic}</b>
                <span className="t-sub">{Math.round(qz.accuracy)}% · {qz.totalQuestions} Qs · {ago(qz.createdAt)}</span>
              </div>
            ))}
          </div>

          <div className="t-card">
            <h3>🛡 Proctoring (30 days)</h3>
            {!d.proctoringLast30Days.length && <p className="t-sub">No violations.</p>}
            {d.proctoringLast30Days.map((e) => (
              <div className="t-row" key={e.eventType}>
                <b>{e.eventType.replace(/_/g, " ").toLowerCase()}</b>
                <span className="badge needs-work">{e.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="t-card">
          <h3>🚩 Flagged sessions</h3>
          <p className="t-sub">Sessions where proctoring lowered the trust score. Those answers did not change the student's level.</p>
          {!d.flaggedSessions.length && <p className="t-sub">None.</p>}
          {d.flaggedSessions.map((f) => (
            <div className="t-row t-static" key={f.sessionId}>
              <span>
                <b>{f.mode === "placement" ? "Placement test" : `${f.subject || ""}${f.topic ? ` / ${f.topic}` : ""}`}</b>
                <br /><span className="t-sub">{new Date(f.at).toLocaleString()} · {f.answers} answers · trust {Math.round(f.trust * 100)}%</span>
                <br /><span className="t-sub">{f.events.length ? f.events.map((e) => `${e.eventType.replace(/_/g, " ").toLowerCase()} ×${e.count}`).join(", ") : "No events stored"}</span>
              </span>
              <span className="badge needs-work">{Math.round(f.trust * 100)}%</span>
            </div>
          ))}
        </div>

        <div className="t-card">
          <h3>Last 20 answers</h3>
          <div className="t-dots">
            {d.recentAnswers.map((a, i) => (
              <span
                key={i}
                className={`t-dot ${a.success ? "ok" : "bad"}`}
                title={`${a.subject} / ${a.topic} · ${a.timeTaken}s · ${a.hintsUsed} hints${a.trust < 1 ? " · flagged" : ""}`}
              />
            ))}
          </div>
          <p className="t-sub">Green = correct without hint. Hover a dot for details.</p>
        </div>
      </div>
    </>
  );
};

export default StudentDetail;