import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import QuestionCard from "./QuestionCard";
import ProgressBar from "./ProgressBar";
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
import { AnimatePresence } from "framer-motion";
import quizApi from "../../services/quizApi";
import "./Quiz.css";

/* ── Subject icon colour palettes ── */
const SUBJECT_META = {
  default: { emoji: "📘", bg: "#6366f1", light: "rgba(99,102,241,0.15)" },
  mathematics: { emoji: "➗", bg: "#f59e0b", light: "rgba(245,158,11,0.15)" },
  science: { emoji: "🔬", bg: "#10b981", light: "rgba(16,185,129,0.15)" },
  physics: { emoji: "⚡", bg: "#3b82f6", light: "rgba(59,130,246,0.15)" },
  chemistry: { emoji: "🧪", bg: "#8b5cf6", light: "rgba(139,92,246,0.15)" },
  biology: { emoji: "🧬", bg: "#22c55e", light: "rgba(34,197,94,0.15)" },
  history: { emoji: "🏛️", bg: "#d97706", light: "rgba(217,119,6,0.15)" },
  geography: { emoji: "🌍", bg: "#06b6d4", light: "rgba(6,182,212,0.15)" },
  english: { emoji: "📝", bg: "#ec4899", light: "rgba(236,72,153,0.15)" },
  computer: { emoji: "💻", bg: "#6366f1", light: "rgba(99,102,241,0.15)" },
  programming: { emoji: "⌨️", bg: "#6366f1", light: "rgba(99,102,241,0.15)" },
  economics: { emoji: "📊", bg: "#f97316", light: "rgba(249,115,22,0.15)" },
  psychology: { emoji: "🧠", bg: "#a855f7", light: "rgba(168,85,247,0.15)" },
};

const getSubjectMeta = (name = "") => {
  if (!name || typeof name !== 'string') {
    return SUBJECT_META.default;
  }
  const key = name.toLowerCase();
  for (const k of Object.keys(SUBJECT_META)) {
    if (key.includes(k)) return SUBJECT_META[k];
  }
  return SUBJECT_META.default;
};

