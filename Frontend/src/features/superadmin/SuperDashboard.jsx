import React, { useEffect, useState } from "react";
import superAdminApi from "../../services/superAdminApi";
import "../admin/AdminPages.css";
import "./SuperAdminPages.css";

const nice = (a) => String(a || "").replace(/_/g, " ");

// A tiny bar chart (no chart library): one bar per day, the tooltip shows the date and the number.
const Bars = ({ data, alt }) => {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <>
      <div className={`sa-bars ${alt ? "alt" : ""}`}>
        {data.map((d) => <div key={d.date} title={`${d.date}: ${d.count}`} style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }} />)}
      </div>
      <div className="sa-axis"><span>{data[0] && data[0].date}</span><span>{data.length ? `peak ${max}` : ""}</span><span>{data[data.length - 1] && data[data.length - 1].date}</span></div>
    </>
  );
};

const SuperDashboard = () => {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = () => superAdminApi.overview().then(setD).catch((e) => setErr(e.message));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (!d) return <div className="ap-page"><p className="ap-sub">{err || "Loading…"}</p></div>;

  const role = d.users.byRole;
  const total = Object.values(role).reduce((a, b) => a + b, 0);
  const q = d.questions;
  const sum = (arr) => arr.reduce((a, b) => a + b.count, 0);

  return (
    <div className="ap-page">
      <h2>Platform overview</h2>
      <p className="ap-sub">The whole platform at a glance. Refreshes every minute.</p>
      {err && <div className="ap-msg err">{err}</div>}

      <div className="ap-grid">
        <div className="ap-stat"><b>{total}</b><span>Accounts</span></div>
        <div className="ap-stat"><b>{role.student || 0}</b><span>Students</span></div>
        <div className="ap-stat"><b>{role.teacher || 0}</b><span>Teachers</span></div>
        <div className="ap-stat"><b>{(role.admin || 0) + (role.superadmin || 0)}</b><span>Staff ({role.superadmin || 0} super admin)</span></div>
        <div className="ap-stat"><b>{d.classes}</b><span>Classes</span></div>
        <div className={`ap-stat ${d.users.pendingTeachers ? "warn" : ""}`}><b>{d.users.pendingTeachers}</b><span>Teachers waiting for approval</span></div>
        <div className={`ap-stat ${d.users.disabled ? "warn" : ""}`}><b>{d.users.disabled}</b><span>Disabled accounts</span></div>
        <div className="ap-stat"><b>{d.users.unverified}</b><span>Email not verified</span></div>
      </div>

      <div className="ap-grid">
        <div className="ap-stat"><b>{d.last7Days.activeStudents}</b><span>Active students, last 7 days</span></div>
        <div className="ap-stat"><b>{d.last7Days.answers}</b><span>Answers, last 7 days</span></div>
        <div className="ap-stat"><b>{q.approved || 0}</b><span>Live questions</span></div>
        <div className={`ap-stat ${q.pending ? "warn" : ""}`}><b>{q.pending || 0}</b><span>Questions waiting for review</span></div>
        <div className="ap-stat"><b>{q.rejected || 0}</b><span>Rejected questions</span></div>
      </div>

      <div className="sa-trends">
        <div className="ap-card">
          <h3>New accounts, last {d.trends.days} days</h3>
          <b>{sum(d.trends.signups)}</b> <span className="ap-sub">in total</span>
          <Bars data={d.trends.signups} />
        </div>
        <div className="ap-card">
          <h3>Answers, last {d.trends.days} days</h3>
          <b>{sum(d.trends.answers)}</b> <span className="ap-sub">in total</span>
          <Bars data={d.trends.answers} alt />
        </div>
      </div>

      <div className="ap-card">
        <h3>Recent staff activity</h3>
        {!d.recentActivity.length && <p className="ap-sub">Nothing logged yet.</p>}
        <ul className="sa-list">
          {d.recentActivity.map((e) => (
            <li key={e._id}>
              <span><b>{nice(e.action)}</b> · {e.actorEmail || "system"}{e.targetEmail && e.targetEmail !== e.actorEmail ? ` → ${e.targetEmail}` : ""}</span>
              <time>{new Date(e.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SuperDashboard;
