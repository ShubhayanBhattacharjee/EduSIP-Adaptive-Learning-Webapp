import React, { useCallback, useEffect, useState } from "react";
import { classApi } from "../../services/classService";
import "./JoinClass.css";

const JoinClass = () => {
  const [classes, setClasses] = useState([]);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [consent, setConsent] = useState(false);

  const load = useCallback(() => {
    classApi.mine().then((d) => setClasses(d.classes)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const join = async (e) => {
    e.preventDefault();
    if (!consent) { setMsg("Please tick the box to confirm your teacher may see your progress."); return; }
    try {
      const d = await classApi.join(code, true);
      setMsg(`Joined ${d.class.name} ✅`);
      setCode("");
      setConsent(false);
      load();
    } catch (err) { setMsg(err.message); }
  };

  const leave = async (c) => {
    if (!window.confirm(`Leave ${c.name}?`)) return;
    await classApi.leave(c.id).catch(() => {});
    load();
  };

  return (
    <div className="jc-card">
      <h3>My classes</h3>
      <p className="jc-sub">Your teacher can see your progress in classes you join.</p>
      <form className="jc-form" onSubmit={join}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter join code" maxLength={12} />
        <button type="submit">Join</button>
      </form>
      <label className="jc-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        I understand that my teacher can see my answers, levels, progress and proctoring flags in this class. I can leave the class at any time.
      </label>
      {msg && <p className="jc-sub">{msg}</p>}
      {classes.map((c) => (
        <div key={c.id}>
          <div className="jc-row">
            <span><b>{c.name}</b> · {c.teacher}</span>
            <button onClick={() => leave(c)}>Leave</button>
          </div>
          {(c.announcements || []).map((a) => (
            <p className="jc-note" key={a.id}>📣 {a.text} <span className="jc-sub">· {new Date(a.createdAt).toLocaleDateString()}</span></p>
          ))}
        </div>
      ))}
    </div>
  );
};

export default JoinClass;