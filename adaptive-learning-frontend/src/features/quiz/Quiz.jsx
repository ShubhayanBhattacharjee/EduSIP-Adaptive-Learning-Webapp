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
  const [setVerificationCompleted] = useState(false);
  const [setVerificationSkipped] = useState(false);
  
  // Voice detection is always enabled when quiz starts
  
  // Speaking warning state
  const [speakingWarning, setSpeakingWarning] = useState(null);
  const [setClearSpeakingWarning] = useState(false);

  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [questions, setQuestions] = useState([]);
  const [sessionId, setSessionId] = useState(null);   // the server owns the quiz session
  const [total, setTotal] = useState(10);             // questions in this quiz (the server decides)
  const [hintText, setHintText] = useState("");       // hint text now comes from the server
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
  const [setVerificationData] = useState(null);

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

  const BASE_URL = "http://localhost:5000";

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

  /* ── fetch subjects ── */
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const res = await fetch(`${BASE_URL}/quiz/subjects`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const data = await res.json();
        if (data.success) setSubjects(data.subjects);
      } catch (err) {
        console.error(err);
      }
    };
    fetchSubjects();
  }, []);

  /* ── fetch topics on subject select ── */
  useEffect(() => {
    if (!selectedSubject) return;
    const fetchTopics = async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/quiz/topics?subject=${selectedSubject}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          },
        );
        const data = await res.json();
        if (data.success) {
          setTopics(data.topics);
          setSelectedTopic("");
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchTopics();
  }, [selectedSubject]);

  /* ── start quiz ── */
  const startQuiz = async () => {
    if (!selectedSubject) return alert("Please select a subject");
    if (!selectedTopic) return alert("Please select a topic");
    // Show identity verification modal instead of starting quiz directly
    setShowIdentityVerification(true);
  };

  /* ── start quiz after verification ── */
  const startQuizAfterVerification = async () => {
    setLoadingQuestions(true);
    try {
      const res = await fetch(`${BASE_URL}/quiz/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
                body: JSON.stringify({
          subject: selectedSubject,
          topic: selectedTopic,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSessionId(data.sessionId);
        setTotal(data.total || 10);
        setRemedial(null);
        setQuestions(data.questions);
        setQuizStarted(true);
        if (data.questions.length > 0)
          setDifficulty(data.questions[0].difficulty.toUpperCase());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const currentQ = questions[currentQuestion - 1] || {};

  /* ── handle verification complete ── */
  const handleVerificationComplete = (data) => {
    setVerificationData(data);
    setShowIdentityVerification(false);
    
    // Set webcam state based on verification
    if (data && (data.userPhoto || data.idPhoto)) {
      // User completed camera verification - enable webcam
      setWebcamEnabled(true);
      setVerificationCompleted(true);
      setVerificationSkipped(false);
      console.log('📷 Camera verification completed - webcam enabled');
    } else {
      // User skipped verification - disable webcam
      setWebcamEnabled(false);
      setVerificationCompleted(false);
      setVerificationSkipped(true);
      console.log('⏭️ Verification skipped - webcam disabled');
    }
    
    startQuizAfterVerification();
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
      const q = questions[currentQuestion - 1];
      if (q?.difficulty) setDifficulty(q.difficulty.toUpperCase());
    }
  }, [currentQuestion, questions]);

  useEffect(() => {
    if (!quizStarted || quizCompleted || isTransitioning) return;
    setTimer(0);
    const interval = setInterval(() => setTimer((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [currentQuestion, quizStarted, quizCompleted, isTransitioning]);

  useEffect(() => {
    setSelectedOption(null);
    setShowHint(false);
    setHintText("");
  }, [currentQuestion]);

  /* ── answer / finish ── */
    /* ── hint: the server counts it and sends the text ── */
  const handleHint = async () => {
    if (hintText) {                         // already fetched: just show or hide it
      setShowHint((s) => !s);
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/quiz/hint`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ questionId: currentQ._id, sessionId }),
      });
      const data = await res.json();
      if (data.success) {
        setHintText(data.hint);
        setShowHint(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  /* ── answer / finish ── */
  const handleNextQuestion = async () => {
    if (selectedOption === null || isTransitioning) return;
    setIsTransitioning(true);
    const cq = questions[currentQuestion - 1];

    let data;
    try {
      const res = await fetch(`${BASE_URL}/quiz/answer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionId: cq._id,
          selectedAnswer: selectedOption,
          sessionId,
          hintUsed: !!hintText,
        }),
      });
      data = await res.json();
    } catch (err) {
      console.error(err);
    }

    if (!data || !data.success) {
      alert((data && data.message) || "Could not save your answer. Please try again.");
      setIsTransitioning(false);
      return;
    }
    setRemedial(data.remedial || null);

    // The server picked the next question from this answer: add it and move on.
    if (!data.done && data.nextQuestion) {
      setQuestions((prev) => [...prev, data.nextQuestion]);
      setTimeout(() => {
        setCurrentQuestion((p) => p + 1);
        setIsTransitioning(false);
      }, 300);
      return;
    }

    // The server says the quiz is over: finish it.
    try {
      const res = await fetch(`${BASE_URL}/quiz/finish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          subject: selectedSubject,
          topic: selectedTopic,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setQuizStats(result);
        setQuizReview({
          questions: result.questions,
          responses: result.responses,
        });
        setQuizCompleted(true);
        markProctoringCompleted(); // Mark proctoring as completed
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTransitioning(false);
    }
  };

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
              {selectedSubject && topics.length > 0 && (
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
              {selectedTopic && (
                <button
                  className="start-quiz-btn"
                  onClick={startQuiz}
                  disabled={loadingQuestions}
                >
                  {loadingQuestions
                    ? "Loading…"
                    : `Start ${selectedTopic} Quiz →`}
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
            <div className="timer-circle">{timer}s</div>
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
            <ProgressBar
              progress={(currentQuestion / total) * 100}
            />
            <AnimatePresence mode="wait">
              <QuestionCard
                questionNumber={currentQuestion}
                totalQuestions={total}
                questionText={currentQ.questionText}
                options={currentQ.options}
                hint={hintText}
                showHint={showHint}
                onHint={handleHint}
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
