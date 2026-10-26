import React, { useCallback, useEffect, useState } from "react";
import superAdminApi from "../../services/superAdminApi";
import "../admin/AdminPages.css";
import "./SuperAdminPages.css";

const when = (d) => (d ? new Date(d).toLocaleString() : "never");

const SuperMlControl = () => {
  const [ml, setMl] = useState(null);
  const [sys, setSys] = useState(null);
  const [out, setOut] = useState(null);                  // result of the last action
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState("");
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => {
    superAdminApi.mlInfo().then(setMl).catch((e) => say(e.message, true));
    superAdminApi.system().then(setSys).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const run = async (name, fn, ok) => {
    setBusy(name);
    try { const r = await fn(); setOut(r.result || r); say(ok); load(); } catch (e) { say(e.message, true); setOut(null); } finally { setBusy(""); }
  };

  if (!ml) return <div className="ap-page"><p className="ap-sub">{msg.text || "Loading…"}</p></div>;
  const info = ml.info;
  const waiting = sys ? sys.queue.answersWaitingForModel : null;

  return (
    <div className="ap-page">
      <h2>ML control</h2>
      <p className="ap-sub">The Python service that picks questions and learns from answers. Refreshes every 30 seconds.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}
      {!ml.up && <div className="ap-msg err">The ML service is not answering. Quizzes use a simple fallback and answers are not learned from.</div>}

      <div className="ap-grid">
        <div className={`ap-stat ${ml.up ? "" : "bad"}`}><b><span className={`ap-dot ${ml.up ? "up" : "down"}`} />{ml.up ? "Online" : "Offline"}</b><span>Service</span></div>
        <div className="ap-stat"><b style={{ fontSize: "1.1rem" }}>{(ml.health && ml.health.model_version) || "–"}</b><span>Model version</span></div>
        <div className={`ap-stat ${waiting ? "warn" : ""}`}><b>{waiting === null ? "–" : waiting}</b><span>Answers waiting for the model</span></div>
        <div className="ap-stat"><b style={{ fontSize: "1.1rem" }}>{sys ? when(sys.reconcile.lastRunAt) : "–"}</b><span>Last catch-up run</span></div>
      </div>

      <div className="ap-card">
        <h3>Actions</h3>
        <div className="ap-actions">
          <button className="ap-btn" disabled={!!busy || !ml.up} onClick={() => window.confirm("Load the latest fitted numbers into the running ML service?") && run("reload", superAdminApi.mlReload, "The ML service loaded the new numbers.")}>
            {busy === "reload" ? "Reloading…" : "Reload model numbers"}
          </button>
          <button className="ap-btn ghost" disabled={!!busy} onClick={() => run("reconcile", superAdminApi.reconcile, "Catch-up run finished.")}>
            {busy === "reconcile" ? "Running…" : "Learn from waiting answers now"}
          </button>
        </div>
        <p className="ap-sub">Reload after running scripts/refit_elo.py. The catch-up run replays answers that arrived while the ML service was down.</p>
        {out && <pre className="sa-pre">{JSON.stringify(out, null, 2)}</pre>}
      </div>

      {info && (
        <>
          <div className="ap-card">
            <h3>Model</h3>
            <p className="ap-sub">{info.method}</p>
            <div className="sa-kv">
              {Object.entries(info.settings || {}).map(([k, v]) => (
                <React.Fragment key={k}><span>{k}</span><span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span></React.Fragment>
              ))}
            </div>
          </div>
          <div className="ap-card">
            <h3>Research results</h3>
            <p className="ap-sub">How the model did on the held-out test students (from the ML folder's metrics files).</p>
            {Object.entries(info.research_results_on_junyi_test_students || {}).map(([k, v]) => (
              <details key={k}><summary><b>{k}</b></summary><pre className="sa-pre">{JSON.stringify(v, null, 2)}</pre></details>
            ))}
          </div>
        </>
      )}
      {!info && ml.up && <div className="ap-msg">The service is up but did not return its model details. Check that ML_API_KEY is the same in both .env files.</div>}
    </div>
  );
};

export default SuperMlControl;
