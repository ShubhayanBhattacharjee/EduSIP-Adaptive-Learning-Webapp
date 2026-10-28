import React, { useCallback, useEffect, useState } from "react";
import { classApi } from "../../services/classService";
import quizApi from "../../services/quizApi";

const empty = { title: "", kind: "quiz", details: "", subject: "", topic: "", mode: "practice", questions: 10, minutes: 0, dueAt: "" };

const ClassAssignments = ({ classId, onError }) => {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(empty);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    classApi.assignments(classId).then((d) => setList(d.assignments)).catch((e) => onError(e.message));
  }, [classId, onError]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { quizApi.subjects().then((d) => setSubjects(d.subjects || [])).catch(() => {}); }, []);
  useEffect(() => {
    setTopics([]);
    if (form.subject) quizApi.topics(form.subject).then((d) => setTopics(d.topics || [])).catch(() => {});
  }, [form.subject]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value, ...(k === "subject" ? { topic: "" } : {}) });

  const create = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const body = { ...form, questions: Number(form.questions), minutes: Number(form.minutes) };
      if (!body.dueAt) delete body.dueAt;
      await classApi.createAssignment(classId, body);
      setForm(empty);
      load();
    } catch (err) { onError(err.message); }
    finally { setBusy(false); }
  };

  const del = async (a) => {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    try { await classApi.deleteAssignment(classId, a.id); load(); }
    catch (err) { onError(err.message); }
  };

  return (
    <div className="t-card">
      <h3>📝 Assignments</h3>
      <form className="t-form" onSubmit={create}>
        <input placeholder="Title (e.g. Fractions homework)" value={form.title} onChange={set("title")} maxLength={120} required />
        <select value={form.kind} onChange={set("kind")}>
          <option value="quiz">Quiz questions</option>
          <option value="reading">Theory reading</option>
        </select>
        {form.kind === "quiz" && (
          <select value={form.mode} onChange={set("mode")}>
            <option value="practice">Practice a topic</option>
            <option value="level">Level test (whole subject)</option>
          </select>
        )}
        <select value={form.subject} onChange={set("subject")} required>
          <option value="">Subject…</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(form.kind === "reading" || form.mode === "practice") && (
          <select value={form.topic} onChange={set("topic")} required={form.kind === "quiz"} disabled={!form.subject}>
            <option value="">Topic…</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {form.kind === "quiz" && (
          <>
            <select value={form.questions} onChange={set("questions")}>
              {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} questions</option>)}
            </select>
            <select value={form.minutes} onChange={set("minutes")}>
              <option value={0}>No time limit</option>
              {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </>
        )}
        {form.kind === "reading" && (
          <textarea placeholder="What to read (chapter, page range, link, notes)" value={form.details} onChange={set("details")} maxLength={1000} rows={2} />
        )}
        <label className="t-sub">Due <input type="date" value={form.dueAt} onChange={set("dueAt")} /></label>
        <button className="t-btn" type="submit" disabled={busy}>Assign</button>
      </form>

      {list === null && <p className="t-sub">Loading…</p>}
      {list && !list.length && <p className="t-sub">No assignments yet.</p>}
      {list && list.map((a) => {
        const pct = a.total ? Math.round((a.completed / a.total) * 100) : 0;
        const late = a.dueAt && new Date(a.dueAt) < new Date();
        return (
          <div className="t-assign" key={a.id}>
            <div className="t-row t-static">
              <span>
                <b>{a.title}</b>{" "}
                <span className="t-sub">
                  · {a.kind === "reading"
                    ? `${a.subject}${a.topic ? ` / ${a.topic}` : ""} · Reading`
                    : <>{a.mode === "level" ? `${a.subject} level test` : `${a.subject} / ${a.topic}`} · {a.questions} Qs{a.minutes ? ` · ${a.minutes} min` : ""}</>}
                </span>
                <br /><span className="t-sub">{a.dueAt ? `Due ${new Date(a.dueAt).toLocaleDateString()}${late ? " (past)" : ""}` : "No due date"}</span>
              </span>
              <span className="t-inline">
                <button className="t-btn t-ghost t-sm" onClick={() => setOpen(open === a.id ? null : a.id)}>{a.completed}/{a.total} done</button>
                <button className="t-btn t-danger t-sm" onClick={() => del(a)}>Delete</button>
              </span>
            </div>
            <div className="t-progress"><div style={{ width: `${pct}%` }} /></div>
            {open === a.id && (
              <p className="t-sub">{a.notDone.length ? `Not done yet: ${a.notDone.join(", ")}` : "Everyone has finished."}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ClassAssignments;