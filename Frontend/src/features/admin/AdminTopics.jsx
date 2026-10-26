import React, { useCallback, useEffect, useState } from "react";
import adminApi from "../../services/adminApi";
import "./AdminPages.css";

const TopicRow = ({ subject, topic, siblings, onSaved, say }) => {
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState(new Set(topic.prerequisites));
  const [busy, setBusy] = useState(false);

  const toggle = (n) => { const s = new Set(sel); if (s.has(n)) s.delete(n); else s.add(n); setSel(s); };

  const save = async () => {
    setBusy(true);
    try {
      await adminApi.saveTopic({ subject, name: topic.name, prerequisites: [...sel] });
      say(`Saved prerequisites for ${topic.name}.`);
      setEditing(false);
      onSaved();
    } catch (e) { say(e.message, true); } finally { setBusy(false); }
  };

  const clear = async () => {
    if (!topic.topicId || !window.confirm(`Remove the prerequisite record for ${topic.name}? Its questions stay. Other topics stop depending on it.`)) return;
    try { await adminApi.deleteTopic(topic.topicId); say("Removed."); onSaved(); } catch (e) { say(e.message, true); }
  };

  return (
    <div className="ap-q">
      <div className="ap-bar" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span><b>{topic.name}</b> <span className="ap-sub">{topic.approved} live questions{topic.pending ? ` · ${topic.pending} waiting` : ""}</span></span>
        <span>
          <button className="ap-btn sm ghost" onClick={() => { setSel(new Set(topic.prerequisites)); setEditing(!editing); }}>{editing ? "Cancel" : "Edit"}</button>{" "}
          {topic.topicId && <button className="ap-btn sm danger" onClick={clear}>Remove record</button>}
        </span>
      </div>
      {!editing && (
        <p className="ap-sub" style={{ margin: 0 }}>
          {topic.prerequisites.length ? <>Needs first: {topic.prerequisites.map((p) => <span className="ap-chip" key={p}>{p}</span>)}</> : "No prerequisites set."}
        </p>
      )}
      {editing && (
        <>
          <p className="ap-sub">Tick the topics a student should understand before {topic.name}. When a student struggles here, the study plan sends them to these first.</p>
          <div className="ap-checks">
            {siblings.filter((t) => t.name !== topic.name).map((t) => (
              <label key={t.name}><input type="checkbox" checked={sel.has(t.name)} onChange={() => toggle(t.name)} />{t.name}</label>
            ))}
          </div>
          <div className="ap-actions"><button className="ap-btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></div>
        </>
      )}
    </div>
  );
};

const AdminTopics = () => {
  const [catalog, setCatalog] = useState(null);
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState({ text: "", err: false });
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => {
    adminApi.catalog().then((d) => { setCatalog(d.subjects); setSubject((s) => s || (d.subjects[0] && d.subjects[0].subject) || ""); }).catch((e) => say(e.message, true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const current = catalog && catalog.find((s) => s.subject === subject);

  return (
    <div className="ap-page">
      <h2>Topic prerequisites</h2>
      <p className="ap-sub">Tell the system which topics build on which. It uses this to find the real weak spot behind a student's mistakes.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}
      {!catalog && <p className="ap-sub">Loading…</p>}
      {catalog && (
        <div className="ap-bar">
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {catalog.map((s) => <option key={s.subject}>{s.subject}</option>)}
          </select>
        </div>
      )}
      {current && current.topics.map((t) => (
        <TopicRow key={t.name} subject={current.subject} topic={t} siblings={current.topics} onSaved={load} say={say} />
      ))}
    </div>
  );
};

export default AdminTopics;
