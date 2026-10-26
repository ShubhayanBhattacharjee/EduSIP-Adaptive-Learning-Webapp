import React, { useCallback, useEffect, useState } from "react";
import superAdminApi from "../../services/superAdminApi";
import "../admin/AdminPages.css";
import "./SuperAdminPages.css";

const CATEGORIES = ["user", "staff", "auth", "class", "settings", "system"];
const nice = (a) => String(a || "").replace(/_/g, " ");
const short = (d) => (d === undefined || d === null ? "" : typeof d === "string" ? d : JSON.stringify(d));

const SuperAuditLog = () => {
  const [f, setF] = useState({ search: "", action: "", category: "", from: "", to: "", page: 1 });
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ text: "", err: false });
  const [busy, setBusy] = useState(false);
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => { superAdminApi.auditLog({ ...f, limit: 50 }).then(setData).catch((e) => say(e.message, true)); }, [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);   // wait while typing

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, page: 1 });

  const exportCsv = async () => {
    setBusy(true);
    try {
      const filters = { ...f };             // the export covers every page of the current filter
      delete filters.page;
      await superAdminApi.downloadAuditCsv(filters);
      say("CSV downloaded (up to 5000 newest rows of this filter).");
      load();                                // the export itself is logged
    } catch (e) { say(e.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="ap-page">
      <h2>Audit log</h2>
      <p className="ap-sub">Who did what, and when. Entries cannot be edited or deleted from the app.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}

      <div className="ap-bar">
        <input placeholder="Search by email" value={f.search} onChange={set("search")} />
        <select value={f.action} onChange={set("action")}>
          <option value="">Any action</option>{(data ? data.actions : []).map((a) => <option key={a} value={a}>{nice(a)}</option>)}
        </select>
        <select value={f.category} onChange={set("category")}>
          <option value="">Any category</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="ap-sub">From <input type="date" value={f.from} onChange={set("from")} /></label>
        <label className="ap-sub">To <input type="date" value={f.to} onChange={set("to")} /></label>
        <button className="ap-btn sm ghost" onClick={() => setF({ search: "", action: "", category: "", from: "", to: "", page: 1 })}>Clear</button>
        <button className="ap-btn sm" disabled={busy} onClick={exportCsv}>{busy ? "Exporting…" : "Export CSV"}</button>
      </div>

      {!data && <p className="ap-sub">Loading…</p>}
      {data && !data.entries.length && <p className="ap-sub">No entries match.</p>}
      {data && !!data.entries.length && (
        <div className="ap-scroll">
          <table className="ap-table">
            <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>On</th><th>IP</th><th>Details</th></tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e._id}>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.actorEmail || "system"}</td>
                  <td><span className={`ap-chip ${/failed|deleted|disable/.test(e.action) ? "bad" : ""}`}>{nice(e.action)}</span></td>
                  <td>{e.targetEmail && e.targetEmail !== e.actorEmail ? e.targetEmail : "–"}</td>
                  <td>{e.ip || "–"}</td>
                  <td><div className="sa-details" title={short(e.details)}>{short(e.details) || "–"}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="ap-pager">
          <button className="ap-btn sm ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>← Prev</button>
          <span className="ap-sub">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} entries</span>
          <button className="ap-btn sm ghost" disabled={data.page * data.limit >= data.total} onClick={() => setF({ ...f, page: f.page + 1 })}>Next →</button>
        </div>
      )}
    </div>
  );
};

export default SuperAuditLog;
