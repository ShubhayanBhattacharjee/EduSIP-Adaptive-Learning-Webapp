import { useState, useEffect, useRef, useCallback } from "react";
import { ObjectDetector, FilesetResolver } from "@mediapipe/tasks-vision";

// The wasm files MUST be the same version as the installed npm package, or the detector fails to start.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite";
// Names come from the COCO label set that this model knows.
const PROHIBITED = {
  "cell phone": { label: "Phone", severity: "HIGH" },
  laptop: { label: "Laptop", severity: "HIGH" },
  book: { label: "Book / notes", severity: "MEDIUM" },
};

const INTERVAL_MS = 300;
const CONFIRM_FRAMES = 2;          // must be seen in 2 checks in a row (~0.6 s)       // must be seen in 3 checks in a row (~1.5 s): a single false positive is ignored
const COOLDOWN_MS = 3000;          // the same violation can be reported again after 3 s
const NO_FACE_AFTER_MS = 10000;    // nobody in front of the camera for 10 s

/**
 * Camera-based checks. onViolation(type, details) receives: "forbidden_object", "multiple_faces", "no_face".
 */
const useObjectDetection = (isActive = false, onViolation) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState([]);
  const [violations, setViolations] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const detectorRef = useRef(null);
  const videoRef = useRef(null);          // the <video> element (set by WebcamStream through onVideoRef)
  const timerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const streakRef = useRef({});           // type -> consecutive checks
  const cooldownRef = useRef({});         // type -> time of last report
  const noPersonSinceRef = useRef(null);
  const onViolationRef = useRef(onViolation);
  const noVideoSinceRef = useRef(null);   // camera not giving frames
  onViolationRef.current = onViolation;

  const initializeDetector = useCallback(async () => {
    if (detectorRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate) => ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        scoreThreshold: 0.35,
        maxResults: 10,
        categoryAllowlist: ["cell phone", "laptop", "book", "person"],
      });
      try { detectorRef.current = await make("GPU"); }
      catch (gpuError) { console.warn("GPU detector failed, using CPU:", gpuError); detectorRef.current = await make("CPU"); }
      setIsInitialized(true);
    } catch (e) {
      console.error("Failed to initialize object detector:", e);
      setError("Camera checks could not start. Please refresh the page.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const report = useCallback((type, details) => {
    const now = Date.now();
    if (now - (cooldownRef.current[type + (details.object || "")] || 0) < COOLDOWN_MS) return;
    cooldownRef.current[type + (details.object || "")] = now;
    setViolations((prev) => [...prev, { id: `${type}-${now}`, type, timestamp: new Date(now).toISOString(), ...details }]);
    if (onViolationRef.current) onViolationRef.current(type, details);
  }, []);

  const confirmed = (key, present) => {
    const s = streakRef.current;
    s[key] = present ? (s[key] || 0) + 1 : 0;
    return s[key] >= CONFIRM_FRAMES;
  };

  const detectOnce = useCallback(() => {
    const detector = detectorRef.current;
    const video = videoRef.current;
    if (!detector) return;
if (!video || video.readyState < 2 || !video.videoWidth) {
  // camera is not delivering frames (blocked, unplugged, permission denied): strike after 10 s
  if (!noVideoSinceRef.current) noVideoSinceRef.current = Date.now();
  else if (Date.now() - noVideoSinceRef.current > NO_FACE_AFTER_MS) {
    noVideoSinceRef.current = Date.now();
    report("no_face", { reason: "camera_unavailable" });
  }
  return;
}
noVideoSinceRef.current = null;
    if (video.currentTime === lastVideoTimeRef.current) return;        // no new frame yet
    lastVideoTimeRef.current = video.currentTime;

    let result;
    try { result = detector.detectForVideo(video, performance.now()); }
    catch (e) { console.error("Detection error:", e); return; }

    const found = (result.detections || []).map((d) => {
      const c = d.categories[0];
      const meta = PROHIBITED[c.categoryName];
      const b = d.boundingBox || {};
      return {
        id: `${c.categoryName}-${Math.round(b.originX || 0)}-${Math.round(b.originY || 0)}`,
        label: c.categoryName, confidence: c.score,
        boundingBox: { x: b.originX, y: b.originY, width: b.width, height: b.height },
        isProhibited: !!meta, severity: meta ? meta.severity : "LOW",
        displayLabel: meta ? meta.label : c.categoryName,
      };
    });
    setDetections(found);

    // 1. prohibited objects (phone, laptop, book)
    Object.keys(PROHIBITED).forEach((name) => {
      const hit = found.find((f) => f.label === name && f.confidence >= 0.45);
      if (confirmed(`obj:${name}`, !!hit)) {
        streakRef.current[`obj:${name}`] = 0;
        report("forbidden_object", { object: name, label: PROHIBITED[name].label, confidence: Number(hit.confidence.toFixed(2)) });
      }
    });

    // 2. more than one person
    const people = found.filter((f) => f.label === "person" && f.confidence >= 0.55).length;
    if (confirmed("people", people >= 2)) {
      streakRef.current.people = 0;
      report("multiple_faces", { people });
    }

    // 3. nobody in front of the camera for a while (not a strike, but it lowers trust)
    if (people === 0) {
      if (!noPersonSinceRef.current) noPersonSinceRef.current = Date.now();
      else if (Date.now() - noPersonSinceRef.current > NO_FACE_AFTER_MS) {
        noPersonSinceRef.current = Date.now();
        report("no_face", {});
      }
    } else {
      noPersonSinceRef.current = null;
    }
  }, [report]);

  const stopDetection = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setIsDetecting(false);
    setDetections([]);
  }, []);

  const startDetection = useCallback(() => {
    if (timerRef.current || !detectorRef.current) return;
    streakRef.current = {};
    noPersonSinceRef.current = null;
    setIsDetecting(true);
    timerRef.current = setInterval(detectOnce, INTERVAL_MS);
  }, [detectOnce]);

  const cleanup = useCallback(() => {
    stopDetection();
    if (detectorRef.current) {
      try { detectorRef.current.close(); } catch (e) { /* ignore */ }
      detectorRef.current = null;
    }
    setIsInitialized(false);
  }, [stopDetection]);

  useEffect(() => { if (isActive && !detectorRef.current) initializeDetector(); }, [isActive, initializeDetector]);

  useEffect(() => {
    if (isActive && isInitialized) startDetection();
    else stopDetection();
  }, [isActive, isInitialized, startDetection, stopDetection]);

  useEffect(() => cleanup, [cleanup]);

  return {
    isInitialized, isDetecting, detections, violations, error, isLoading,
    videoRef, startDetection, stopDetection, cleanup,
    hasViolations: violations.length > 0, violationCount: violations.length,
  };
};

export default useObjectDetection;
