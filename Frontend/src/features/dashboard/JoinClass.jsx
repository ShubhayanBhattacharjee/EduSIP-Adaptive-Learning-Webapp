import React, { useCallback, useEffect, useState } from "react";
import { Megaphone, Users } from "lucide-react";
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
      <div className="jc-head">
        <span className="jc-icon"><Users size={20} /></span>
        <div>
          <h3>My classes</h3>
          <p className="jc-sub">Join with a code from your teacher. They can see your progress in classes you join.</p>
        </div>
      </div>

      <form className="jc-form" onSubmit={join}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="JOIN CODE" maxLength={12} aria-label="Join code" />
        <button type="submit">Join class</button>
      </form>
      <label className="jc-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I understand that my teacher can see my answers, levels, progress and proctoring flags in this class. I can leave the class at any time.</span>
      </label>
      {msg && <p className="jc-msg">{msg}</p>}

      {classes.length > 0 && (
        <div className="jc-list">
          {classes.map((c) => (
            <div className="jc-class" key={c.id}>
              <div className="jc-row">
                <span className="jc-name"><b>{c.name}</b><span className="jc-sub">{c.teacher}</span></span>
                <button type="button" onClick={() => leave(c)}>Leave</button>
              </div>
              {(c.announcements || []).map((a) => (
                <p className="jc-note" key={a.id}>
                  <Megaphone size={15} />
                  <span>{a.text} <span className="jc-sub">· {new Date(a.createdAt).toLocaleDateString()}</span></span>
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JoinClass;