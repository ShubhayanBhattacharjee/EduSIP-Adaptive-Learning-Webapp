import React, { useCallback, useEffect, useState } from "react";
import superAdminApi from "../../services/superAdminApi";
import "../admin/AdminPages.css";
import "./SuperAdminPages.css";

const SuperClasses = () => {
  const [f, setF] = useState({ search: "", page: 1 });
  const [data, setData] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [moving, setMoving] = useState(null);            // { id, teacherId }
  const [msg, setMsg] = useState({ text: "", err: false });
  const say = (text, err = false) => setMsg({ text, err });

  const load = useCallback(() => { superAdminApi.classes({ ...f, limit: 20 }).then(setData).catch((e) => say(e.message, true)); }, [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);   // wait while typing
  useEffect(() => { superAdminApi.teachers().then((d) => setTeachers(d.teachers)).catch(() => {}); }, []);

  const run = async (fn, ok) => {
    try { await fn(); say(ok); setMoving(null); load(); } catch (e) { say(e.message, true); }
  };

  return (
    <div className="ap-page">
      <h2>Classes</h2>
      <p className="ap-sub">Every class on the platform. Move a class to another teacher (for example when a teacher leaves) or delete it.</p>
      {msg.text && <div className={`ap-msg ${msg.err ? "err" : ""}`}>{msg.text}</div>}

      <div className="ap-bar">
        <input placeholder="Search class, join code or teacher" value={f.search} onChange={(e) => setF({ search: e.target.value, page: 1 })} />
      </div>

      {!data && <p className="ap-sub">Loading…</p>}
      {data && !data.classes.length && <p className="ap-sub">No classes match.</p>}
      {data && !!data.classes.length && (
        <div className="ap-scroll">
          <table className="ap-table">
            <thead><tr><th>Class</th><th>Teacher</th><th>Students</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {data.classes.map((c) => (
                <tr key={c._id}>
                  <td><b>{c.name}</b><br /><span className="ap-sub">code {c.joinCode}</span></td>
                  <td>
                    {c.teacher ? <>{c.teacher.fullname}<br /><span className="ap-sub">{c.teacher.email}</span>{c.teacher.disabled && <> <span className="ap-chip bad">disabled</span></>}</> : <span className="ap-chip warn">teacher removed</span>}
                  </td>
                  <td>{c.studentCount}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {moving && moving.id === c._id ? (
                      <>
                        <select className="ap-row-input" value={moving.teacherId} onChange={(e) => setMoving({ id: c._id, teacherId: e.target.value })}>
                          <option value="">Choose a teacher…</option>
                          {teachers.filter((t) => !c.teacher || t._id !== c.teacher._id).map((t) => <option key={t._id} value={t._id}>{t.fullname} ({t.email})</option>)}
                        </select>{" "}
                        <button className="ap-btn sm ok" disabled={!moving.teacherId} onClick={() => run(() => superAdminApi.moveClass(c._id, moving.teacherId), "Class moved.")}>Move</button>{" "}
                        <button className="ap-btn sm ghost" onClick={() => setMoving(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="ap-btn sm ghost" onClick={() => setMoving({ id: c._id, teacherId: "" })}>Move to…</button>{" "}
                        <button className="ap-btn sm danger" onClick={() => window.confirm(`Delete "${c.name}" and its assignments? The ${c.studentCount} student(s) keep their own progress.`) && run(() => superAdminApi.deleteClass(c._id), "Class deleted.")}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="ap-pager">
          <button className="ap-btn sm ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>← Prev</button>
          <span className="ap-sub">Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} classes</span>
          <button className="ap-btn sm ghost" disabled={data.page * data.limit >= data.total} onClick={() => setF({ ...f, page: f.page + 1 })}>Next →</button>
        </div>
      )}
    </div>
  );
};

export default SuperClasses;
