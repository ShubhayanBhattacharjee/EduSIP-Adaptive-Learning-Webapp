import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import "./QuizComplete.css";

const RADIUS = 70;
const CIRC = 2 * Math.PI * RADIUS;
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const fmtTime = (s = 0) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const gradeFor = (pct) => {
  if (pct >= 80) return { tone: "great", label: "Excellent", msg: "Outstanding result. You've mastered this." };
  if (pct >= 60) return { tone: "good", label: "Good job", msg: "Solid performance. Keep building on it." };
  if (pct >= 40) return { tone: "fair", label: "Getting there", msg: "Good effort. A little more practice goes far." };
  return { tone: "low", label: "Keep practising", msg: "Every attempt teaches something. Try again." };
};

const QuizComplete = ({
  correctAnswers = 0,
  totalQuestions = 0,
  timeTaken = 0,
  onRestart,
  onDashboard,
  review,
}) => {
  const rootRef = useRef(null);
  const ringRef = useRef(null);

  const [showReview, setShowReview] = useState(false);
  const [filter, setFilter] = useState("all"); // all | right | wrong
  const [animated, setAnimated] = useState(0);

  const pct = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const wrong = Math.max(totalQuestions - correctAnswers, 0);
  const avg = totalQuestions > 0 ? Math.round(timeTaken / totalQuestions) : 0;
  const grade = gradeFor(pct);

  /* ── entrance + score count-up + ring draw ── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".qc-hero", { y: 24, opacity: 0, duration: 0.6, ease: "power3.out" });
      gsap.from(".qc-stat", { y: 16, opacity: 0, duration: 0.45, stagger: 0.08, delay: 0.3, ease: "power2.out" });

      const obj = { v: 0 };
      gsap.to(obj, {
        v: pct,
        duration: 1.2,
        delay: 0.2,
        ease: "power2.out",
        onUpdate: () => {
          setAnimated(Math.round(obj.v));
          if (ringRef.current) {
            ringRef.current.style.strokeDashoffset = CIRC - (obj.v / 100) * CIRC;
          }
        },
      });
    }, rootRef);
    return () => ctx.revert();
  }, [pct]);

  /* ── review data ── */
  const items = (review?.questions || []).map((q, i) => {
    const r = review?.responses?.find((x) => String(x.questionId) === String(q.questionId));
    const selected = r?.selectedAnswer;
    return {
      q,
      i,
      selected,
      time: r?.timeTaken || 0,
      isRight: selected === q.correctAnswer,
    };
  });
  const rightCount = items.filter((it) => it.isRight).length;
  const wrongCount = items.length - rightCount;
  const shown = items.filter((it) =>
    filter === "all" ? true : filter === "right" ? it.isRight : !it.isRight
  );

  return (
    <div className="qc" ref={rootRef}>
      {/* ───────── HERO ───────── */}
      <section className={`qc-hero qc-${grade.tone}`}>
        <div className="qc-ring">
          <svg viewBox="0 0 168 168" aria-hidden="true">
            <circle className="qc-ring-track" cx="84" cy="84" r={RADIUS} />
            <circle
              ref={ringRef}
              className="qc-ring-fill"
              cx="84"
              cy="84"
              r={RADIUS}
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC}
            />
          </svg>
          <div className="qc-ring-center">
            <span className="qc-pct">{animated}<small>%</small></span>
            <span className="qc-ring-sub">{correctAnswers}/{totalQuestions} correct</span>
          </div>
        </div>

        <div className="qc-summary">
          <span className="qc-badge">{grade.label}</span>
          <h1>Quiz complete</h1>
          <p>{grade.msg}</p>

          <div className="qc-actions">
            <button type="button" className="qc-btn qc-btn--primary" onClick={onDashboard}>
              Go to dashboard
            </button>
            <button type="button" className="qc-btn qc-btn--ghost" onClick={onRestart}>
              Try again
            </button>
          </div>
        </div>
      </section>

      {/* ───────── STATS ───────── */}
      <section className="qc-stats">
        <div className="qc-stat">
          <span className="qc-stat-label">Questions</span>
          <span className="qc-stat-value">{totalQuestions}</span>
        </div>
        <div className="qc-stat qc-stat--right">
          <span className="qc-stat-label">Correct</span>
          <span className="qc-stat-value">{correctAnswers}</span>
        </div>
        <div className="qc-stat qc-stat--wrong">
          <span className="qc-stat-label">Incorrect</span>
          <span className="qc-stat-value">{wrong}</span>
        </div>
        <div className="qc-stat">
          <span className="qc-stat-label">Time</span>
          <span className="qc-stat-value">{fmtTime(timeTaken)}</span>
          <span className="qc-stat-note">{avg}s per question</span>
        </div>
      </section>

      {/* ───────── SOLUTIONS ───────── */}
      <button
        type="button"
        className={`qc-toggle ${showReview ? "open" : ""}`}
        onClick={() => setShowReview((s) => !s)}
        aria-expanded={showReview}
      >
        {showReview ? "Hide solutions" : "View solutions"}
        <svg className="qc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showReview && (
        <section className="qc-review">
          <div className="qc-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={filter === "all"}
              className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
              All <span>{items.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={filter === "right"}
              className={filter === "right" ? "on" : ""} onClick={() => setFilter("right")}>
              Correct <span>{rightCount}</span>
            </button>
            <button type="button" role="tab" aria-selected={filter === "wrong"}
              className={filter === "wrong" ? "on" : ""} onClick={() => setFilter("wrong")}>
              Incorrect <span>{wrongCount}</span>
            </button>
          </div>

          {items.length === 0 && <p className="qc-empty">No review data available.</p>}
          {items.length > 0 && shown.length === 0 && <p className="qc-empty">Nothing to show here.</p>}

          {shown.map(({ q, i, selected, time, isRight }) => (
            <article key={i} className={`qc-q ${isRight ? "is-right" : "is-wrong"}`}>
              <header className="qc-q-head">
                <span className="qc-q-num">Q{i + 1}</span>
                <div className="qc-q-meta">
                  {q.difficulty && (
                    <span className={`qc-diff ${String(q.difficulty).toLowerCase()}`}>{q.difficulty}</span>
                  )}
                  <span className="qc-q-time">{time}s</span>
                  <span className={`qc-q-status ${isRight ? "ok" : "no"}`}>
                    {isRight ? "Correct" : "Incorrect"}
                  </span>
                </div>
              </header>

              <h3 className="qc-q-text">{q.questionText}</h3>

              <div className="qc-opts">
                {q.options?.map((opt, idx) => {
                  const isCorrect = idx === q.correctAnswer;
                  const isPicked = idx === selected;
                  let cls = "qc-opt";
                  if (isCorrect) cls += " correct";
                  if (isPicked && !isCorrect) cls += " wrong";
                  return (
                    <div key={idx} className={cls}>
                      <span className="qc-opt-letter">{LETTERS[idx]}</span>
                      <span className="qc-opt-text">{opt}</span>
                      {isPicked && !isCorrect && <span className="qc-opt-tag">Your answer</span>}
                      {isCorrect && (
                        <span className="qc-opt-tag">{isPicked ? "Your answer" : "Correct answer"}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
};

export default QuizComplete;