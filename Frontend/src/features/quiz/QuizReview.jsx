import API_URL from "../../config";
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import "./QuizReview.css";

const QuizReview = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [explanations, setExplanations] = useState({});
  const [loadingExplain, setLoadingExplain] = useState({});

  /* ================= FETCH QUIZ ================= */
  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const res = await fetch(`${API_URL}/quiz/${id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        const data = await res.json();
        if (data.success) setQuiz(data.quiz);
      } catch (err) {
        console.error(err);
      }
    };
    fetchQuiz();
  }, [id]);

  /* ================= AI EXPLANATION ================= */
  const fetchExplanation = async (q) => {
    try {
      setLoadingExplain((prev) => ({ ...prev, [q.questionId]: true }));

      const res = await fetch(`${API_URL}/quiz/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ quizId: id, questionId: q.questionId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.message || "Failed to get explanation");
        return;
      }

      setExplanations((prev) => ({
        ...prev,
        [q.questionId]: data.explanation,
      }));
    } catch (err) {
      console.error(err);
      alert("Something went wrong while fetching explanation");
    } finally {
      setLoadingExplain((prev) => ({ ...prev, [q.questionId]: false }));
    }
  };

  if (!quiz) return <div className="loading">Loading quiz…</div>;

  return (
    <>
      <Navbar />

      <div className="quiz-review-hero-left">
        <div className="quiz-review-container">

          {/* ── HEADER ── */}
          <div className="review-header">
            <h1>Quiz Review</h1>
            <div className="review-summary">
              <span>Score: {quiz.correctAnswers}/{quiz.totalQuestions}</span>
              <span>Accuracy: {quiz.accuracy}%</span>
              <span>Time: {quiz.totalTime}s</span>
            </div>
          </div>

          {/* ── QUESTIONS ── */}
          {quiz.questions.map((q, index) => {
            const response = quiz.responses.find(
              (r) => String(r.questionId) === String(q.questionId)
            );

            return (
              <div key={index} className="review-card glass-card">

                {/* Question header */}
                <div className="question-top">
                  <h3>Q{index + 1}. {q.questionText}</h3>
                  <div className="meta">
                    <span className="time">⏱ {response?.timeTaken || 0}s</span>
                  </div>
                </div>

                {/* Options */}
                <div className="options">
                  {q.options.map((opt, i) => {
                    let cls = "option";
                    if (i === q.correctAnswer) cls += " correct";
                    if (i === response?.selectedAnswer) {
                      cls += response?.isCorrect
                        ? " selected-correct"
                        : " selected-wrong";
                    }

                    return (
                      <div key={i} className={cls}>
                        <span>{opt}</span>
                        <span style={{ display: "flex", gap: 6 }}>
                          {i === response?.selectedAnswer && (
                            <span className="label your-answer">Your Answer</span>
                          )}
                          {i === q.correctAnswer && (
                            <span className="label correct-label">Correct</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* AI explain button */}
                <button
                  className="explain-btn"
                  onClick={() => fetchExplanation(q, response)}
                  disabled={loadingExplain[q.questionId]}
                >
                  🤖 {loadingExplain[q.questionId] ? "Thinking…" : "Get AI Explanation"}
                </button>

                {loadingExplain[q.questionId] && (
                  <p className="loading-text">Generating explanation…</p>
                )}

                {/* Explanation */}
                {explanations[q.questionId] && (
                  <div className="explanation-box">
                    <h4>🤖 AI Explanation</h4>
                    <div className="explanation-text">
                      {explanations[q.questionId]}
                    </div>
                  </div>
                )}

              </div>
            );
          })}

          {/* Back */}
          <button className="back-btn" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </button>

        </div>
      </div>

      <Footer />
    </>
  );
};

export default QuizReview;