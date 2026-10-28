import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, CheckCircle2, GraduationCap, BookOpen } from "lucide-react";
import { classApi } from "../../services/classService";
import "./AssignedWork.css";

// Work set by the student's teachers. Hidden when there is none.
const AssignedWork = () => {
  const navigate = useNavigate();
  const [list, setList] = useState(null);

  const load = useCallback(() => {
  classApi.myAssignments().then((d) => setList(d.assignments)).catch(() => setList([]));
}, []);
useEffect(() => { load(); }, [load]);

const markRead = async (a) => {
  try {
    await classApi.completeReading(a.id);
    load();
  } catch (e) {
    console.error("Mark as read failed:", e);
    alert(e.message || "Could not mark as read");
  }
};
  if (!list || !list.length) return null;
  const todo = list.filter((a) => !a.done);
  const done = list.filter((a) => a.done);

  const start = (a) =>
    navigate("/quiz", {
      state: { subject: a.subject, topic: a.mode === "level" ? "" : a.topic, mode: a.mode, questions: a.questions, minutes: a.minutes || undefined },
    });

  return (
    <div className="aw-card">
      <div className="aw-head">
        <span className="aw-icon"><GraduationCap size={20} /></span>
        <div>
          <h3>Assigned by your teacher</h3>
          <p className="aw-sub">{todo.length ? `${todo.length} to do` : "You are all caught up."}</p>
        </div>
      </div>

      {!!todo.length && (
        <div className="aw-list">
          {todo.map((a) => (
            <div className={`aw-row ${a.overdue ? "aw-overdue" : ""}`} key={a.id}>
              <div className="aw-body">
  <b>{a.title}</b>
  <p className="aw-sub">
    {a.className} ·{" "}
    {a.kind === "reading"
      ? `${a.subject}${a.topic ? ` / ${a.topic}` : ""} · Theory reading`
      : <>{a.mode === "level" ? `${a.subject} level test` : `${a.subject} / ${a.topic}`} · {a.questions} questions{a.minutes ? ` · ${a.minutes} min` : ""}</>}
  </p>
  {a.kind === "reading" && a.details && <p className="aw-sub">{a.details}</p>}
</div>
{a.dueAt && (
  <span className="aw-due">
    <CalendarClock size={14} /> {new Date(a.dueAt).toLocaleDateString()}{a.overdue ? " · overdue" : ""}
  </span>
)}
{a.kind === "reading" ? (
  <button type="button" onClick={() => markRead(a)}><BookOpen size={16} /> Mark as read</button>
) : (
  <button type="button" onClick={() => start(a)}>Start <ArrowRight size={16} /></button>
)}
            </div>
          ))}
        </div>
      )}

      {!!done.length && (
        <p className="aw-done"><CheckCircle2 size={15} /> Finished: {done.map((a) => a.title).join(", ")}</p>
      )}
    </div>
  );
};

export default AssignedWork;