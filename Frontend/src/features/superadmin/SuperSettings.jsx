import React, { useCallback, useEffect, useState } from "react";
import superAdminApi from "../../services/superAdminApi";
import "../admin/AdminPages.css";
import "./SuperAdminPages.css";

const show = (v) => (typeof v === "boolean" ? (v ? "on" : "off") : String(v));

const SuperSettings = () => {
  const [list, setList] = useState(null);
  const [draft, setDraft] = useState({});                // key -> edited value (only keys that differ from the saved one)
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState(false);
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => { superAdminApi.settings().then((d) => { setList(d.settings); setDraft({}); }).catch((e) => say(e.message, true)); }, []);
  useEffect(() => { load(); }, [load]);

  if (!list) return <div className="ap-page"><p className="ap-sub">{msg.text || "Loading…"}</p></div>;

  const valueOf = (s) => (s.key in draft ? draft[s.key] : s.value);
  const edit = (s, v) => {
    const d = { ...draft };
    if (v === s.value) delete d[s.key]; else d[s.key] = v;
    setDraft(d);
  };
  const changed = list.filter((s) => s.key in draft);

  const save = async () => {
    const lines = changed.map((s) => `${s.label}: ${show(s.value)} → ${show(draft[s.key])}`).join("\n");
    if (!window.confirm(`Change these settings for everyone?\n\n${lines}`)) return;
    setBusy(true);
    try {
      const changes = {};
      changed.forEach((s) => { changes[s.key] = typeof s.value === "number" ? Number(draft[s.key]) : draft[s.key]; });
      const d = await superAdminApi.saveSettings(changes);
      setList(d.settings); setDraft({});
      say("Saved. The change is live now.");
    } catch (e) { say(e.message, true); } finally { setBusy(false); }
  };

  const reset = async (s) => {
    if (!window.confirm(`Go back to the server setting (${show(s.envValue)}) for "${s.label}"?`)) return;
    try { const d = await superAdminApi.resetSetting(s.key); setList(d.settings); setDraft({}); say("Back to the server setting."); } catch (e) { say(e.message, true); }
  };

  const forceOn = valueOf(list.find((s) => s.key === "forceAdaptive"));
  const pilotOn = valueOf(list.find((s) => s.key === "pilotMode"));

  return (
    <div className="ap-page">
      <h2>Platform settings</h2>
      <p className="ap-sub">These take effect immediately, with no restart. "Server" means the value comes from the .env file; once you save a change here it overrides .env until you reset it.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}
      {forceOn && <div className="ap-msg err">Force adaptive is on: everyone gets the adaptive version, so the pilot study has no control group.</div>}
      {!forceOn && pilotOn && <div className="ap-msg">Pilot mode is on: students without a manual group are split between adaptive and control.</div>}

      <div className="ap-card">
        {list.map((s) => (
          <div className="sa-setting" key={s.key}>
            <div>
              <b>{s.label}</b>
              <small>
                <span className={`ap-chip ${s.source === "database" ? "warn" : ""}`}>{s.source === "database" ? "changed here" : "server"}</span>
                {s.source === "database" && <> server value: {show(s.envValue)}</>}
                {s.type === "number" && <> · allowed {s.min} to {s.max}</>}
              </small>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {s.type === "boolean" ? (
                <input type="checkbox" className="sa-switch" checked={!!valueOf(s)} onChange={(e) => edit(s, e.target.checked)} aria-label={s.label} />
              ) : (
                <input type="number" className="ap-row-input" min={s.min} max={s.max} value={valueOf(s)} onChange={(e) => edit(s, e.target.value === "" ? "" : Number(e.target.value))} aria-label={s.label} />
              )}
              {s.source === "database" && <button className="ap-btn sm ghost" onClick={() => reset(s)}>Reset</button>}
            </div>
          </div>
        ))}
        <div className="ap-actions">
          <button className="ap-btn" disabled={!changed.length || busy} onClick={save}>{busy ? "Saving…" : `Save ${changed.length || ""} change${changed.length === 1 ? "" : "s"}`}</button>
          <button className="ap-btn ghost" disabled={!changed.length} onClick={() => setDraft({})}>Discard</button>
        </div>
      </div>
    </div>
  );
};

export default SuperSettings;
