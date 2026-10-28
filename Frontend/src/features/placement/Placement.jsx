import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import QuestionCard from "../quiz/QuestionCard";
import ProgressBar from "../quiz/ProgressBar";
import ProctoringWarning from "../anticheat/components/ProctoringWarning";
import useProctoring from "../anticheat/hooks/useProctoring";
import quizApi from "../../services/quizApi";
import "./Placement.css";

const RING_R = 64;
const RING_C = 2 * Math.PI * RING_R;

const bandClass = (b = "") => `pl-band pl-band--${String(b).toLowerCase()}`;

/* ───────────────────────── RESULT ───────────────────────── */
const ResultCard = ({ placement, level, onDashboard, onStart, canRetake, onRetake }) => {
  const p = placement || {};
  const lv = level || p;
  const num = Math.min(Math.max(Number(lv.level) || 0, 0), 10);

  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 80);
    return () => clearTimeout(t);
  }, []);

  const offset = drawn ? RING_C * (1 - num / 10) : RING_C;

  return (
    <div className="pl-card">
      <p className="pl-eyebrow">Your starting level</p>

      <div className="pl-ring">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle className="pl-ring-track" cx="80" cy="80" r={RING_R} />
          <circle
            className="pl-ring-fill"
            cx="80"
            cy="80"
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="pl-ring-center">
          <span className="pl-level-num">{lv.level}</span>
          <span className="pl-level-of">out of 10</span>
        </div>
      </div>

      {lv.band && <span className={bandClass(lv.band)}>{lv.band}</span>}

      {p.correct != null && (
        <p className="pl-sub">
          {p.correct} of {p.total} correct · confidence {p.confidence || "n/a"}
        </p>
      )}

      {(p.subjects || []).length > 0 && (
        <div className="pl-subjects">
          {p.subjects.map((s) => (
            <div key={s.subject} className="pl-subject-row">
              <span className="pl-subject-name">{s.subject}</span>
              <div className="pl-bar">
                <div className="pl-bar-fill" style={{ width: drawn ? `${s.level * 10}%` : "0%" }} />
              </div>
              <span className="pl-subject-lv">{s.level}/10</span>
            </div>
          ))}
        </div>
      )}

      <div className="pl-actions">
        {onStart && (
          <button type="button" className="pl-btn pl-btn--primary" onClick={onStart}>
            Start here →
          </button>
        )}
        <button type="button" className="pl-btn pl-btn--ghost" onClick={onDashboard}>
          Go to dashboard
        </button>
        {canRetake && (
          <button type="button" className="pl-btn pl-btn--ghost" onClick={onRetake}>
            Retake the test
          </button>
        )}
      </div>
    </div>
  );
};

