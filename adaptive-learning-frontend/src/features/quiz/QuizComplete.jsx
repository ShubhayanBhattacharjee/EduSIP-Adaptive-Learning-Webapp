import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import "./QuizComplete.css";

const CIRCUMFERENCE = 2 * Math.PI * 65; // r=65 on 148px circle

const QuizComplete = ({
  correctAnswers,
  totalQuestions,
  timeTaken,
  onRestart,
  onDashboard,
  review,
}) => {
  const completionRef = useRef(null);
  const scoreRef      = useRef(null);
  const messageRef    = useRef(null);
  const ringRef       = useRef(null);

  const [showReview, setShowReview]     = useState(false);
  const [animatedScore, setAnimatedScore] = useState(0);

  const percentage =
    totalQuestions > 0
      ? Math.round((correctAnswers / totalQuestions) * 100)
      : 0;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const getMessage = () => {
    if (percentage >= 80) return "Outstanding result. You've mastered this.";
    if (percentage >= 60) return "Solid performance. Keep building on it.";
    if (percentage >= 40) return "Good effort. A little more practice goes far.";
    return "Every attempt teaches something. Try again.";
  };

  /* ── GSAP entrance ── */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(completionRef.current, { y: 24, opacity: 0 });
      gsap.set(scoreRef.current,      { scale: 0.7, opacity: 0 });
      gsap.set(messageRef.current,    { y: 16, opacity: 0 });

      gsap.to(completionRef.current, {
        y: 0, opacity: 1, duration: 0.7, ease: "power3.out",
      });
      gsap.to(scoreRef.current, {
        scale: 1, opacity: 1, duration: 0.6, delay: 0.25,
        ease: "back.out(1.7)",
      });
      gsap.to(messageRef.current, {
        y: 0, opacity: 1, duration: 0.5, delay: 0.5,
      });
    }, completionRef);

    return () => ctx.revert();
  }, []);

  /* ── Animated score counter ── */
  useEffect(() => {
    let start = 0;
    const interval = setInterval(() => {
      start += 1;
      setAnimatedScore(start);
      if (start >= percentage) clearInterval(interval);
    }, 18);
    return () => clearInterval(interval);
  }, [percentage]);

  /* ── SVG ring draw ── */
  useEffect(() => {
    if (!ringRef.current) return;
    const offset = CIRCUMFERENCE - (percentage / 100) * CIRCUMFERENCE;
    // slight delay so animation is visible
    setTimeout(() => {
      if (ringRef.current)
        ringRef.current.style.strokeDashoffset = offset;
    }, 400);
  }, [percentage]);

  return (
    <div className="quiz-complete-container">

      {/* ═══════════════ MAIN CARD ═══════════════ */}
      <div ref={completionRef} className="quiz-complete-card">

        <div className="completion-icon" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>🎉 Quiz Complete</div>

        <h1 style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>Your Results</h1>

        {/* Score ring */}
        <div ref={scoreRef} className="score-circle" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>
          <svg className="score-ring-svg" viewBox="0 0 148 148">
            <circle
              className="score-ring-track"
              cx="74" cy="74" r="65"
            />
            <circle
              ref={ringRef}
              className="score-ring-fill"
              cx="74" cy="74" r="65"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE}
            />
          </svg>
          <div className="score-number">{animatedScore}%</div>
        </div>

        <p ref={messageRef} className="completion-message">
          {getMessage()}
        </p>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-label" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>Questions</span>
            <span className="stat-value" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>{totalQuestions}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>Correct</span>
            <span className="stat-value" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>{correctAnswers}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>Time</span>
            <span className="stat-value" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>{formatTime(timeTaken)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="completion-actions">
          <button onClick={onDashboard} className="dashboard-btn">
            📊 Go to Dashboard
          </button>
          <button onClick={onRestart} className="restart-btn">
            🔄 Try Again
          </button>
          <button
            onClick={() => setShowReview(!showReview)}
            className="review-btn"
          >
            {showReview ? "Hide Solutions" : "📄 View Solutions"}
          </button>
        </div>
      </div>

      {/* ═══════════════ QUIZ REPORT ═══════════════ */}
      {showReview && (
        <div className="quiz-report-container">
          <h2 className="report-title" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>Question Breakdown</h2>

          {!review?.questions?.length && (
            <p style={{ textAlign: "center", color: "var(--subtext-color)", marginTop: 20,fontFamily: "DM Sans, sans-serif"  }} >
              No review data available.
            </p>
          )}

          {review?.questions?.map((q, index) => {
            const response = review?.responses?.find(
              (r) => String(r.questionId) === String(q.questionId)
            );

            const selected = response?.selectedAnswer;
            const correct  = q.correctAnswer;
            const isRight  = selected === correct;

            return (
              <div key={index} className="report-question-card">

                <div className="report-header">
                  <span className="question-number" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}>Q{index + 1}</span>
                  <div className="report-meta">
                    <span className={`difficulty-tag ${q.difficulty?.toLowerCase()}`}>
                      {q.difficulty}
                    </span>
                    <span className="time-taken">
                      ⏱ {response?.timeTaken || 0}s
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: isRight ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {isRight ? "✓" : "✗"}
                    </span>
                  </div>
                </div>

                <h2 className="report-question-text" style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}> {q.questionText}</h2>

                <div className="report-options">
                  {q.options?.map((opt, i) => {
                    const isSelected = i === selected;
                    const isCorrect  = i === correct;
                    let cls = "option-btn";
                    if (isCorrect)              cls += " correct";
                    if (isSelected && !isCorrect) cls += " wrong";

                    return (
                      <div key={i} className={cls}>
                        <span>{opt}</span>
                        {isSelected && !isCorrect && (
                          <span className="option-label">Your answer</span>
                        )}
                        {isCorrect && (
                          <span className="option-label correct-label">Correct</span>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuizComplete;