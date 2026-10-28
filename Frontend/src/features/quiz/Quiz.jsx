import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import QuizComplete from "./QuizComplete";
import IdentityVerification from "../anticheat/components/IdentityVerification";
import ProctoringWarning from "../anticheat/components/ProctoringWarning";
import QuizTerminationModal from "../anticheat/components/QuizTerminationModal";
import WebcamStream from "../anticheat/components/WebcamStream";
import ObjectDetectionOverlay from "../anticheat/components/ObjectDetectionOverlay";
import AudioIndicator from "../anticheat/components/AudioIndicator";
import SpeakingWarning from "../anticheat/components/SpeakingWarning";
import useObjectDetection from "../anticheat/hooks/useObjectDetection";
import useVoiceDetection from "../anticheat/hooks/useVoiceDetection";
import useProctoring from "../anticheat/hooks/useProctoring";
import quizApi from "../../services/quizApi";
import "./Quiz.css";

/* ── subject emoji (kept tiny, just a visual cue) ── */
const SUBJECT_EMOJI = {
  mathematics: "➗", science: "🔬", physics: "⚡", chemistry: "🧪",
  biology: "🧬", history: "🏛️", geography: "🌍", english: "📝",
  computer: "💻", programming: "⌨️", economics: "📊", psychology: "🧠",
};
const emojiFor = (name = "") => {
  const key = String(name).toLowerCase();
  const hit = Object.keys(SUBJECT_EMOJI).find((k) => key.includes(k));
  return hit ? SUBJECT_EMOJI[hit] : "📘";
};

const COUNTS = [5, 10, 15, 20, 30];
const LIMITS = [0, 10, 15, 20, 30, 45, 60];
const LETTERS = ["A", "B", "C", "D", "E", "F"];

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/* ── small reusable pill group ── */
const Pills = ({ items, value, onChange, render }) => (
  <div className="qx-pills">
    {items.map((it) => (
      <button
        key={it}
        type="button"
        className={`qx-pill ${value === it ? "on" : ""}`}
        onClick={() => onChange(it)}
      >
        {render ? render(it) : it}
      </button>
    ))}
  </div>
);

