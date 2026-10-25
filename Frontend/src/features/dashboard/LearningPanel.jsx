import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import quizApi from "../../services/quizApi";
import "./LearningPanel.css";

const actionLabel = {
  remediate: "Rebuild basics", review: "Quick review", stretch: "Stretch", diagnose: "Short check",
  practice_weak: "Practice", practice: "Practice", maintain: "Keep sharp",
};

// "Where am I and what next": placement prompt, level, start-here card, today's plan, topic levels.
const LearningPanel = ({ learning }) => {
  const navigate = useNavigate();
  const [minutes, setMinutes] = useState(30);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [skills, setSkills] = useState(null);

  const placed = !!(learning && learning.placementDone);

  useEffect(() => {
    if (!placed) return;
    setPlanError("");
    quizApi.studyPlan(minutes)
      .then((d) => setPlan(d.plan))
      .catch((e) => { setPlan(null); setPlanError(e.status === 503 ? "The study planner is offline right now." : e.message); });
  }, [placed, minutes]);

  useEffect(() => {
    if (!placed) return;
    quizApi.mySkills().then(setSkills).catch(() => setSkills(null));
  }, [placed]);

  const go = (item) =>
    navigate("/quiz", {
      state: { subject: item.subject, topic: item.topic, questions: item.questions, minutes: item.minutes, target: item.target_success ?? item.targetSuccess },
    });

  if (!learning) return null;

  if (!placed) {
    return (
      <div className="lp-card lp-prompt">
        <div>
          <h3>Find your starting level</h3>
          <p>Take the 10-question placement test once. Practice then starts at the right difficulty for you.</p>
        </div>
        <button className="lp-btn" onClick={() => navigate("/placement")}>Take the test →</button>
      </div>
    );
  }

  const lv = learning.level || {};
  const sh = learning.startHere;
  const topics = (skills && skills.topics) || [];

  return (
    <div className="lp-grid">
      <div className="lp-card lp-level">
        <p className="lp-eyebrow">Your level</p>
        <div className="lp-big">{lv.level}<span>/10</span></div>
        <span className={`lp-band lp-band--${String(lv.band || "").toLowerCase()}`}>{lv.band}</span>
        {(lv.subjects || []).map((s) => (
          <div className="lp-row" key={s.subject}>
            <span className="lp-name">{s.subject}</span>
            <div className="lp-bar"><div style={{ width: `${s.level * 10}%` }} /></div>
            <span className="lp-lv">{s.level}</span>
          </div>
        ))}
        {learning.canRetake && <button className="lp-link" onClick={() => navigate("/placement")}>Retake placement test</button>}
      </div>

      <div className="lp-card lp-start">
        <p className="lp-eyebrow">Start here</p>
        {sh ? (
          <>
            <h3>{sh.headline}</h3>
            <p className="lp-muted">{sh.reason}</p>
            <p className="lp-meta">{sh.subject} · {sh.topic} · {sh.questions} questions · about {sh.minutes} min</p>
            <button className="lp-btn" onClick={() => go({ ...sh, target_success: sh.targetSuccess })}>Start →</button>
          </>
        ) : (
          <p className="lp-muted">Practice a topic and your plan will appear here.</p>
        )}
      </div>

      <div className="lp-card lp-plan">
        <div className="lp-plan-head">
          <p className="lp-eyebrow">Study plan</p>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min today</option>)}
          </select>
        </div>
        {planError && <p className="lp-muted">{planError}</p>}
        {plan && plan.plan && plan.plan.length === 0 && <p className="lp-muted">{plan.headline}</p>}
        {plan && plan.plan && plan.plan.map((p, i) => (
          <div className="lp-item" key={`${p.subject}-${p.topic}-${i}`}>
            <div>
              <b>{p.topic}</b> <span className="lp-tag">{actionLabel[p.action] || p.action}</span>
              <p className="lp-muted">{p.questions} questions · {p.minutes} min</p>
            </div>
            <button className="lp-ghost" onClick={() => go(p)}>Go</button>
          </div>
        ))}
      </div>

      <div className="lp-card lp-skills">
        <p className="lp-eyebrow">Topic levels</p>
        {skills === null && <p className="lp-muted">Loading…</p>}
        {skills && topics.length === 0 && <p className="lp-muted">Answer a few questions to see topic levels.</p>}
        {topics.slice(0, 12).map((t) => (
          <div className="lp-row" key={`${t.subject}-${t.topic}`}>
            <span className="lp-name" title={`${t.subject} / ${t.topic}`}>{t.topic}</span>
            <div className="lp-bar"><div style={{ width: `${t.level * 10}%` }} /></div>
            <span className="lp-lv">{t.level}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LearningPanel;
