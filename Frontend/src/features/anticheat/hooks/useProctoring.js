import API_URL from "../../../config";
import { useState, useEffect, useCallback, useRef } from "react";

export const MAX_STRIKES = 3;
// Events that count toward ending the quiz. The server counts them as well and has the final say.
const STRIKE_TYPES = new Set(["tab_switch", "window_blur", "fullscreen_exit", "multiple_faces", "forbidden_object", "audio", "no_face"]);

const MESSAGES = {
  tab_switch: "⚠️ Tab switching detected!",
  window_blur: "⚠️ You left the quiz window!",
  fullscreen_exit: "⚠️ Fullscreen mode exited! Click anywhere to return.",
  copy_paste: "⚠️ Copy and paste are disabled during the quiz.",
  devtools_attempt: "⚠️ Developer tools are disabled during the quiz.",
  multiple_faces: "⚠️ More than one person detected on camera!",
  forbidden_object: "⚠️ A prohibited object was detected!",
  no_face: "⚠️ Please stay in front of the camera.",
  audio: "⚠️ Speaking detected during the quiz.",
};

/**
 * One place for every proctoring signal (tab, fullscreen, camera, microphone).
 * Usage: useProctoring(isActive, { sessionId, onTerminate })
 * reportViolation(type, details) is also used by the camera and microphone hooks.
 */
