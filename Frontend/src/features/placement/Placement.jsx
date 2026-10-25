import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import QuestionCard from "../quiz/QuestionCard";
import ProgressBar from "../quiz/ProgressBar";
import ProctoringWarning from "../anticheat/components/ProctoringWarning";
import useProctoring from "../anticheat/hooks/useProctoring";
import quizApi from "../../services/quizApi";
import "../quiz/Quiz.css";
import "./Placement.css";

const bandClass = (b = "") => `pl-band pl-band--${b.toLowerCase()}`;

const ResultCard = ({ placement, level, onDashboard, onStart, canRetake, onRetake }) => {
  const p = placement || {};
  const lv = level || p;
  return (
    <div className="pl-card">
      <p className="pl-eyebrow">Your starting level</p>
      <div className="pl-level">
        <span className="pl-level-num">{lv.level}</span>
        <span className="pl-level-of">/ 10</span>
      </div>
      <span className={bandClass(lv.band)}>{lv.band}</span>
      {p.correct != null && <p className="pl-sub">{p.correct} of {p.total} correct · confidence {p.confidence || "n/a"}</p>}

      {(p.subjects || []).length > 0 && (
        <div className="pl-subjects">
          {p.subjects.map((s) => (
            <div key={s.subject} className="pl-subject-row">
              <span className="pl-subject-name">{s.subject}</span>
              <div className="pl-bar"><div className="pl-bar-fill" style={{ width: `${s.level * 10}%` }} /></div>
              <span className="pl-subject-lv">{s.level}/10</span>
            </div>
          ))}
        </div>
      )}

      <div className="pl-actions">
        {onStart && <button className="start-quiz-btn" onClick={onStart}>Start here →</button>}
        <button className="pl-ghost" onClick={onDashboard}>Go to dashboard</button>
        {canRetake && <button className="pl-ghost" onClick={onRetake}>Retake the test</button>}
      </div>
    </div>
  );
};

const Placement = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("loading");   // loading | intro | running | calculating | result | blocked
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(0);
  const [total, setTotal] = useState(10);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);       // placement summary

  const { warning, clearWarning, stopProctoring } = useProctoring(phase === "running");

  const load = useCallback(async () => {
    try {
      const s = await quizApi.placementStatus();
      setStatus(s);
      if (s.placementDone && !s.canRetake) { setResult(s); setPhase("result"); }
      else setPhase("intro");
    } catch (e) {
      setError(e.message);
      setPhase("blocked");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const begin = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await quizApi.placementStart();
      setSessionId(r.sessionId);
      setTotal(r.total);
      setAnswered(r.answered);
      setQuestion(r.questions[0]);
      setSelected(null);
      setPhase("running");
    } catch (e) {
      if (e.code === "PLACEMENT_DONE") await load();
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const finishWith = (summary) => {
    stopProctoring();
    setResult(summary);
    setPhase("result");
  };

  const handlePending = (pending) => {
    stopProctoring();
    if (pending.reason === "flagged") {
      setError("This attempt was flagged by the proctoring checks, so no level was saved. You can take the test again.");
      setPhase("blocked");
    } else {
      setPhase("calculating");               // the level service was busy: retry button below
    }
  };

  const submit = async () => {
    if (selected === null || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await quizApi.answer({ questionId: question._id, selectedAnswer: selected, sessionId });
      setAnswered(d.answeredCount);
      if (d.placement) {
        if (d.placement.pending) handlePending(d.placement);
        else finishWith(d.placement);
      } else if (d.nextQuestion) {
        setQuestion(d.nextQuestion);
        setSelected(null);
      } else {
        const f = await quizApi.placementFinish(sessionId);
        finishWith(f);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const retryCalc = async () => {
    setBusy(true);
    setError("");
    try {
      finishWith(await quizApi.placementFinish(sessionId));
    } catch (e) {
      setError(e.status === 503 ? "The level service is still busy. Try again in a minute." : e.message);
    } finally {
      setBusy(false);
    }
  };

  const goStart = () => {
    const s = result && result.startHere;
    navigate("/quiz", { state: s ? { subject: s.subject, topic: s.topic, questions: s.questions, minutes: s.minutes, target: s.targetSuccess } : undefined });
  };

  return (
    <>
      <Navbar />
      <div className="quiz-page">
        <ProctoringWarning warning={warning} onClear={clearWarning} />
        <main className="main-content">
          <div className="quiz-wrapper pl-wrapper">
            {phase === "loading" && <p className="pl-sub">Loading…</p>}

            {phase === "intro" && (
              <div className="pl-card">
                <h1 className="subject-page-title">Placement test</h1>
                <p className="pl-sub">
                  {total} questions, the same for every student. No hints. We use your answers to find your starting level (1 to 10)
                  so practice begins at the right difficulty. Stay on this page until you finish.
                </p>
                {status && status.canRetake && <p className="pl-sub">You can retake it because your last result is more than 90 days old.</p>}
                {error && <p className="pl-error">{error}</p>}
                <div className="pl-actions">
                  <button className="start-quiz-btn" onClick={begin} disabled={busy}>{busy ? "Starting…" : "Start the test →"}</button>
                  <button className="pl-ghost" onClick={() => navigate("/dashboard")}>Not now</button>
                </div>
              </div>
            )}

            {phase === "running" && question && (
              <>
                <ProgressBar progress={((answered + 1) / total) * 100} />
                <QuestionCard
                  questionNumber={answered + 1}
                  totalQuestions={total}
                  questionText={question.questionText}
                  options={question.options}
                  selectedOption={selected}
                  onOptionSelect={setSelected}
                  onNext={submit}
                  isLastQuestion={answered + 1 >= total}
                  hasSelectedOption={selected !== null}
                  isTransitioning={busy}
                  hideHint
                />
                {error && <p className="pl-error">{error}</p>}
              </>
            )}

            {phase === "calculating" && (
              <div className="pl-card">
                <h2>Almost there</h2>
                <p className="pl-sub">Your answers are saved. We are calculating your level.</p>
                {error && <p className="pl-error">{error}</p>}
                <div className="pl-actions">
                  <button className="start-quiz-btn" onClick={retryCalc} disabled={busy}>{busy ? "Working…" : "Get my level"}</button>
                </div>
              </div>
            )}

            {phase === "blocked" && (
              <div className="pl-card">
                <h2>We could not finish the test</h2>
                <p className="pl-error">{error || "Something went wrong."}</p>
                <div className="pl-actions">
                  <button className="start-quiz-btn" onClick={() => { setError(""); load(); }}>Try again</button>
                  <button className="pl-ghost" onClick={() => navigate("/dashboard")}>Go to dashboard</button>
                </div>
              </div>
            )}

            {phase === "result" && result && (
              <ResultCard
                placement={result.placement}
                level={result.level}
                onDashboard={() => navigate("/dashboard")}
                onStart={result.startHere ? goStart : () => navigate("/quiz")}
                canRetake={!!result.canRetake}
                onRetake={() => { setResult(null); setStatus({ canRetake: true }); setPhase("intro"); }}
              />
            )}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
};

export default Placement;
