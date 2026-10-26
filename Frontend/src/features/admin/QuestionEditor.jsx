import React, { useState } from "react";

// One form used by the question bank and the review queue.
//   compact = true  -> text, options, key, hint, level only (the review endpoint cannot move a question to another topic)
//   showReset       -> offer "reset statistics" (bank only)
const QuestionEditor = ({ question, compact, showReset, saveLabel = "Save", onSave, onCancel }) => {
  const [f, setF] = useState({
    subject: question.subject || "",
    topic: question.topic || "",
    questionText: question.questionText || "",
    options: [...(question.options || ["", "", "", ""])],
    correctAnswer: question.correctAnswer ?? 0,
    hint: question.hint || "",
    level: question.level ?? "",
    resetStats: false,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const setOpt = (i, v) => setF({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) });

  const save = async () => {
    setErr("");
    const opts = f.options.map((o) => o.trim());
    if (!f.questionText.trim()) return setErr("Write the question");
    if (opts.some((o) => !o)) return setErr("Fill in all 4 options");
    if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) return setErr("The 4 options must be different");
    const body = {
      questionText: f.questionText.trim(), options: opts, correctAnswer: Number(f.correctAnswer),
      hint: f.hint.trim(), level: f.level === "" ? null : Number(f.level),
    };
    if (!compact) { body.subject = f.subject.trim(); body.topic = f.topic.trim(); if (f.resetStats) body.resetStats = true; }
    setBusy(true);
    try { await onSave(body); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="ap-form">
      {!compact && (
        <div className="ap-two">
          <label>Subject<input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <label>Topic<input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} /></label>
        </div>
      )}
      <label>Question<textarea value={f.questionText} onChange={(e) => setF({ ...f, questionText: e.target.value })} /></label>
      {f.options.map((o, i) => (
        <label key={i} style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8 }}>
          <input type="radio" name={`key-${question._id}`} checked={Number(f.correctAnswer) === i} onChange={() => setF({ ...f, correctAnswer: i })} title="Correct answer" />
          <input value={o} placeholder={`Option ${i + 1}`} onChange={(e) => setOpt(i, e.target.value)} />
        </label>
      ))}
      <p className="ap-sub" style={{ margin: 0 }}>The round button marks the correct answer.</p>
      <label>Hint<input value={f.hint} onChange={(e) => setF({ ...f, hint: e.target.value })} placeholder="A nudge that does not give the answer away" /></label>
      <label>Starting level (1 easiest to 10 hardest, blank = use the easy/medium/hard label)
        <select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
          <option value="">Not set</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {showReset && (
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={f.resetStats} onChange={(e) => setF({ ...f, resetStats: e.target.checked })} />
          Reset attempts and learned difficulty (changing the correct answer does this automatically)
        </label>
      )}
      {err && <div className="ap-msg err">{err}</div>}
      <div className="ap-actions">
        <button className="ap-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : saveLabel}</button>
        <button className="ap-btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

export default QuestionEditor;
