import { useState, useEffect, useRef, useCallback } from "react";

const SPEECH_BAND = [85, 3000];     // Hz, where human speech sits (ignores fan hum and high hiss)
const START_LEVEL = 0.08;
const STOP_LEVEL = 0.05;
const SUSTAIN_MS = 1000;             // talking for ~1 s counts
const COOLDOWN_MS = 5000;           // one strike per 5 s at mostS = 10000;          // one report per 10 s at most

/**
 * Microphone check. onViolation("audio", details) is called when someone talks for about a second or more.
 */
const useVoiceDetection = (isActive = false, onViolation) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [violations, setViolations] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const loudSinceRef = useRef(null);
  const lastReportRef = useRef(0);
  const speakingRef = useRef(false);
  const runningRef = useRef(false);
  const noiseRef = useRef(null);      // learned background-noise level
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  const loop = useCallback(() => {
    if (!runningRef.current || !analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const hzPerBin = ctxRef.current.sampleRate / analyser.fftSize;
    const from = Math.max(0, Math.floor(SPEECH_BAND[0] / hzPerBin));
    const to = Math.min(data.length - 1, Math.ceil(SPEECH_BAND[1] / hzPerBin));
    let sum = 0;
    for (let i = from; i <= to; i++) sum += data[i];
    const level = sum / (to - from + 1) / 255;
    const now = Date.now();

    if (noiseRef.current === null) noiseRef.current = level;
const floor = noiseRef.current;
const startAt = Math.max(START_LEVEL, floor + 0.06);   // must rise clearly above the room noise
const stopAt = Math.max(STOP_LEVEL, floor + 0.03);
const loud = speakingRef.current ? level > stopAt : level > startAt;
if (!loud) noiseRef.current = floor * 0.98 + level * 0.02;   // keep learning the room noise while quiet
    if (loud) {
      if (!loudSinceRef.current) loudSinceRef.current = now;
      if (!speakingRef.current && now - loudSinceRef.current >= SUSTAIN_MS) {
        speakingRef.current = true;
        setIsSpeaking(true);
        if (now - lastReportRef.current >= COOLDOWN_MS) {
          lastReportRef.current = now;
          const v = { id: `voice-${now}`, type: "audio", label: "Speaking detected", timestamp: new Date(now).toISOString(), severity: "MEDIUM", message: "Speaking detected during quiz" };
          setViolations((prev) => [...prev, v]);
          if (onViolationRef.current) onViolationRef.current("audio", { level: Number(level.toFixed(2)) });
        }
      }
    } else {
      loudSinceRef.current = null;
      if (speakingRef.current) { speakingRef.current = false; setIsSpeaking(false); }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const initializeVAD = useCallback(async () => {
    if (streamRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },   // keep real loudness, do not hide quiet talking
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      streamRef.current = stream; ctxRef.current = ctx; analyserRef.current = analyser; sourceRef.current = source;
      setIsInitialized(true);
    } catch (e) {
      let msg = "Failed to initialize voice detection";
      if (e.name === "NotAllowedError") msg = "Microphone permission denied. Please allow microphone access.";
      else if (e.name === "NotFoundError") msg = "No microphone found. Please connect a microphone.";
      else if (e.name === "NotReadableError") msg = "Microphone is already in use by another application.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);
noiseRef.current = null;
  const stopDetection = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    loudSinceRef.current = null;
    speakingRef.current = false;
    setIsDetecting(false);
    setIsSpeaking(false);
  }, []);

  const startDetection = useCallback(() => {
    if (runningRef.current || !analyserRef.current) return;
    runningRef.current = true;
    setIsDetecting(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const cleanup = useCallback(() => {
    stopDetection();
    try { sourceRef.current && sourceRef.current.disconnect(); } catch (e) { /* ignore */ }
    try { ctxRef.current && ctxRef.current.close(); } catch (e) { /* ignore */ }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    sourceRef.current = ctxRef.current = analyserRef.current = streamRef.current = null;
    setIsInitialized(false);
  }, [stopDetection]);

  useEffect(() => { if (isActive && !streamRef.current) initializeVAD(); }, [isActive, initializeVAD]);

  useEffect(() => {
    if (isActive && isInitialized) startDetection();
    else stopDetection();
  }, [isActive, isInitialized, startDetection, stopDetection]);

  // when the quiz stops, release the microphone (the browser's red recording dot goes away)
  useEffect(() => { if (!isActive) cleanup(); }, [isActive, cleanup]);
  useEffect(() => cleanup, [cleanup]);

  return {
    isInitialized, isDetecting, isSpeaking, violations, error, isLoading,
    initializeVAD, startDetection, stopDetection, cleanup,
    hasViolations: violations.length > 0, violationCount: violations.length, isMicrophoneActive: isDetecting,
  };
};

export default useVoiceDetection;