/* ───────────────────────── PAGE ───────────────────────── */
const Placement = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("loading"); // loading | intro | running | calculating | result | blocked
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(0);
  const [total, setTotal] = useState(10);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // placement summary
  const [showExit, setShowExit] = useState(false);

  const { warning, clearWarning, stopProctoring, markQuizCompleted } = useProctoring(phase === "running");

  /* hide navbar + footer while the test is running */
  useEffect(() => {
    document.body.classList.toggle("quiz-focus", phase === "running");
    return () => document.body.classList.remove("quiz-focus");
  }, [phase]);

  /* start every screen / question at the top */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [phase, answered]);

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
      setPhase("calculating"); // the level service was busy: retry button below
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
      } else if (d.nextQuestion && d.nextQuestion.questionText && (d.nextQuestion.options || []).length === 4) {
        setQuestion(d.nextQuestion);
        setSelected(null);
        if (d.total) setTotal(d.total);
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
    navigate("/quiz", {
      state: s
        ? { subject: s.subject, topic: s.topic, questions: s.questions, minutes: s.minutes, target: s.targetSuccess }
        : undefined,
    });
  };

  /* ── exit test (leaves fullscreen cleanly, no violation recorded) ── */
  const confirmExit = async () => {
    markQuizCompleted();
    stopProctoring();
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (e) { /* ignore */ }
    }
    navigate("/dashboard");
  };

  /* ── keyboard: A–D / 1–4 to choose, Enter to continue ── */
  useEffect(() => {
    if (phase !== "running" || !question || showExit) return;
    const onKey = (e) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const n = question.options?.length || 0;
      const byNum = parseInt(k, 10);
      const byLetter = "abcdef".indexOf(k);
      if (byNum >= 1 && byNum <= n) setSelected(byNum - 1);
      else if (k.length === 1 && byLetter >= 0 && byLetter < n) setSelected(byLetter);
      else if (k === "enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ───────────────────────── RENDER ───────────────────────── */
  const running = phase === "running" && question && question.questionText;

  return (
    <div className={`pl ${running ? "pl--running" : ""}`}>
      <ProctoringWarning warning={warning} onClear={clearWarning} />

      {/* ── loading ── */}
      {phase === "loading" && (
        <div className="pl-center">
          <div className="pl-spinner" aria-hidden="true" />
          <p className="pl-sub">Loading…</p>
        </div>
      )}

      {/* ── intro ── */}
      {phase === "intro" && (
        <div className="pl-center">
          <div className="pl-card">
            <p className="pl-eyebrow">Placement test</p>
            <h1 className="pl-title">Find your starting level</h1>
            <p className="pl-sub">
              The same questions for every student. Your answers place you on a scale of 1 to 10, so practice
              begins at the right difficulty.
            </p>

            <div className="pl-facts">
              <div><b>{total}</b><span>Questions</span></div>
              <div><b>1–10</b><span>Level scale</span></div>
              <div><b>None</b><span>Hints</span></div>
            </div>

            <ul className="pl-rules">
              <li>Stay on this page until you finish.</li>
              <li>The test runs in fullscreen. Leaving fullscreen or switching tabs is recorded.</li>
              <li>Pick the answer you think is right. Nothing is lost by guessing.</li>
            </ul>

            {status && status.canRetake && (
              <p className="pl-note">You can retake it because your last result is more than 90 days old.</p>
            )}
            {error && <p className="pl-error">{error}</p>}

            <div className="pl-actions">
              <button type="button" className="pl-btn pl-btn--primary" onClick={begin} disabled={busy}>
                {busy ? "Starting…" : "Start the test →"}
              </button>
              <button type="button" className="pl-btn pl-btn--ghost" onClick={() => navigate("/dashboard")}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── question failed to load ── */}
      {phase === "running" && question && !question.questionText && (
        <div className="pl-center">
          <div className="pl-card">
            <p className="pl-error">This question failed to load.</p>
            <div className="pl-actions">
              <button type="button" className="pl-btn pl-btn--primary" onClick={() => setPhase("intro")}>
                Reload test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── running ── */}
      {running && (
        <>
          <header className="pl-top">
            <div className="pl-top-row">
              <button type="button" className="pl-exit" onClick={() => setShowExit(true)}>
                ← Exit test
              </button>
              <span className="pl-top-title">Placement test</span>
              <span />
            </div>
            <ProgressBar current={answered + 1} total={total} />
          </header>

          <main className="pl-stage">
            <QuestionCard
              key={answered}
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
              hideCounter
            />
            {error && <p className="pl-error pl-error--stage">{error}</p>}
            <p className="pl-keys">Press A–D to choose · Enter to continue</p>
          </main>
        </>
      )}

      {/* ── calculating ── */}
      {phase === "calculating" && (
        <div className="pl-center">
          <div className="pl-card">
            <div className="pl-spinner" aria-hidden="true" />
            <h2 className="pl-title pl-title--sm">Almost there</h2>
            <p className="pl-sub">Your answers are saved. We are calculating your level.</p>
            {error && <p className="pl-error">{error}</p>}
            <div className="pl-actions">
              <button type="button" className="pl-btn pl-btn--primary" onClick={retryCalc} disabled={busy}>
                {busy ? "Working…" : "Get my level"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── blocked ── */}
      {phase === "blocked" && (
        <div className="pl-center">
          <div className="pl-card">
            <h2 className="pl-title pl-title--sm">We could not finish the test</h2>
            <p className="pl-error">{error || "Something went wrong."}</p>
            <div className="pl-actions">
              <button type="button" className="pl-btn pl-btn--primary" onClick={() => { setError(""); load(); }}>
                Try again
              </button>
              <button type="button" className="pl-btn pl-btn--ghost" onClick={() => navigate("/dashboard")}>
                Go to dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── result ── */}
      {phase === "result" && result && (
        <div className="pl-center">
          <ResultCard
            placement={result.placement}
            level={result.level}
            onDashboard={() => navigate("/dashboard")}
            onStart={result.startHere ? goStart : () => navigate("/quiz")}
            canRetake={!!result.canRetake}
            onRetake={() => { setResult(null); setStatus({ canRetake: true }); setPhase("intro"); }}
          />
        </div>
      )}

      {/* ── exit dialog ── */}
      {showExit && (
        <div className="pl-modal" role="dialog" aria-modal="true" aria-labelledby="pl-exit-title">
          <div className="pl-modal-card">
            <h3 id="pl-exit-title">Leave the placement test?</h3>
            <p>Your answers so far are saved. You can start the test again later from the dashboard.</p>
            <div className="pl-modal-actions">
              <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setShowExit(false)}>
                Keep going
              </button>
              <button type="button" className="pl-btn pl-btn--danger" onClick={confirmExit}>
                Exit test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Placement;