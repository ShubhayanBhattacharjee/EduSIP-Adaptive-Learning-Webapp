import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import adminApi from "../../services/adminApi";
import "./AdminPages.css";

const AdminGenerate = () => {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [f, setF] = useState({ subject: "", topic: "", difficulty: "medium", count: 5 });
  const [newSubject, setNewSubject] = useState(false);
  const [newTopic, setNewTopic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { adminApi.catalog().then((d) => setCatalog(d.subjects)).catch(() => {}); }, []);
  const topics = (catalog.find((s) => s.subject === f.subject) || { topics: [] }).topics;

  const go = async (e) => {
    e.preventDefault();
    setErr(""); setResult(null);
    if (!f.subject.trim() || !f.topic.trim()) return setErr("Choose or type a subject and a topic");
    setBusy(true);
    try {
      setResult(await adminApi.generate({ ...f, subject: f.subject.trim(), topic: f.topic.trim(), count: Number(f.count) }));
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="ap-page">
      <h2>Generate questions with AI</h2>
      <p className="ap-sub">The AI writes the questions and checks its own answer key. Everything it makes goes to the Review queue first.</p>

      <form className="ap-card ap-form" onSubmit={go}>
        <div className="ap-two">
          <label>Subject
            {newSubject ? (
              <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="New subject name" />
            ) : (
              <select value={f.subject} onChange={(e) => { setF({ ...f, subject: e.target.value, topic: "" }); setNewTopic(false); }}>
                <option value="">Choose…</option>{catalog.map((s) => <option key={s.subject}>{s.subject}</option>)}
              </select>
            )}
            <span><input type="checkbox" checked={newSubject} onChange={(e) => { setNewSubject(e.target.checked); setNewTopic(e.target.checked); setF({ ...f, subject: "", topic: "" }); }} /> new subject</span>
          </label>
          <label>Topic
            {newTopic || newSubject ? (
              <input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="New topic name" />
            ) : (
              <select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} disabled={!f.subject}>
                <option value="">Choose…</option>{topics.map((t) => <option key={t.name}>{t.name}</option>)}
              </select>
            )}
            {!newSubject && <span><input type="checkbox" checked={newTopic} onChange={(e) => { setNewTopic(e.target.checked); setF({ ...f, topic: "" }); }} /> new topic</span>}
          </label>
        </div>
        <div className="ap-two">
          <label>Difficulty
            <select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </label>
          <label>How many (1 to 20)
            <input type="number" min={1} max={20} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} />
          </label>
        </div>
        <div className="ap-actions">
          <button className="ap-btn" disabled={busy}>{busy ? "Generating… this can take a minute" : "Generate"}</button>
        </div>
      </form>

      {err && <div className="ap-msg err">{err}</div>}
      {result && (
        <div className="ap-card">
          <h3>Done</h3>
          <p>Asked for {result.asked}. <b>{result.created}</b> saved for review{result.duplicatesSkipped ? `, ${result.duplicatesSkipped} skipped as duplicates` : ""}{result.rejectedByChecks ? `, ${result.rejectedByChecks} dropped because the AI could not confirm the answer` : ""}.</p>
          {(result.questions || []).slice(0, 5).map((q) => <div className="ap-opt" key={q._id}>{q.questionText}</div>)}
          <div className="ap-actions"><button className="ap-btn" onClick={() => navigate("/admin/review")}>Go to Review queue →</button></div>
        </div>
      )}
    </div>
  );
};

export default AdminGenerate;
