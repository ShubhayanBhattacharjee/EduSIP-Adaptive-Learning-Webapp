import API_URL from "../../config";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ExplanationView from "./ExplanationView";
import "./QuizReview.css";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const fmtTime = (s = 0) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const QuizReview = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // all | right | wrong
  const [explanations, setExplanations] = useState({});
  const [loadingExplain, setLoadingExplain] = useState({});
  const [explainError, setExplainError] = useState({});

  /* ================= FETCH QUIZ ================= */
  useEffect(() => {
    let alive = true;
    const fetchQuiz = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/quiz/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const data = await res.json();
        if (!alive) return;
        if (data.success) setQuiz(data.quiz);
        else setError(data.message || "Could not load this quiz.");
      } catch (err) {
        console.error(err);
        if (alive) setError("Could not load this quiz.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchQuiz();
    return () => { alive = false; };
  }, [id]);

  /* ================= AI EXPLANATION ================= */
  const fetchExplanation = async (q) => {
    const key = q.questionId;
    setExplainError((p) => ({ ...p, [key]: "" }));
    setLoadingExplain((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch(`${API_URL}/quiz/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ quizId: id, questionId: key }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setExplainError((p) => ({ ...p, [key]: data.message || "Failed to get explanation." }));
        return;
      }
      setExplanations((p) => ({ ...p, [key]: data.explanation }));
    } catch (err) {
      console.error(err);
      setExplainError((p) => ({ ...p, [key]: "Something went wrong. Please try again." }));
    } finally {
      setLoadingExplain((p) => ({ ...p, [key]: false }));
    }
  };

  /* ================= STATES ================= */
  if (loading) {
    return (
      <div className="qr qr--center">
        <div className="qr-spinner" aria-hidden="true" />
        <p className="qr-muted">Loading quiz…</p>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="qr qr--center">
        <p className="qr-error">{error || "Quiz not found."}</p>
        <button type="button" className="qr-btn qr-btn--primary" onClick={() => navigate("/dashboard")}>
          Back to dashboard
        </button>
      </div>
    );
  }

  /* ================= DATA ================= */
  const items = (quiz.questions || []).map((q, i) => {
    const response = quiz.responses?.find((r) => String(r.questionId) === String(q.questionId));
    const selected = response?.selectedAnswer;
    const isRight =
      typeof response?.isCorrect === "boolean" ? response.isCorrect : selected === q.correctAnswer;
    return { q, i, response, selected, isRight };
  });

  const rightCount = items.filter((it) => it.isRight).length;
  const wrongCount = items.length - rightCount;
  const shown = items.filter((it) =>
    filter === "all" ? true : filter === "right" ? it.isRight : !it.isRight
  );

  const total = quiz.totalQuestions ?? items.length;
  const correct = quiz.correctAnswers ?? rightCount;
  const accuracy = quiz.accuracy ?? (total ? Math.round((correct / total) * 100) : 0);
  const totalTime = quiz.totalTime || 0;
  const tone = accuracy >= 80 ? "great" : accuracy >= 60 ? "good" : accuracy >= 40 ? "fair" : "low";

  /* ================= RENDER ================= */
  return (
    <div className="qr">
      <div className="qr-wrap">
        {/* ── top bar ── */}
        <button type="button" className="qr-back" onClick={() => navigate("/dashboard")}>
          ← Dashboard
        </button>

        {/* ── header ── */}
        <header className={`qr-head qr-${tone}`}>
          <div className="qr-head-text">
            <span className="qr-eyebrow">Quiz review</span>
            <h1>Your answers</h1>
            <p className="qr-muted">
              Go through each question, see the correct answer and ask for an AI explanation.
            </p>
          </div>

          <div className="qr-score">
            <span className="qr-score-num">{accuracy}<small>%</small></span>
            <span className="qr-score-sub">accuracy</span>
          </div>
        </header>

        {/* ── stats ── */}
        <section className="qr-stats">
          <div className="qr-stat">
            <span className="qr-stat-label">Score</span>
            <span className="qr-stat-value">{correct}/{total}</span>
          </div>
          <div className="qr-stat qr-stat--right">
            <span className="qr-stat-label">Correct</span>
            <span className="qr-stat-value">{rightCount}</span>
          </div>
          <div className="qr-stat qr-stat--wrong">
            <span className="qr-stat-label">Incorrect</span>
            <span className="qr-stat-value">{wrongCount}</span>
          </div>
          <div className="qr-stat">
            <span className="qr-stat-label">Time</span>
            <span className="qr-stat-value">{fmtTime(totalTime)}</span>
          </div>
        </section>

        {/* ── filter ── */}
        <div className="qr-tabs" role="tablist">
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

        {/* ── questions ── */}
        <div className="qr-list">
          {shown.length === 0 && <p className="qr-empty">Nothing to show here.</p>}

          {shown.map(({ q, i, response, selected, isRight }) => (
            <article key={q.questionId || i} className={`qr-card ${isRight ? "is-right" : "is-wrong"}`}>
              <header className="qr-card-head">
                <span className="qr-num">Q{i + 1}</span>
                <div className="qr-meta">
                  {q.difficulty && (
                    <span className={`qr-diff ${String(q.difficulty).toLowerCase()}`}>{q.difficulty}</span>
                  )}
                  <span>{response?.timeTaken || 0}s</span>
                  <span className={`qr-status ${isRight ? "ok" : "no"}`}>
                    {isRight ? "Correct" : "Incorrect"}
                  </span>
                </div>
              </header>

              <h3 className="qr-question">{q.questionText}</h3>

              <div className="qr-opts">
                {q.options?.map((opt, idx) => {
                  const isCorrect = idx === q.correctAnswer;
                  const isPicked = idx === selected;
                  let cls = "qr-opt";
                  if (isCorrect) cls += " correct";
                  if (isPicked && !isCorrect) cls += " wrong";
                  return (
                    <div key={idx} className={cls}>
                      <span className="qr-letter">{LETTERS[idx]}</span>
                      <span className="qr-opt-text">{opt}</span>
                      {isPicked && !isCorrect && <span className="qr-tag">Your answer</span>}
                      {isCorrect && <span className="qr-tag">{isPicked ? "Your answer" : "Correct answer"}</span>}
                    </div>
                  );
                })}
              </div>

              {/* AI explanation */}
              {!explanations[q.questionId] && (
                <button
                  type="button"
                  className="qr-explain"
                  onClick={() => fetchExplanation(q)}
                  disabled={loadingExplain[q.questionId]}
                >
                  {loadingExplain[q.questionId] ? "Generating explanation…" : "Get AI explanation"}
                </button>
              )}

              {explainError[q.questionId] && <p className="qr-error">{explainError[q.questionId]}</p>}

              {explanations[q.questionId] && (
                <div className="qr-explanation">
                  <h4>AI explanation</h4>
                  <ExplanationView text={explanations[q.questionId]} />
                </div>
              )}
            </article>
          ))}
        </div>

        <button type="button" className="qr-btn qr-btn--primary qr-bottom" onClick={() => navigate("/dashboard")}>
          Back to dashboard
        </button>
      </div>
    </div>
  );
};

export default QuizReview;