const Quiz = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Webcam toggle state (default: disabled, will be set based on verification)
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [, setVerificationCompleted] = useState(false);
  const [, setVerificationSkipped] = useState(false);
  
  // Voice detection is always enabled when quiz starts
  
  // Speaking warning state
  const [speakingWarning, setSpeakingWarning] = useState(null);
  const [, setClearSpeakingWarning] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [questions, setQuestions] = useState([]);
  const [sessionId, setSessionId] = useState(null);   // the server owns the quiz session
  const [total, setTotal] = useState(10);             // questions in this quiz (the server decides)
  const [hints, setHints] = useState([]);              // hint texts for the current question (up to 3, from the server)
  const [hintsLeft, setHintsLeft] = useState(3);
  const [mode, setMode] = useState("practice");        // practice (one topic) | level (whole subject)
  const [count, setCount] = useState(10);              // questions wanted
  const [minutes, setMinutes] = useState(0);           // 0 = no time limit
  const [target, setTarget] = useState(null);          // wanted chance of success, set by the study plan
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [feedback, setFeedback] = useState(null);      // difficulty message after each answer
  const [yourLevel, setYourLevel] = useState(null);
  const [resumeInfo, setResumeInfo] = useState(null);  // an unfinished quiz the student can continue
  const [verifyFor, setVerifyFor] = useState("start"); // what the identity check unlocks: start | resume
  const [startError, setStartError] = useState("");
  const pendingTopic = React.useRef("");
  const finishing = React.useRef(false);
  const [remedial, setRemedial] = useState(null);     // "go back to <topic> first" advice
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [timer, setTimer] = useState(0);
  const [difficulty, setDifficulty] = useState("MEDIUM");
  const [selectedOption, setSelectedOption] = useState(null);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [quizStats, setQuizStats] = useState({
    totalQuestions: 0,
    correctAnswers: 0,
    totalTime: 0,
    accuracy: 0,
  });
  const [quizReview, setQuizReview] = useState(null);
  const [showIdentityVerification, setShowIdentityVerification] = useState(false);
  const [, setVerificationData] = useState(null);

  // Initialize proctoring - active only when quiz is started and not completed
  const { 
    warning: proctoringWarning, 
    violationCount: proctoringViolationCount, 
    shouldTerminate: shouldTerminateProctoring, 
    clearWarning: clearProctoringWarning, 
    stopProctoring, 
    markQuizCompleted: markProctoringCompleted 
  } = useProctoring(
    quizStarted && !quizCompleted
  );

  // Initialize object detection - active only when quiz is started, webcam enabled, and not completed
  const {
    detections,
    violations,
    isInitialized: detectionReady,
    isDetecting,
    videoRef: detectionVideoRef,
    error: detectionError
  } = useObjectDetection(quizStarted && webcamEnabled && !quizCompleted);

  // Initialize voice detection - always active when quiz is started and not completed
  const {
    isInitialized: voiceReady,
    isDetecting: voiceDetecting,
    isSpeaking,
    violations: voiceViolations,
    error: voiceError,
    isLoading: voiceLoading
  } = useVoiceDetection(quizStarted && !quizCompleted);

  // Calculate total violations (proctoring + object detection + voice detection)
  const totalViolationCount = proctoringViolationCount + violations.length + voiceViolations.length;
  const shouldTerminate = shouldTerminateProctoring;

  // Handle speaking warnings
  useEffect(() => {
    if (voiceViolations.length > 0) {
      const latestViolation = voiceViolations[voiceViolations.length - 1];
      // Only show warning if it's a new violation (different from current)
      if (!speakingWarning || speakingWarning.id !== latestViolation.id) {
        setSpeakingWarning(latestViolation);
        setClearSpeakingWarning(false);
      }
    }
    }, [voiceViolations, speakingWarning, setClearSpeakingWarning]);

  const clearSpeakingWarningHandler = () => {
    setClearSpeakingWarning(true);
    setSpeakingWarning(null);
  };

  // Stop proctoring when navigating away from quiz page
  useEffect(() => {
    if (!location.pathname.includes('/quiz') && quizStarted) {
      console.log('User navigated away from quiz page - stopping proctoring');
      stopProctoring();
    }
  }, [location.pathname, quizStarted, stopProctoring]);

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  /* ── fetch subjects, and look for an unfinished quiz ── */
  useEffect(() => {
    quizApi.subjects().then((d) => setSubjects(d.subjects || [])).catch(console.error);
    quizApi.active().then((d) => setResumeInfo(d.active || null)).catch(() => {});
  }, []);

  /* ── arrived from "Start here" or the study plan ── */
  useEffect(() => {
    const st = location.state;
    if (st && st.subject) {
      pendingTopic.current = st.topic || "";
      if (st.questions) setCount(Math.min(Math.max(parseInt(st.questions, 10) || 10, 3), 40));
      if (st.minutes) setMinutes(Math.min(Math.max(parseInt(st.minutes, 10) || 0, 0), 240));
      if (st.target) setTarget(Number(st.target));
      setSelectedSubject(st.subject);
    }
  }, [location.state]);

  /* ── fetch topics on subject select ── */
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

  /* ── start quiz ── */
  const startQuiz = () => {
    if (!selectedSubject) return alert("Please select a subject");
    if (mode === "practice" && !selectedTopic) return alert("Please select a topic");
    setStartError("");
    setVerifyFor("start");
    setShowIdentityVerification(true);
  };

  const resetQuestionState = () => {
    setHints([]);
    setHintsLeft(3);
    setShowHint(false);
    setSelectedOption(null);
    setFeedback(null);
    setRemedial(null);
    finishing.current = false;
  };

  /* ── start the quiz after the identity check ── */
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
      setYourLevel(null);
      setCurrentQuestion(1);
      setQuestions(data.questions);
      setQuizStarted(true);
    } catch (err) {
      if (err.code === "PLACEMENT_REQUIRED") {
        alert(err.message);
        navigate("/placement");
      } else {
        setStartError(err.message || "Could not start the quiz");
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  /* ── continue an unfinished quiz ── */
  const askResume = () => {
    setVerifyFor("resume");
    setShowIdentityVerification(true);
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

  // the question on screen is always the newest one the server sent
  const currentQ = questions[questions.length - 1] || {};

  /* ── handle verification complete ── */
  const handleVerificationComplete = (data) => {
    setVerificationData(data);
    setShowIdentityVerification(false);

    if (data && (data.userPhoto || data.idPhoto)) {
      setWebcamEnabled(true);
      setVerificationCompleted(true);
      setVerificationSkipped(false);
    } else {
      setWebcamEnabled(false);
      setVerificationCompleted(false);
      setVerificationSkipped(true);
    }

    if (verifyFor === "resume") resumeQuiz();
    else launchQuiz();
  };

  /* ── handle verification cancel ── */
  const handleVerificationCancel = () => {
    setShowIdentityVerification(false);
    setVerificationData(null);
  };

  // Stop proctoring when quiz is completed
  useEffect(() => {
    if (quizCompleted) {
      stopProctoring();
    }
  }, [quizCompleted, stopProctoring]);

  useEffect(() => {
    if (questions.length > 0) {
      const q = questions[questions.length - 1];
      if (q?.difficulty) setDifficulty(q.difficulty.toUpperCase());
    }
  }, [questions]);

  // seconds spent on this question
  useEffect(() => {
    if (!quizStarted || quizCompleted || isTransitioning) return;
    setTimer(0);
    const interval = setInterval(() => setTimer((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [currentQuestion, quizStarted, quizCompleted, isTransitioning]);

  // whole-quiz countdown (only when the student chose a time limit)
  const hasLimit = secondsLeft !== null;
  useEffect(() => {
    if (!quizStarted || quizCompleted || !hasLimit) return;
    const interval = setInterval(() => setSecondsLeft((p) => (p === null ? p : Math.max(p - 1, 0))), 1000);
    return () => clearInterval(interval);
  }, [quizStarted, quizCompleted, hasLimit]);

  useEffect(() => {
    setSelectedOption(null);
    setShowHint(false);
    setHints([]);
  }, [currentQuestion]);

  /* ── finish: ask the server for the result of this session ── */
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
      if (err.status === 400) {                  // nothing was answered before the time ran out
        alert("Time is up and no answers were saved.");
        setQuizStarted(false);
        setQuestions([]);
        setSecondsLeft(null);
      } else {
        alert(err.message || "Could not finish the quiz. Try again.");
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  useEffect(() => {
    if (quizStarted && !quizCompleted && secondsLeft === 0) finishNow();
    // eslint-disable-next-line
  }, [secondsLeft]);

  /* ── hint: the server counts it and sends the text (3 levels) ── */
  const fetchHint = async () => {
    try {
      const data = await quizApi.hint({ questionId: currentQ._id, sessionId });
      setHints((prev) => [...prev, data.hint]);
      setHintsLeft(data.hintsLeft);
      setShowHint(true);
    } catch (err) {
      alert(err.message || "No more hints for this question");
    }
  };

  const handleHint = () => {
    if (hints.length > 0) {
      setShowHint((s) => !s);               // already fetched: just show or hide
      return;
    }
    if (hintsLeft > 0) fetchHint();
    else alert("You have used all hints for this question.");
  };

  /* ── answer ── */
  const handleNextQuestion = async () => {
    if (selectedOption === null || isTransitioning) return;
    setIsTransitioning(true);

    let data;
    try {
      data = await quizApi.answer({
        questionId: currentQ._id,
        selectedAnswer: selectedOption,
        sessionId,
        hintUsed: hints.length > 0,
      });
    } catch (err) {
      alert(err.message || "Could not save your answer. Please try again.");
      setIsTransitioning(false);
      return;
    }

    setRemedial(data.remedial || null);
    setFeedback(data.feedback || null);
    if (data.feedback && data.feedback.yourLevel != null) setYourLevel(data.feedback.yourLevel);

    // The server picked the next question from this answer: add it and move on.
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
  };

  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  /* ================================================================
     UI — SUBJECT / TOPIC SELECTION
     ================================================================ */
  if (!quizStarted)
    return (
      <>
        <Navbar />
        <div className="quiz-page">
          <main className="main-content">
            <div className="subject-select-wrapper">
              {/* Page heading */}
              <div>
                <h1
                  className="subject-page-title"
                  style={{ fontFamily: "DM Sans, sans-serif" , fontWeight: "Bold"}}
                >
                  Start a Quiz
                </h1>

                <p className="subject-page-subtitle">
                  Pick a subject, then choose a topic to begin.
                </p>
              </div>
              {resumeInfo && (
                <div className="qz-resume">
                  <span>You have an unfinished {resumeInfo.mode === "level" ? "level test" : "quiz"} in <b>{resumeInfo.topic || resumeInfo.subject}</b> ({resumeInfo.answered} of {resumeInfo.total} answered).</span>
                  <button className="start-quiz-btn" onClick={askResume}>Continue →</button>
                </div>
              )}

              {/* ── What kind of quiz ── */}
              <div className="qz-options">
                <div className="qz-seg">
                  <button className={mode === "practice" ? "on" : ""} onClick={() => setMode("practice")}>Practice a topic</button>
                  <button className={mode === "level" ? "on" : ""} onClick={() => setMode("level")}>Level test (whole subject)</button>
                </div>
                <label className="qz-field">Questions
                  <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                    {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="qz-field">Time limit
                  <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                    <option value={0}>None</option>
                    {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
                  </select>
                </label>
                {mode === "practice" && target && (
                  <span className="qz-chip">{target >= 0.75 ? "Gentle check" : target <= 0.6 ? "Stretch session" : "Normal difficulty"} <button onClick={() => setTarget(null)} title="Use normal difficulty">✕</button></span>
                )}
              </div>
              {startError && <p className="qz-error">{startError}</p>}

              {/* ── Subject icon cards ── */}
              <div>
                <p
                  className="topics-section-heading"
                  style={{ marginBottom: 14 }}
                >
                  Categories
                </p>
                <div className="subject-cards-row">
                  {subjects.filter(Boolean).map((s) => {
                    const meta = getSubjectMeta(s);
                    const isActive = selectedSubject === s;
                    return (
                      <div
                        key={s}
                        className={`subject-icon-card ${isActive ? "active" : ""}`}
                        onClick={() => setSelectedSubject(s)}
                      >
                        <div
                          className="subject-icon-bg"
                          style={{ background: meta.light }}
                        >
                          <span style={{ fontSize: 28 }}>{meta.emoji}</span>
                        </div>
                        <span className="subject-card-label">{s}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Topics grid ── */}
              {mode === "practice" && selectedSubject && topics.length > 0 && (
                <div className="topics-section">
                  <p className="topics-section-heading">{selectedSubject}</p>
                  <div className="topics-grid">
                    {topics.map((t) => (
                      <div
                        key={t}
                        className={`topic-card ${selectedTopic === t ? "selected" : ""}`}
                        onClick={() => setSelectedTopic(t)}
                      >
                        <span
                          className="topic-card-title"
                          style={
                            selectedTopic === t
                              ? { color: "var(--accent)" }
                              : {}
                          }
                        >
                          {t}
                        </span>
                        <span className="topic-card-sub">
                          {selectedTopic === t ? "Selected ✓" : "Tap to select"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Start button ── */}
              {((mode === "practice" && selectedTopic) || (mode === "level" && selectedSubject)) && (
                <button
                  className="start-quiz-btn"
                  onClick={startQuiz}
                  disabled={loadingQuestions}
                >
                  {loadingQuestions
                    ? "Loading…"
                    : mode === "level" ? `Start ${selectedSubject} level test →` : `Start ${selectedTopic} Quiz →`}
                </button>
              )}
            </div>
          </main>
        </div>
        <Footer />
        
        {/* Identity Verification Modal */}
        {showIdentityVerification && (
          <IdentityVerification
            onVerificationComplete={handleVerificationComplete}
            onClose={handleVerificationCancel}
          />
        )}
      </>
    );

  /* ── Quiz Complete ── */
  if (quizCompleted) {
    return (
      <>
        <Navbar />
        <div className="quiz-page">
          <main className="main-content">
            <QuizComplete
              correctAnswers={quizStats.correctAnswers}
              totalQuestions={quizStats.totalQuestions}
              timeTaken={quizStats.totalTime}
              onDashboard={() => navigate("/dashboard")}
              onRestart={() => {
                setQuizStarted(false);
                setQuizCompleted(false);
                setQuestions([]);
                setCurrentQuestion(1);
                setSelectedSubject("");
                setSelectedTopic("");
                setQuizStats({
                  totalQuestions: 0,
                  correctAnswers: 0,
                  totalTime: 0,
                  accuracy: 0,
                });
                setQuizReview(null);
                setSessionId(null);
                setSecondsLeft(null);
                setFeedback(null);
                setYourLevel(null);
                setStartError("");
                quizApi.active().then((d) => setResumeInfo(d.active || null)).catch(() => {});
              }}
              review={quizReview}
            />
          </main>
        </div>
        <Footer />
      </>
    );
  }

  /* ── Quiz Active ── */
  return (
    <>
      <Navbar />
      <div className="quiz-page">
        {/* Proctoring Warning */}
        <ProctoringWarning warning={proctoringWarning} onClear={clearProctoringWarning} />
        
        {/* Speaking Warning */}
        <SpeakingWarning 
          violation={speakingWarning} 
          onClear={clearSpeakingWarningHandler}
          autoClear={true}
        />
        
        {/* Quiz Termination Modal */}
        {shouldTerminate && (
          <QuizTerminationModal
            onGoToDashboard={() => navigate("/dashboard")}
            violationCount={totalViolationCount}
          />
        )}
        
        {/* Webcam Stream with Object Detection - Right side */}
        {webcamEnabled && (
          <div className="webcam-proctoring-container">
            <WebcamStream
              isActive={quizStarted && !quizCompleted}
              onVideoRef={(ref) => { detectionVideoRef.current = ref; }}
              onError={(error) => console.error('Webcam error:', error)}
              showControls={false}
            />
            
            {/* Object Detection Overlay */}
            {detectionReady && (
              <ObjectDetectionOverlay
                detections={detections}
                isActive={isDetecting}
                showLabels={true}
                showConfidence={true}
                animated={true}
              />
            )}
            
            {/* Object Detection Status - Below video feed */}
            {quizStarted && !quizCompleted && detectionReady && (
              <div className="object-detection-status">
                <div className="status-header">
                  <span className="status-title">Object Detection</span>
                  <div className={`status-indicator ${isDetecting ? 'active' : 'inactive'}`}></div>
                </div>
                <div className="detection-summary">
                  <span>Objects: {detections.length}</span>
                  {violations.length > 0 && (
                    <span className="violation-count">Violations: {violations.length}</span>
                  )}
                </div>
                {detectionError && (
                  <div className="detection-error">
                    ⚠️ Detection Error: {detectionError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Combined Voice Monitoring - Left side */}
        {quizStarted && !quizCompleted && (
          <div className="combined-voice-monitoring">
            {/* Audio Indicator */}
            <AudioIndicator
              isInitialized={voiceReady}
              isDetecting={voiceDetecting}
              isSpeaking={isSpeaking}
              violations={voiceViolations}
              error={voiceError}
              isLoading={voiceLoading}
            />
          </div>
        )}
        
        <nav className="quiz-nav">
          <div className="quiz-nav-left">
            <span className={`difficulty ${difficulty.toLowerCase()}`}>
              {difficulty}
            </span>
            {currentQ.level != null && <span className="qz-level">Question level {currentQ.level}/10</span>}
            {yourLevel != null && <span className="qz-level">You: {yourLevel}/10</span>}
            <div className="timer-circle">{timer}s</div>
            {hasLimit && <span className={`qz-level ${secondsLeft <= 60 ? "qz-low" : ""}`}>⏱ {fmt(secondsLeft)} left</span>}
            {totalViolationCount > 0 && (
              <span className="violation-count">
                Warnings: {totalViolationCount}/3
              </span>
            )}
          </div>
          
          {/* Webcam Toggle */}
          <div className="webcam-toggle">
            <label className="toggle-label">
              <span className="toggle-text">📷 Webcam</span>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  checked={webcamEnabled}
                  onChange={(e) => setWebcamEnabled(e.target.checked)}
                  disabled={quizStarted}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            {quizStarted && (
              <span className="toggle-hint">
                {webcamEnabled ? 'Webcam monitoring active' : 'Webcam monitoring disabled'}
              </span>
            )}
          </div>
        </nav>
        <main className="main-content">
          <div className="quiz-wrapper">
            {remedial && (
              <div style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.15)", color: "inherit" }}>
                💡 {remedial.reason} Try <b>{remedial.backTo}</b> first.
              </div>
            )}
            {feedback && feedback.message && (
              <div className={`qz-feedback qz-feedback--${feedback.direction || "same"}`}>
                {feedback.direction === "harder" ? "⬆️" : feedback.direction === "easier" ? "⬇️" : "➡️"} {feedback.message}
              </div>
            )}
            <ProgressBar
              progress={(currentQuestion / total) * 100}
            />
            <AnimatePresence mode="wait">
              <QuestionCard
                questionNumber={currentQuestion}
                totalQuestions={total}
                questionText={currentQ.questionText}
                options={currentQ.options}
                hints={hints}
                hintsLeft={hintsLeft}
                showHint={showHint}
                onHint={handleHint}
                onMoreHint={fetchHint}
                selectedOption={selectedOption}
                onOptionSelect={setSelectedOption}
                onNext={handleNextQuestion}
                isLastQuestion={currentQuestion >= total}
                hasSelectedOption={selectedOption !== null}
                isTransitioning={isTransitioning}
              />
            </AnimatePresence>
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
};

export default Quiz;
