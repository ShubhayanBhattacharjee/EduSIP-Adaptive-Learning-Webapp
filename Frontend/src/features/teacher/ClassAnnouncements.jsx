import React, { useState } from "react";
import { classApi } from "../../services/classService";

const ClassAnnouncements = ({ classId, items, onChange, onError }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await classApi.addAnnouncement(classId, text); setText(""); onChange(); }
    catch (err) { onError(err.message); }
    finally { setBusy(false); }
  };

  const del = async (a) => {
    try { await classApi.deleteAnnouncement(classId, a.id); onChange(); }
    catch (err) { onError(err.message); }
  };

  return (
    <div className="t-card">
      <h3>📣 Announcements</h3>
      <form className="t-inline" onSubmit={post}>
        <input style={{ flex: 1, minWidth: 200 }} value={text} maxLength={500} placeholder="Write a note your students will see on their dashboard"
          onChange={(e) => setText(e.target.value)} />
        <button className="t-btn" type="submit" disabled={busy}>Post</button>
      </form>
      {!items.length && <p className="t-sub">Nothing posted yet.</p>}
      {items.map((a) => (
        <div className="t-row t-static" key={a.id}>
          <span>{a.text}<br /><span className="t-sub">{new Date(a.createdAt).toLocaleDateString()}</span></span>
          <button className="t-btn t-danger t-sm" onClick={() => del(a)}>Delete</button>
        </div>
      ))}
    </div>
  );
};

export default ClassAnnouncements;
