import React, { useCallback, useEffect, useState } from "react";
import adminApi from "../../services/adminApi";
import "./AdminPages.css";

const when = (d) => (d ? new Date(d).toLocaleString() : "never");

const AdminSystem = () => {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState("");
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => { adminApi.system().then(setS).catch((e) => say(e.message, true)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const run = async (name, fn, ok) => {
    setBusy(name);
    try { const r = await fn(); say(ok(r)); load(); } catch (e) { say(e.message, true); } finally { setBusy(""); }
  };

  if (!s) return <div className="ap-page"><p className="ap-sub">{msg.text || "Loading…"}</p></div>;

  const warnings = [];
  if (!s.ml.up) warnings.push("The ML service is down. Quizzes run on a simple fallback and answers are not learned from.");
  if (!s.database.connected) warnings.push("The database is not connected.");
  if (s.settings.skipEmailVerification) warnings.push("Email verification is skipped (SKIP_EMAIL_VERIFICATION=true). Anyone can sign up with any email.");
  if (s.settings.forceAdaptive) warnings.push("FORCE_ADAPTIVE is on, so there is no control group for the pilot study.");
  if (s.settings.legacyStaffLogin) warnings.push("Legacy staff login is on. Admins can sign in through the public form.");
  if (s.queue.answersWaitingForModel > 0) warnings.push(`${s.queue.answersWaitingForModel} answers are waiting to be learned from (oldest ${when(s.queue.oldestWaitingAt)}).`);

  return (
    <div className="ap-page">
      <h2>System</h2>
      <p className="ap-sub">Refreshes every 30 seconds. Server time {when(s.serverTime)}.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}
      {warnings.map((w) => <div className="ap-msg err" key={w}>{w}</div>)}

      <div className="ap-grid">
        <div className={`ap-stat ${s.ml.up ? "" : "bad"}`}><b><span className={`ap-dot ${s.ml.up ? "up" : "down"}`} />{s.ml.up ? "Online" : "Offline"}</b><span>ML service {s.ml.model_version ? `· ${s.ml.model_version}` : ""}</span></div>
        <div className={`ap-stat ${s.database.connected ? "" : "bad"}`}><b><span className={`ap-dot ${s.database.connected ? "up" : "down"}`} />{s.database.connected ? "Connected" : "Down"}</b><span>Database</span></div>
        <div className={`ap-stat ${s.queue.answersWaitingForModel ? "warn" : ""}`}><b>{s.queue.answersWaitingForModel}</b><span>Answers waiting for the model</span></div>
        <div className="ap-stat"><b>{s.queue.pendingQuestions}</b><span>Questions waiting for review</span></div>
      </div>

      <div className="ap-card">
        <h3>ML service</h3>
        {s.ml.up ? (
          <p className="ap-sub">AI tutor (Groq) {s.ml.groq_configured ? "is configured" : "is NOT configured: hints and AI questions will fail"} · access key {s.ml.api_key_required ? "required" : "NOT required (set ML_API_KEY)"}.</p>
        ) : <p className="ap-sub">Start it again with <code>uvicorn src.app:app</code> in the ML folder.</p>}
        <div className="ap-actions">
          <button className="ap-btn" disabled={!s.ml.up || busy === "reload"} onClick={() => run("reload", adminApi.mlReload, (r) => `Loaded model numbers (${r.result.model_version}).`)}>Load new model numbers</button>
        </div>
        <p className="ap-sub">Use this after running the refit script, so the service picks up the new numbers without a restart.</p>
      </div>

      <div className="ap-card">
        <h3>Late answers</h3>
        <p className="ap-sub">
          When the ML service is down, answers are saved and replayed later. It runs by itself every {s.reconcile.everyMinutes} minutes. Last run: {when(s.reconcile.lastRunAt)}
          {s.reconcile.lastResult ? ` · ${JSON.stringify(s.reconcile.lastResult)}` : ""}.
        </p>
        <div className="ap-actions">
          <button className="ap-btn" disabled={busy === "rec"} onClick={() => run("rec", adminApi.reconcile, (r) => `Done: ${JSON.stringify(r.result)}`)}>Run now</button>
        </div>
      </div>

      <div className="ap-card">
        <h3>Settings (read only, from the server .env)</h3>
        <div className="ap-checks">
          {Object.entries(s.settings).map(([k, v]) => (
            <span key={k} className={`ap-chip ${(k === "skipEmailVerification" || k === "forceAdaptive" || k === "legacyStaffLogin") && v ? "bad" : ""}`}>{k}: {String(v)}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminSystem;