const Quiz = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /* ── setup state ── */
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [mode, setMode] = useState("practice"); // practice | level
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(0);
  const [target, setTarget] = useState(null);
  const [resumeInfo, setResumeInfo] = useState(null);
  const [startError, setStartError] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [showIdentityVerification, setShowIdentityVerification] = useState(false);
  const [verifyFor, setVerifyFor] = useState("start"); // start | resume
  const pendingTopic = useRef("");

  /* ── quiz state ── */
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [total, setTotal] = useState(10);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hints, setHints] = useState([]);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [showHint, setShowHint] = useState(false);
  const [timer, setTimer] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [remedial, setRemedial] = useState(null);
  const [notice, setNotice] = useState("");
  const [quizStats, setQuizStats] = useState({ totalQuestions: 0, correctAnswers: 0, totalTime: 0, accuracy: 0 });
  const [quizReview, setQuizReview] = useState(null);
  const finishing = useRef(false);

  /* ── proctoring ── */
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [speakingWarning, setSpeakingWarning] = useState(null);
  const [showExit, setShowExit] = useState(false);
  const {
    warning: proctoringWarning,
    violationCount: proctoringViolationCount,
    shouldTerminate,
    clearWarning: clearProctoringWarning,
    stopProctoring,
    markQuizCompleted: markProctoringCompleted,
  } = useProctoring(quizStarted && !quizCompleted);

  const {
    detections,
    violations,
    isInitialized: detectionReady,
    isDetecting,
    videoRef: detectionVideoRef,
  } = useObjectDetection(quizStarted && webcamEnabled && !quizCompleted);

  const {
    isInitialized: voiceReady,
    isDetecting: voiceDetecting,
    isSpeaking,
    violations: voiceViolations,
    error: voiceError,
    isLoading: voiceLoading,
  } = useVoiceDetection(quizStarted && !quizCompleted);

  const totalViolationCount = proctoringViolationCount + violations.length + voiceViolations.length;

  useEffect(() => {
    if (voiceViolations.length > 0) {
      const latest = voiceViolations[voiceViolations.length - 1];
      if (!speakingWarning || speakingWarning.id !== latest.id) setSpeakingWarning(latest);
    }
  }, [voiceViolations, speakingWarning]);

  useEffect(() => {
    if (!location.pathname.includes("/quiz") && quizStarted) stopProctoring();
  }, [location.pathname, quizStarted, stopProctoring]);

  useEffect(() => {
    if (quizCompleted) stopProctoring();
  }, [quizCompleted, stopProctoring]);

  /* ── page scrolls inside the shell now, so start each screen / question at the top ── */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [quizStarted, quizCompleted, currentQuestion]);
    /* hide navbar + footer while the test is running */
  useEffect(() => {
    const on = quizStarted && !quizCompleted;
    document.body.classList.toggle("quiz-focus", on);
    return () => document.body.classList.remove("quiz-focus");
  }, [quizStarted, quizCompleted]);
  /* ── guards & initial data ── */
  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  useEffect(() => {
    quizApi.placementStatus()
      .then((d) => { if (!d.placementDone) navigate("/placement", { replace: true }); })
      .catch(() => {});
  }, [navigate]);

  useEffect(() => {
    quizApi.subjects().then((d) => setSubjects(d.subjects || [])).catch(console.error);
    quizApi.active().then((d) => setResumeInfo(d.active || null)).catch(() => {});
  }, []);

  /* ── arrived from "Start here" / study plan ── */
  useEffect(() => {
    const st = location.state;
    if (st && st.subject) {
      pendingTopic.current = st.topic || "";
      if (st.mode === "level" || st.mode === "practice") setMode(st.mode);
      if (st.questions) setCount(Math.min(Math.max(parseInt(st.questions, 10) || 10, 3), 40));
      if (st.minutes) setMinutes(Math.min(Math.max(parseInt(st.minutes, 10) || 0, 0), 240));
      if (st.target) setTarget(Number(st.target));
      setSelectedSubject(st.subject);
    }
  }, [location.state]);

  useEffect(() => {
    if (!selectedSubject) return;
    quizApi.topics(selectedSubject)
      .then((d) => {
        const list = d.topics || [];
        setTopics(list);
        const wanted = pendingTopic.current.toLowerCase();
        const match = wanted ? list.find((t) => t.toLowerCase() === wanted) : null;
        pendingTopic.current = "";
        setSelectedTopic(match || "");
      })
      .catch(console.error);
  }, [selectedSubject]);

  /* ── start / resume ── */
  const readyToStart =
    (mode === "practice" && selectedSubject && selectedTopic) ||
    (mode === "level" && selectedSubject);

  const startQuiz = () => {
    if (!readyToStart) return;
    setStartError("");
    setVerifyFor("start");
    setShowIdentityVerification(true);
  };

  const askResume = () => {
    setVerifyFor("resume");
    setShowIdentityVerification(true);
  };

  const resetQuestionState = () => {
    setHints([]);
    setHintsLeft(3);
    setShowHint(false);
    setSelectedOption(null);
    setFeedback(null);
    setRemedial(null);
    setNotice("");
    finishing.current = false;
  };

  const launchQuiz = async () => {
    setLoadingQuestions(true);
    try {
      const body = { subject: selectedSubject, mode, questions: count };
      if (mode === "practice") body.topic = selectedTopic;
      if (minutes > 0) body.minutes = minutes;
      if (mode === "practice" && target) body.target = target;
      const data = await quizApi.start(body);
      resetQuestionState();
      setSessionId(data.sessionId);
      setTotal(data.total || count);
      setSecondsLeft(data.minutes ? data.minutes * 60 : null);
      setCurrentQuestion(1);
      setQuestions(data.questions);
      setQuizStarted(true);
    } catch (err) {
      if (err.code === "PLACEMENT_REQUIRED") {
        navigate("/placement");
      } else {
        setStartError(err.message || "Could not start the quiz");
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  const resumeQuiz = () => {
    const a = resumeInfo;
    if (!a) return;
    resetQuestionState();
    setMode(a.mode);
    setSelectedSubject(a.subject);
    setSelectedTopic(a.topic || "");
    setSessionId(a.sessionId);
    setTotal(a.total);
    setSecondsLeft(null);
    setHintsLeft(Math.max(0, 3 - (a.hintsUsed || 0)));
    setCurrentQuestion(a.answered + 1);
    setQuestions([a.question]);
    setQuizStarted(true);
    setResumeInfo(null);
  };

  const handleVerificationComplete = (data) => {
    setShowIdentityVerification(false);
    setWebcamEnabled(!!(data && (data.userPhoto || data.idPhoto)));
    if (verifyFor === "resume") resumeQuiz();
    else launchQuiz();
  };

  const currentQ = questions[questions.length - 1] || {};
  const difficulty = (currentQ.difficulty || "").toLowerCase();

  /* ── timers ── */
  useEffect(() => {
    if (!quizStarted || quizCompleted || isTransitioning) return;
    setTimer(0);
    const id = setInterval(() => setTimer((p) => p + 1), 1000);
    return () => clearInterval(id);
  }, [currentQuestion, quizStarted, quizCompleted, isTransitioning]);

  const hasLimit = secondsLeft !== null;
  useEffect(() => {
    if (!quizStarted || quizCompleted || !hasLimit) return;
    const id = setInterval(() => setSecondsLeft((p) => (p === null ? p : Math.max(p - 1, 0))), 1000);
    return () => clearInterval(id);
  }, [quizStarted, quizCompleted, hasLimit]);

  useEffect(() => {
    setSelectedOption(null);
    setShowHint(false);
    setHints([]);
  }, [currentQuestion]);

  /* ── finish ── */
  const finishNow = async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const result = await quizApi.finish({ sessionId, subject: selectedSubject, topic: selectedTopic });
      setQuizStats(result);
      setQuizReview({ questions: result.questions, responses: result.responses });
      setQuizCompleted(true);
      markProctoringCompleted();
    } catch (err) {
      finishing.current = false;
      if (err.status === 400) {
        setNotice("Time is up and no answers were saved.");
        setQuizStarted(false);
        setQuestions([]);
        setSecondsLeft(null);
      } else {
        setNotice(err.message || "Could not finish the quiz. Try again.");
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  useEffect(() => {
    if (quizStarted && !quizCompleted && secondsLeft === 0) finishNow();
    // eslint-disable-next-line
  }, [secondsLeft]);

  /* ── hints ── */
  const fetchHint = async () => {
    try {
      const data = await quizApi.hint({ questionId: currentQ._id, sessionId });
      setHints((prev) => [...prev, data.hint]);
      setHintsLeft(data.hintsLeft);
      setShowHint(true);
    } catch (err) {
      setNotice(err.message || "No more hints for this question");
    }
  };

  const handleHint = () => {
    if (hints.length > 0) return setShowHint((s) => !s);
    if (hintsLeft > 0) fetchHint();
    else setNotice("You have used all hints for this question.");
  };

  /* ── answer ── */
  const handleNext = useCallback(async () => {
    if (selectedOption === null || isTransitioning) return;
    setIsTransitioning(true);
    setNotice("");

    let data;
    try {
      data = await quizApi.answer({
        questionId: currentQ._id,
        selectedAnswer: selectedOption,
        sessionId,
        hintUsed: hints.length > 0,
      });
    } catch (err) {
      setNotice(err.message || "Could not save your answer. Please try again.");
      setIsTransitioning(false);
      return;
    }

    setRemedial(data.remedial || null);
    setFeedback(data.feedback || null);

    if (!data.done && data.nextQuestion) {
      setQuestions((prev) => [...prev, data.nextQuestion]);
      setHintsLeft(3);
      setTimeout(() => {
        setCurrentQuestion(data.answeredCount + 1);
        setIsTransitioning(false);
      }, 300);
      return;
    }
    await finishNow();
    // eslint-disable-next-line
  }, [selectedOption, isTransitioning, currentQ, sessionId, hints]);

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    if (!quizStarted || quizCompleted) return;
    const onKey = (e) => {
      if (isTransitioning || showExit || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const n = currentQ.options?.length || 0;
      const byNum = parseInt(k, 10);
      const byLetter = "abcdef".indexOf(k);
      if (byNum >= 1 && byNum <= n) setSelectedOption(byNum - 1);
      else if (k.length === 1 && byLetter >= 0 && byLetter < n) setSelectedOption(byLetter);
      else if (k === "h") handleHint();
      else if (k === "enter") handleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

    const exitQuiz = () => setShowExit(true);

  const confirmExit = async () => {
    markProctoringCompleted();   // exiting fullscreen is no longer a violation
    stopProctoring();
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (e) { /* ignore */ }
    }
    navigate("/dashboard");
  };

  const restart = () => {
    setQuizStarted(false);
    setQuizCompleted(false);
    setQuestions([]);
    setCurrentQuestion(1);
    setSelectedSubject("");
    setSelectedTopic("");
    setQuizStats({ totalQuestions: 0, correctAnswers: 0, totalTime: 0, accuracy: 0 });
    setQuizReview(null);
    setSessionId(null);
    setSecondsLeft(null);
    setFeedback(null);
    setStartError("");
    quizApi.active().then((d) => setResumeInfo(d.active || null)).catch(() => {});
  };

  /* ================================================================
     SETUP SCREEN
     ================================================================ */
  if (!quizStarted)
    return (
      <>
        <div className="qx qx--setup-page">
          <main className="qx-setup">
            <header className="qx-head">
              <h1>Start a quiz</h1>
              <p>Choose what to practise. The difficulty adapts as you answer.</p>
            </header>

            {resumeInfo && (
              <div className="qx-resume">
                <p>
                  <b>{resumeInfo.topic || resumeInfo.subject}</b> · {resumeInfo.answered}/{resumeInfo.total} answered
                </p>
                <button type="button" className="qx-btn qx-btn--sm" onClick={askResume}>Continue</button>
              </div>
            )}

            {(startError || notice) && <p className="qx-error">{startError || notice}</p>}

            <section className="qx-step">
              <h2><span>1</span> Type</h2>
              <div className="qx-seg">
                <button type="button" className={mode === "practice" ? "on" : ""} onClick={() => setMode("practice")}>
                  Topic practice
                </button>
                <button type="button" className={mode === "level" ? "on" : ""} onClick={() => setMode("level")}>
                  Level test
                </button>
              </div>
              <p className="qx-hint">
                {mode === "practice" ? "Focus on one topic." : "Covers the whole subject to find your level."}
              </p>
            </section>

            <section className="qx-step">
              <h2><span>2</span> Subject</h2>
              <div className="qx-pills">
                {subjects.filter(Boolean).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`qx-pill ${selectedSubject === s ? "on" : ""}`}
                    onClick={() => setSelectedSubject(s)}
                  >
                    <span aria-hidden>{emojiFor(s)}</span> {s}
                  </button>
                ))}
              </div>
            </section>

            {mode === "practice" && selectedSubject && topics.length > 0 && (
              <section className="qx-step">
                <h2><span>3</span> Topic</h2>
                <Pills items={topics} value={selectedTopic} onChange={setSelectedTopic} />
              </section>
            )}

            <section className="qx-step qx-step--row">
              <div>
                <h2>Questions</h2>
                <Pills items={COUNTS} value={count} onChange={setCount} />
              </div>
              <div>
                <h2>Time limit</h2>
                <Pills
                  items={LIMITS}
                  value={minutes}
                  onChange={setMinutes}
                  render={(n) => (n === 0 ? "None" : `${n}m`)}
                />
              </div>
            </section>

            {mode === "practice" && target && (
              <span className="qx-tag">
                {target >= 0.75 ? "Gentle check" : target <= 0.6 ? "Stretch session" : "Normal difficulty"}
                <button type="button" onClick={() => setTarget(null)} aria-label="Use normal difficulty">✕</button>
              </span>
            )}
          </main>

          {/* sticky (not fixed): stays visible while scrolling, never covers the footer */}
          <AnimatePresence>
            {readyToStart && (
              <motion.div
                className="qx-startbar"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
              >
                <div className="qx-startbar-in">
                  <div className="qx-startbar-info">
                    <b>{mode === "level" ? `${selectedSubject} level test` : selectedTopic}</b>
                    <span>{count} questions · {minutes ? `${minutes} min` : "no time limit"}</span>
                  </div>
                  <button type="button" className="qx-btn" onClick={startQuiz} disabled={loadingQuestions}>
                    {loadingQuestions ? "Loading…" : "Start →"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {showIdentityVerification && (
          <IdentityVerification
            onVerificationComplete={handleVerificationComplete}
            onClose={() => setShowIdentityVerification(false)}
          />
        )}
      </>
    );

  /* ================================================================
     RESULT SCREEN
     ================================================================ */
  if (quizCompleted)
    return (
      <div className="qx qx--result-page">
        <main className="qx-result">
          <QuizComplete
            correctAnswers={quizStats.correctAnswers}
            totalQuestions={quizStats.totalQuestions}
            timeTaken={quizStats.totalTime}
            onDashboard={() => navigate("/dashboard")}
            onRestart={restart}
            review={quizReview}
          />
        </main>
      </div>
    );

  /* ================================================================
     ACTIVE QUIZ — focus mode
     ================================================================ */
  const lowTime = hasLimit && secondsLeft <= 60;
  const isLast = currentQuestion >= total;
  const hintList = hints.filter(Boolean);

  return (
    <div className="qx qx--focus">
      <ProctoringWarning warning={proctoringWarning} onClear={clearProctoringWarning} />
      <SpeakingWarning violation={speakingWarning} onClear={() => setSpeakingWarning(null)} autoClear />
      {shouldTerminate && (
        <QuizTerminationModal onGoToDashboard={() => navigate("/dashboard")} violationCount={totalViolationCount} />
      )}

      {/* webcam + object detection (bottom-right, fixed) */}
      {webcamEnabled && (
        <div className="qx-cam">
          <WebcamStream
            isActive={quizStarted && !quizCompleted}
            onVideoRef={(ref) => { detectionVideoRef.current = ref; }}
            onError={(e) => console.error("Webcam error:", e)}
            showControls={false}
          />
          {detectionReady && (
            <ObjectDetectionOverlay detections={detections} isActive={isDetecting} showLabels showConfidence animated />
          )}
        </div>
      )}

      {/* voice indicator (bottom-left, fixed) */}
      <AudioIndicator
        isInitialized={voiceReady}
        isDetecting={voiceDetecting}
        isSpeaking={isSpeaking}
        violations={voiceViolations}
        error={voiceError}
        isLoading={voiceLoading}
      />

      {/* progress bar — sticks just below the navbar */}
            <header className="qx-top">
        <div className="qx-top-row">
          <button type="button" className="qx-exit" onClick={exitQuiz}>← Exit test</button>

          <span className="qx-qlabel">Question <b>{currentQuestion}</b> of {total}</span>

          <div className="qx-top-right">
            {totalViolationCount > 0 && <span className="qx-warn">⚠ {totalViolationCount}/3</span>}
            <span className={`qx-clock ${lowTime ? "low" : ""}`}>
              {hasLimit ? `⏱ ${fmt(secondsLeft)}` : fmt(timer)}
            </span>
          </div>
        </div>

        <div
          className="qx-bar"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={currentQuestion}
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`qx-bar-seg ${i < currentQuestion - 1 ? "done" : i === currentQuestion - 1 ? "now" : ""}`}
            />
          ))}
        </div>
      </header>

      <main className="qx-stage">
        <AnimatePresence mode="wait">
          <motion.section
            key={currentQuestion}
            className="qx-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
          >
            <div className="qx-meta">
              {difficulty && <span className={`qx-diff ${difficulty}`}>{difficulty}</span>}
              {currentQ.level != null && <span>Level {currentQ.level}/10</span>}
            </div>

            {feedback && feedback.message && (
              <p className={`qx-note qx-note--${feedback.direction || "same"}`}>
                {feedback.direction === "harder" ? "↑" : feedback.direction === "easier" ? "↓" : "→"} {feedback.message}
              </p>
            )}
            {remedial && (
              <p className="qx-note qx-note--warn">
                {remedial.reason} Try <b>{remedial.backTo}</b> first.
              </p>
            )}

            <h1 className="qx-question">{currentQ.questionText}</h1>

            <div className="qx-options" role="radiogroup">
              {currentQ.options?.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={selectedOption === i}
                  className={`qx-opt ${selectedOption === i ? "on" : ""}`}
                  onClick={() => !isTransitioning && setSelectedOption(i)}
                  disabled={isTransitioning}
                >
                  <span className="qx-letter">{LETTERS[i]}</span>
                  <span className="qx-opt-text">{opt}</span>
                  <span className="qx-check" aria-hidden="true" />
                </button>
              ))}
            </div>

            {showHint && hintList.length > 0 && (
              <motion.div className="qx-hintbox" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                {hintList.map((h, i) => (
                  <p key={i}>
                    {hintList.length > 1 && <b>Hint {i + 1} · </b>}
                    {h}
                  </p>
                ))}
                {hintsLeft > 0 && (
                  <button type="button" className="qx-link" onClick={fetchHint} disabled={isTransitioning}>
                    More help ({hintsLeft} left)
                  </button>
                )}
              </motion.div>
            )}

            {notice && <p className="qx-error">{notice}</p>}

            <footer className="qx-actions">
              <button type="button" className="qx-ghost" onClick={handleHint} disabled={isTransitioning}>
                💡 {hintList.length ? (showHint ? "Hide hint" : "Show hint") : `Hint (${hintsLeft})`}
              </button>
              <button type="button" className="qx-btn" onClick={handleNext} disabled={selectedOption === null || isTransitioning}>
                {isTransitioning ? "Saving…" : isLast ? "Finish" : "Next →"}
              </button>
            </footer>

            <p className="qx-keys">Press A–D to choose · Enter to continue · H for a hint</p>
          </motion.section>
        </AnimatePresence>
            </main>

      {showExit && (
        <div className="qx-modal" role="dialog" aria-modal="true" aria-labelledby="qx-exit-title">
          <div className="qx-modal-card">
            <h3 id="qx-exit-title">Leave this test?</h3>
            <p>Your progress is saved. You can continue it later from the quiz page.</p>
            <div className="qx-modal-actions">
              <button type="button" className="qx-ghost" onClick={() => setShowExit(false)}>
                Keep going
              </button>
              <button type="button" className="qx-btn qx-btn--danger" onClick={confirmExit}>
                Exit test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Quiz;