const useProctoring = (isActive = false, options = {}) => {
  const [warning, setWarning] = useState(null);
  const [violationCount, setViolationCount] = useState(0);
  const [shouldTerminate, setShouldTerminate] = useState(false);

  // Refs hold the live values, so event handlers never read a stale number.
  const strikesRef = useRef(0);
  const sessionIdRef = useRef(options.sessionId || null);
  const onTerminateRef = useRef(options.onTerminate || null);
  const terminatedRef = useRef(false);
  const completedRef = useRef(false);
  const activeRef = useRef(isActive);
  const warningTimerRef = useRef(null);
  const awayRef = useRef(false);            // one "away" episode = one violation, even if blur + visibilitychange both fire
  const graceUntilRef = useRef(0);          // ignore blur/fullscreen noise caused by the app itself
  const lastSentRef = useRef({});

  sessionIdRef.current = options.sessionId || null;
  onTerminateRef.current = options.onTerminate || null;
  activeRef.current = isActive;

  const clearWarning = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = null;
    setWarning(null);
  }, []);

  const showWarning = useCallback((message) => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    setWarning(message);
    warningTimerRef.current = setTimeout(() => { setWarning(null); warningTimerRef.current = null; }, 4000);
  }, []);

  const terminate = useCallback(() => {
    if (terminatedRef.current) return;
    terminatedRef.current = true;
    setShouldTerminate(true);
    if (onTerminateRef.current) onTerminateRef.current();
  }, []);

  const sendEvent = useCallback(async (eventType, details) => {
    try {
      const res = await fetch(`${API_URL}/api/anti-cheat/log-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          eventType, details, sessionId: sessionIdRef.current || undefined,
          timestamp: new Date().toISOString(), violationCount: strikesRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      // The server counts strikes too: if it says "terminated", we stop even if the local count is lower.
      if (data && data.terminated) terminate();
    } catch (e) {
      console.error("Failed to log anti-cheat event:", e);
    }
  }, [terminate]);

  /** Report one violation. Returns false when it was ignored (not active, finished, or sent too fast). */
  const reportViolation = useCallback((eventType, details = {}) => {
    if (!activeRef.current || completedRef.current || terminatedRef.current) return false;
    const now = Date.now();
    const gap = eventType === "copy_paste" || eventType === "devtools_attempt" ? 2000 : 300;   // no double-counting
    if (now - (lastSentRef.current[eventType] || 0) < gap) return false;
    lastSentRef.current[eventType] = now;

    const counts = STRIKE_TYPES.has(eventType);
    if (counts) {
      strikesRef.current += 1;
      setViolationCount(strikesRef.current);
    }
    showWarning(MESSAGES[eventType] || "⚠️ Suspicious activity detected");
    sendEvent(eventType, { ...details, strike: counts ? strikesRef.current : 0 });
    if (counts && strikesRef.current >= MAX_STRIKES) terminate();
    return true;
  }, [showWarning, sendEvent, terminate]);

  const askFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      graceUntilRef.current = Date.now() + 1500;
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  /* ── main effect: attach every listener while the quiz is active, remove them all when it stops ── */
  useEffect(() => {
    if (!isActive) return undefined;
    completedRef.current = false;
    terminatedRef.current = false;
    strikesRef.current = 0;
    lastSentRef.current = {};
    awayRef.current = false;
    setViolationCount(0);
    setShouldTerminate(false);
    graceUntilRef.current = Date.now() + 3000;     // the camera/mic permission prompts steal focus at the start
    askFullscreen();

    const markAway = (type) => {
      if (awayRef.current) return;                   // already counted this episode
      if (Date.now() < graceUntilRef.current) return;
      awayRef.current = true;
      reportViolation(type, {});
    };
    const onVisibility = () => { if (document.hidden) markAway("tab_switch"); else awayRef.current = false; };
    const onBlur = () => { if (!document.hidden) setTimeout(() => { if (!document.hasFocus()) markAway("window_blur"); }, 50); };
    const onFocus = () => { awayRef.current = false; };

    const onFullscreen = () => {
      if (document.fullscreenElement) return;
      if (completedRef.current || Date.now() < graceUntilRef.current) return;
      reportViolation("fullscreen_exit", {});
      // Browsers only allow fullscreen after a click or key press, so wait for one.
      const back = () => {
        askFullscreen();
        document.removeEventListener("click", back, true);
        document.removeEventListener("keydown", back, true);
      };
      document.addEventListener("click", back, true);
      document.addEventListener("keydown", back, true);
    };

    const block = (e) => e.preventDefault();
    const onContext = (e) => { e.preventDefault(); };
    const onClipboard = (e) => { e.preventDefault(); reportViolation("copy_paste", { action: e.type }); };
    const onKeyDown = (e) => {
      const k = (e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const devtools = k === "f12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (mod && k === "u") || (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k));
      if (devtools) { e.preventDefault(); reportViolation("devtools_attempt", { key: e.key }); return; }
      if (mod && ["c", "v", "x", "a", "s", "p"].includes(k)) {
        const typing = /^(input|textarea)$/i.test(e.target && e.target.tagName);
        if (!typing || ["s", "p"].includes(k)) { e.preventDefault(); if (["c", "v", "x"].includes(k)) reportViolation("copy_paste", { key: k }); }
      }
      if (k === "printscreen") reportViolation("copy_paste", { key: "PrintScreen" });
    };
    const onBeforeUnload = (e) => { if (!completedRef.current) { e.preventDefault(); e.returnValue = ""; } };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onClipboard);
    document.addEventListener("cut", onClipboard);
    document.addEventListener("paste", onClipboard);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onClipboard);
      document.removeEventListener("cut", onClipboard);
      document.removeEventListener("paste", onClipboard);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      completedRef.current = true;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [isActive, reportViolation, askFullscreen]);

    /* ── heartbeat: tell the server every 10 s that proctoring is still running ── */
  useEffect(() => {
    if (!isActive) return undefined;
    const beat = async () => {
      if (completedRef.current || terminatedRef.current || !sessionIdRef.current) return;
      try {
        const res = await fetch(`${API_URL}/api/anti-cheat/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.terminated) terminate();
      } catch (e) { /* offline: the server notices the silence */ }
    };
    beat();
    const id = setInterval(beat, 10000);
    return () => clearInterval(id);
  }, [isActive, terminate]);

  const stopProctoring = useCallback(() => {
    completedRef.current = true;                    // from now on nothing is counted
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    clearWarning();
  }, [clearWarning]);

  const markQuizCompleted = useCallback(() => { completedRef.current = true; }, []);

  return { warning, violationCount, shouldTerminate, clearWarning, stopProctoring, markQuizCompleted, reportViolation, forceTerminate: terminate };
};

export default useProctoring;
