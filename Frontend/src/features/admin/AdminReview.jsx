import React, { useCallback, useEffect, useState } from "react";
import adminApi from "../../services/adminApi";
import QuestionEditor from "./QuestionEditor";
import "./AdminPages.css";

const AdminReview = () => {
  const [catalog, setCatalog] = useState([]);
  const [filter, setFilter] = useState({ subject: "", topic: "" });
  const [list, setList] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState(false);

  const say = (text, err = false) => setMsg({ text, err });
  const load = useCallback(() => {
    adminApi.pending(filter).then((d) => { setList(d.questions); setPicked(new Set()); }).catch((e) => say(e.message, true));
  }, [filter]);

  useEffect(() => { adminApi.catalog().then((d) => setCatalog(d.subjects)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const topics = (catalog.find((s) => s.subject === filter.subject) || { topics: [] }).topics;

  const decide = async (q, action, edits) => {
    try {
      await adminApi.review(q._id, action, edits);
      setList((l) => l.filter((x) => x._id !== q._id));
      setEditing(null);
      say(action === "approve" ? "Approved. Students can now get this question." : "Rejected.");
    } catch (e) { say(e.message, true); throw e; }
  };

  const bulk = async (action) => {
    if (!picked.size) return;
    if (action === "approve" && !window.confirm(`Approve ${picked.size} questions without reading each one again?`)) return;
    setBusy(true);
    try {
      const r = await adminApi.bulkReview([...picked], action);
      say(`${r.updated} question(s) ${action === "approve" ? "approved" : "rejected"}.`);
      load();
    } catch (e) { say(e.message, true); } finally { setBusy(false); }
  };

  const purge = async () => {
    if (!window.confirm("Permanently delete rejected AI questions that nobody answered?")) return;
    try { const r = await adminApi.purgeRejected(); say(`${r.deleted} rejected question(s) deleted.`); } catch (e) { say(e.message, true); }
  };

  const toggle = (id) => { const s = new Set(picked); if (s.has(id)) s.delete(id); else s.add(id); setPicked(s); };

  return (
    <div className="ap-page">
      <h2>Review queue</h2>
      <p className="ap-sub">AI-made questions wait here. Students never see them until you approve. Read the answer key and the options before approving.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}

      <div className="ap-bar">
        <select value={filter.subject} onChange={(e) => setFilter({ subject: e.target.value, topic: "" })}>
          <option value="">All subjects</option>{catalog.map((s) => <option key={s.subject}>{s.subject}</option>)}
        </select>
        <select value={filter.topic} disabled={!filter.subject} onChange={(e) => setFilter({ ...filter, topic: e.target.value })}>
          <option value="">All topics</option>{topics.map((t) => <option key={t.name}>{t.name}</option>)}
        </select>
        <button className="ap-btn sm ghost" onClick={() => setPicked(picked.size === (list || []).length ? new Set() : new Set((list || []).map((q) => q._id)))}>
          {list && picked.size === list.length && list.length ? "Unselect all" : "Select all"}
        </button>
        <button className="ap-btn sm ok" disabled={!picked.size || busy} onClick={() => bulk("approve")}>Approve selected ({picked.size})</button>
        <button className="ap-btn sm danger" disabled={!picked.size || busy} onClick={() => bulk("reject")}>Reject selected</button>
        <button className="ap-btn sm ghost" onClick={purge}>Delete old rejected</button>
      </div>

      {!list && <p className="ap-sub">Loading…</p>}
      {list && !list.length && <div className="ap-card">Nothing waiting for review. 🎉</div>}
      {list && list.map((q) => (
        <div className="ap-q" key={q._id}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" checked={picked.has(q._id)} onChange={() => toggle(q._id)} />
            <span><b>{q.questionText}</b><br /><span className="ap-sub">{q.subject} / {q.topic} · {q.difficulty}{q.level ? ` · level ${q.level}` : ""}</span></span>
          </label>

          {editing === q._id ? (
            <QuestionEditor question={q} compact saveLabel="Save and approve" onSave={(body) => decide(q, "approve", body)} onCancel={() => setEditing(null)} />
          ) : (
            <>
              {q.options.map((o, i) => (
                <div className={`ap-opt ${i === q.correctAnswer ? "right" : ""}`} key={i}>
                  {i === q.correctAnswer ? "✔ " : ""}{o}
                  {q.misconceptions && q.misconceptions[i] && <small>if chosen: {q.misconceptions[i]}</small>}
                </div>
              ))}
              <p className="ap-sub">Hint: {q.hint || "none"}</p>
              <div className="ap-actions">
                <button className="ap-btn ok" onClick={() => decide(q, "approve").catch(() => {})}>Approve</button>
                <button className="ap-btn ghost" onClick={() => setEditing(q._id)}>Edit then approve</button>
                <button className="ap-btn danger" onClick={() => decide(q, "reject").catch(() => {})}>Reject</button>
              </div>
            </>
          )}
        </div>
      ))}
      {list && list.length >= 200 && <p className="ap-sub">Showing the newest 200. Approve or reject some to see more.</p>}
    </div>
  );
};

export default AdminReview;
