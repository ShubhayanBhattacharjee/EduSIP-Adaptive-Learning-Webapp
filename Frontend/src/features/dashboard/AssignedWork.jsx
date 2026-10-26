import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { classApi } from "../../services/classService";
import "./AssignedWork.css";

// Work set by the student's teachers. Hidden when there is none.
const AssignedWork = () => {
  const navigate = useNavigate();
  const [list, setList] = useState(null);

  useEffect(() => {
    classApi.myAssignments().then((d) => setList(d.assignments)).catch(() => setList([]));
  }, []);

  if (!list || !list.length) return null;
  const todo = list.filter((a) => !a.done);
  const done = list.filter((a) => a.done);

  const start = (a) =>
    navigate("/quiz", {
      state: { subject: a.subject, topic: a.mode === "level" ? "" : a.topic, mode: a.mode, questions: a.questions, minutes: a.minutes || undefined },
    });

  return (
    <div className="aw-card">
      <h3>📝 Assigned by your teacher</h3>
      {!todo.length && <p className="aw-sub">You are all caught up.</p>}
      {todo.map((a) => (
        <div className={`aw-row ${a.overdue ? "aw-overdue" : ""}`} key={a.id}>
          <div>
            <b>{a.title}</b>
            <p className="aw-sub">
              {a.className} · {a.mode === "level" ? `${a.subject} level test` : `${a.subject} / ${a.topic}`} · {a.questions} questions{a.minutes ? ` · ${a.minutes} min` : ""}
              {a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleDateString()}${a.overdue ? " (overdue)" : ""}` : ""}
            </p>
          </div>
          <button onClick={() => start(a)}>Start</button>
        </div>
      ))}
      {!!done.length && (
        <p className="aw-sub">Finished: {done.map((a) => a.title).join(", ")}</p>
      )}
    </div>
  );
};

export default AssignedWork;
