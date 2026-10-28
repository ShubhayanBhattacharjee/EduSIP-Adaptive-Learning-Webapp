import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock, HelpCircle, Sparkles } from "lucide-react";
import quizApi from "../../services/quizApi";
import { OrbitRing, Pips } from "./DashParts";
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
      <div className="lp-grid">
        <div className="lp-card lp-prompt">
          <div className="lp-prompt-text">
            <p className="lp-eyebrow"><HelpCircle size={14} /> Step one</p>
            <h3>Find your starting level</h3>
            <p className="lp-muted">Take the 10-question placement test once. Practice then starts at the right difficulty for you, and your plan appears here.</p>
          </div>
          <button type="button" className="lp-btn lp-btn--lg" onClick={() => navigate("/placement")}>
            Take the test <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  const lv = learning.level || {};
  const sh = learning.startHere;
  const topics = (skills && skills.topics) || [];

  return (
    <div className="lp-grid">
      {/* START HERE */}
      <div className="lp-card lp-start">
        <p className="lp-eyebrow"><Sparkles size={14} /> Start here</p>
        {sh ? (
          <>
            <h3 className="lp-headline">{sh.headline}</h3>
            <p className="lp-muted lp-reason">{sh.reason}</p>
            <div className="lp-meta">
              <span className="lp-chip">{sh.subject}</span>
              <span className="lp-chip">{sh.topic}</span>
              <span className="lp-chip">{sh.questions} questions</span>
              <span className="lp-chip"><Clock size={13} /> about {sh.minutes} min</span>
            </div>
            <button type="button" className="lp-btn lp-btn--lg" onClick={() => go({ ...sh, target_success: sh.targetSuccess })}>
              Start now <ArrowRight size={18} />
            </button>
          </>
        ) : (
          <p className="lp-muted">Practice a topic and your plan will appear here.</p>
        )}
      </div>

      {/* LEVEL */}
      <div className="lp-card lp-level">
        <p className="lp-eyebrow">Your level</p>
        <OrbitRing value={lv.level || 0} max={10} ticks={10} size={170}>
          <span className="lp-big">{lv.level}<small>/10</small></span>
        </OrbitRing>
        <span className={`lp-band lp-band--${String(lv.band || "").toLowerCase()}`}>{lv.band}</span>
        <div className="lp-subjects">
          {(lv.subjects || []).map((s) => (
            <div className="lp-row" key={s.subject}>
              <span className="lp-name">{s.subject}</span>
              <Pips level={s.level} />
              <span className="lp-lv">{s.level}</span>
            </div>
          ))}
        </div>
        {learning.canRetake && (
          <button type="button" className="lp-link" onClick={() => navigate("/placement")}>Retake placement test</button>
        )}
      </div>

      {/* STUDY PLAN */}
      <div className="lp-card lp-plan">
        <div className="lp-plan-head">
          <p className="lp-eyebrow">Today's study plan</p>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutes available today">
            {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min today</option>)}
          </select>
        </div>
        {planError && <p className="lp-muted">{planError}</p>}
        {plan && plan.plan && plan.plan.length === 0 && <p className="lp-muted">{plan.headline}</p>}
        <ol className="lp-steps">
          {plan && plan.plan && plan.plan.map((p, i) => (
            <li className="lp-item" key={`${p.subject}-${p.topic}-${i}`}>
              <span className="lp-step-n">{i + 1}</span>
              <div className="lp-item-body">
                <b>{p.topic}</b>
                <span className="lp-muted">{p.questions} questions · {p.minutes} min</span>
              </div>
              <span className="lp-tag">{actionLabel[p.action] || p.action}</span>
              <button type="button" className="lp-go" onClick={() => go(p)} aria-label={`Start ${p.topic}`}>
                <ArrowRight size={16} />
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* TOPIC LEVELS */}
      <div className="lp-card lp-skills">
        <div className="lp-plan-head">
          <p className="lp-eyebrow">Topic levels</p>
          <span className="lp-muted">Each topic runs from level 1 to 10</span>
        </div>
        {skills === null && <p className="lp-muted">Loading…</p>}
        {skills && topics.length === 0 && <p className="lp-muted">Answer a few questions to see topic levels.</p>}
        <div className="lp-skillgrid">
          {topics.slice(0, 16).map((t) => (
            <div className="lp-skill" key={`${t.subject}-${t.topic}`} title={`${t.subject} / ${t.topic}`}>
              <div className="lp-skill-top">
                <b>{t.topic}</b>
                <span className="lp-lv">{t.level}</span>
              </div>
              <span className="lp-skill-sub">{t.subject}</span>
              <Pips level={t.level} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LearningPanel;