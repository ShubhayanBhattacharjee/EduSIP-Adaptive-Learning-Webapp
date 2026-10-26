import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import adminApi from "../../services/adminApi";
import "./AdminPages.css";

const AdminPlacement = () => {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState(false);
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => { adminApi.placement().then(setData).catch((e) => say(e.message, true)); }, []);
  useEffect(() => { load(); }, [load]);

  const rebuild = async () => {
    if (!window.confirm("Build a new placement test automatically? Students who already took the test keep their result.")) return;
    setBusy(true);
    try { const r = await adminApi.rebuildPlacement(); say(`Version ${r.version} created (${r.count} questions).`); load(); }
    catch (e) { say(e.message, true); } finally { setBusy(false); }
  };

  const spread = data ? [...data.questions].sort((a, b) => a.level - b.level) : [];

  return (
    <div className="ap-page">
      <h2>Placement test</h2>
      <p className="ap-sub">The same short test for every new student. It sets their starting level.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}

      {data && (
        <div className="ap-grid">
          <div className="ap-stat"><b>v{data.version}</b><span>Active version ({data.source})</span></div>
          <div className="ap-stat"><b>{data.size}</b><span>Questions</span></div>
          <div className="ap-stat"><b>{data.takers}</b><span>Students who took it</span></div>
          <div className="ap-stat"><b>{data.notYet}</b><span>Students who have not</span></div>
        </div>
      )}

      <div className="ap-card">
        <div className="ap-actions" style={{ marginTop: 0 }}>
          <button className="ap-btn" disabled={busy} onClick={rebuild}>{busy ? "Building…" : "Rebuild automatically"}</button>
          <Link className="ap-btn ghost" style={{ textDecoration: "none" }} to="/admin/questions">Pick questions by hand</Link>
        </div>
        <p className="ap-sub">To pick by hand: tick questions in the Question bank (any pages), then press "Use as placement test". To let one student retake it, use the Users page.</p>
        {data && spread.length > 0 && spread[0].level === spread[spread.length - 1].level && (
          <div className="ap-msg err">Every question has the same level, so the test cannot tell students apart. Mix easy and hard questions.</div>
        )}
      </div>

      {data && (
        <div className="ap-card">
          <h3>Questions in this version</h3>
          <div className="ap-scroll">
            <table className="ap-table">
              <thead><tr><th>#</th><th>Question</th><th>Topic</th><th>Level</th></tr></thead>
              <tbody>
                {data.questions.map((q, i) => (
                  <tr key={q._id}><td>{i + 1}</td><td>{q.questionText.slice(0, 120)}</td><td>{q.subject} / {q.topic}</td><td>{q.level}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPlacement;
