import React, { useCallback, useEffect, useState } from "react";
import { classApi } from "../../services/classService";
import "./JoinClass.css";

const JoinClass = () => {
  const [classes, setClasses] = useState([]);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    classApi.mine().then((d) => setClasses(d.classes)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const join = async (e) => {
    e.preventDefault();
    try {
      const d = await classApi.join(code);
      setMsg(`Joined ${d.class.name} ✅`);
      setCode("");
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
      {msg && <p className="jc-sub">{msg}</p>}
      {classes.map((c) => (
        <div className="jc-row" key={c.id}>
          <span><b>{c.name}</b> · {c.teacher}</span>
          <button onClick={() => leave(c)}>Leave</button>
        </div>
      ))}
    </div>
  );
};

export default JoinClass;