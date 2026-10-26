import React, { useCallback, useEffect, useState } from "react";
import adminApi from "../../services/adminApi";
import QuestionEditor from "./QuestionEditor";
import "./AdminPages.css";

const FLAGS = [
  ["", "Any"], ["unused", "Never answered"], ["tooEasy", "Too easy (95%+ right)"],
  ["tooHard", "Too hard or wrong key (15% or less)"], ["noHint", "No hint written"],
];
const SORTS = [
  ["newest", "Newest"], ["oldest", "Oldest"], ["attempts", "Most answered"],
  ["accuracy_asc", "Lowest accuracy"], ["accuracy_desc", "Highest accuracy"], ["elo_desc", "Hardest learned"], ["elo_asc", "Easiest learned"],
];

const Details = ({ q, onChanged, onClose, setMsg }) => {
  const [stats, setStats] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => { adminApi.questionStats(q._id).then(setStats).catch((e) => setMsg(e.message, true)); }, [q._id, setMsg]);

  const save = async (body) => {
    const r = await adminApi.updateQuestion(q._id, body);
    setMsg(r.statsReset ? "Saved. Statistics were reset because the question changed." : "Saved.");
    setEditing(false);
    onChanged();
  };

  return (
    <div className="ap-card" style={{ margin: "6px 0 12px" }}>
      {editing ? (
        <QuestionEditor question={q} showReset onSave={save} onCancel={() => setEditing(false)} />
      ) : (
        <>
          {stats && stats.wrongKeyWarning && (
            <div className="ap-msg err">A wrong option is picked much more often than the marked answer. Check that the answer key is right.</div>
          )}
          <p><b>{q.questionText}</b></p>
          {!stats && <p className="ap-sub">Loading statistics…</p>}
          {(stats ? stats.byOption : q.options.map((t, i) => ({ option: i, text: t, correct: i === q.correctAnswer, picked: 0, share: 0, misconception: "" }))).map((o) => (
            <div className={`ap-opt ${o.correct ? "right" : ""}`} key={o.option}>
              {o.correct ? "✔ " : ""}{o.text}
              {stats && <small>{o.picked} picks · {Math.round(o.share * 100)}%{o.misconception ? ` · mistake: ${o.misconception}` : ""}</small>}
              {stats && <div className={`ap-share ${o.correct ? "right" : ""}`}><div style={{ width: `${o.share * 100}%` }} /></div>}
            </div>
          ))}
          <p className="ap-sub">
            Hint: {q.hint || "none"} · {stats ? `${stats.answers} answers, ${stats.last30Days} in the last 30 days` : ""}
            {stats && stats.avgSeconds !== null ? ` · average ${stats.avgSeconds}s` : ""}
            {stats && stats.answers ? ` · hint used ${Math.round(stats.hintRate * 100)}%` : ""}
          </p>
          <p className="ap-sub">Label level {q.labelLevel} · learned level {q.learnedLevel ?? "not yet"} · source {q.source}</p>
          <div className="ap-actions">
            <button className="ap-btn" onClick={() => setEditing(true)}>Edit</button>
            <button className="ap-btn ghost" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </div>
  );
};

const AdminQuestions = () => {
  const [catalog, setCatalog] = useState([]);
  const [f, setF] = useState({ status: "approved", subject: "", topic: "", search: "", flag: "", sort: "newest", page: 1 });
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsgState] = useState({ text: "", err: false });
  const [selected, setSelected] = useState(new Map());     // id -> short text, kept across pages

  const setMsg = useCallback((text, err = false) => setMsgState({ text, err }), []);
  const load = useCallback(() => {
    adminApi.questions({ ...f, limit: 20 }).then(setData).catch((e) => setMsg(e.message, true));
  }, [f, setMsg]);

  useEffect(() => { adminApi.catalog().then((d) => setCatalog(d.subjects)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const topics = (catalog.find((s) => s.subject === f.subject) || { topics: [] }).topics;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1, ...(k === "subject" ? { topic: "" } : {}) });

  const del = async (q) => {
    if (!window.confirm("Delete this question? If students have answered it, it is hidden instead.")) return;
    try { const r = await adminApi.deleteQuestion(q._id); setMsg(r.message || "Deleted."); setOpen(null); load(); }
    catch (e) { setMsg(e.message, true); }
  };

  const toggle = (q) => {
    const m = new Map(selected);
    if (m.has(q._id)) m.delete(q._id); else m.set(q._id, q.questionText.slice(0, 50));
    setSelected(m);
  };

  const usePlacement = async () => {
    if (!window.confirm(`Make these ${selected.size} questions the new placement test? Students who already took the test keep their result.`)) return;
    try {
      const r = await adminApi.rebuildPlacement([...selected.keys()]);
      setMsg(`Placement test version ${r.version} created with ${r.count} questions.`);
      setSelected(new Map());
    } catch (e) { setMsg(e.message, true); }
  };

  return (
    <div className="ap-page">
      <h2>Question bank</h2>
      <p className="ap-sub">Search, check how each question performs, fix it or retire it.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}

      <div className="ap-bar">
        <select value={f.status} onChange={set("status")}><option value="approved">Live</option><option value="rejected">Rejected or retired</option></select>
        <select value={f.subject} onChange={set("subject")}>
          <option value="">All subjects</option>{catalog.map((s) => <option key={s.subject}>{s.subject}</option>)}
        </select>
        <select value={f.topic} onChange={set("topic")} disabled={!f.subject}>
          <option value="">All topics</option>{topics.map((t) => <option key={t.name}>{t.name}</option>)}
        </select>
        <input placeholder="Search question text" value={f.search} onChange={set("search")} />
        <select value={f.flag} onChange={set("flag")}>{FLAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={f.sort} onChange={set("sort")}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>

      {selected.size > 0 && (
        <div className="ap-msg">
          {selected.size} selected for the placement test{" "}
          <button className="ap-btn sm" onClick={usePlacement}>Use as placement test</button>{" "}
          <button className="ap-btn sm ghost" onClick={() => setSelected(new Map())}>Clear</button>
        </div>
      )}

      {!data && <p className="ap-sub">Loading…</p>}
      {data && !data.questions.length && <p className="ap-sub">No questions match.</p>}
      {data && !!data.questions.length && (
        <div className="ap-scroll">
          <table className="ap-table">
            <thead><tr><th></th><th>Question</th><th>Topic</th><th>Level</th><th>Answers</th><th>Right</th><th>Flags</th><th></th></tr></thead>
            <tbody>
              {data.questions.map((q) => (
                <React.Fragment key={q._id}>
                  <tr>
                    <td><input type="checkbox" checked={selected.has(q._id)} onChange={() => toggle(q)} title="Add to placement test" /></td>
                    <td style={{ maxWidth: 340 }}>{q.questionText.length > 110 ? `${q.questionText.slice(0, 110)}…` : q.questionText}</td>
                    <td>{q.subject}<br /><span className="ap-sub">{q.topic}</span></td>
                    <td>{q.currentLevel}</td>
                    <td>{q.attempts || 0}</td>
                    <td>{q.accuracy === null ? "–" : `${Math.round(q.accuracy * 100)}%`}</td>
                    <td>{q.flags.map((x) => (
                      <span key={x} className={`ap-chip ${/too hard|wrong/.test(x) ? "bad" : /easy|drift/.test(x) ? "warn" : ""}`}>{x}</span>
                    ))}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="ap-btn sm ghost" onClick={() => setOpen(open === q._id ? null : q._id)}>{open === q._id ? "Hide" : "Open"}</button>{" "}
                      <button className="ap-btn sm danger" onClick={() => del(q)}>Delete</button>
                    </td>
                  </tr>
                  {open === q._id && (
                    <tr><td colSpan={8}><Details q={q} onChanged={load} onClose={() => setOpen(null)} setMsg={setMsg} /></td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="ap-pager">
          <button className="ap-btn sm ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>← Prev</button>
          <span className="ap-sub">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} questions</span>
          <button className="ap-btn sm ghost" disabled={data.page * data.limit >= data.total} onClick={() => setF({ ...f, page: f.page + 1 })}>Next →</button>
        </div>
      )}
    </div>
  );
};

export default AdminQuestions;
