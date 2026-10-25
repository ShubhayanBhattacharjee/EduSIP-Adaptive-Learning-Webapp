import API_URL from "../../../config";
import { useState, useEffect, useRef, useCallback } from 'react';

const useVoiceDetection = (isActive = false) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [violations, setViolations] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const speakingStartTimeRef = useRef(null);
  const violationCountRef = useRef(0);

  // Voice detection thresholds
  const SPEAKING_THRESHOLD = 0.2; // Increased from 0.1 to 0.2 (20% of max volume)
  const SILENCE_THRESHOLD = 0.1; // Increased from 0.05 to 0.1 (10% of max volume)

  // Handle speech violation (called immediately when speech starts)
  const handleViolation = useCallback(() => {
    const violation = {
      id: `voice-${Date.now()}-${Math.random()}`,
      type: 'VOICE_ACTIVITY',
      label: 'Speaking Detected',
      confidence: 0.8, // High confidence for immediate detection
      timestamp: new Date().toISOString(),
      severity: 'MEDIUM',
      duration: 0, // Will be updated when speech ends
      message: 'Speaking detected during quiz'
    };
    
    setViolations(prev => [...prev, violation]);
    violationCountRef.current += 1;
    
    console.warn(`🚨 VOICE VIOLATION: Speaking detected immediately`);
    
    // Log to backend immediately
    fetch(`${API_URL}/api/anti-cheat/log-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        eventType: 'VOICE_ACTIVITY_VIOLATION',
        details: {
          violationType: 'VOICE_ACTIVITY',
          message: violation.message
        },
        timestamp: violation.timestamp,
        violationCount: violationCountRef.current
      })
    }).catch(error => {
      console.error('Failed to log voice violation:', error);
    });
  }, []);

  // Analyze audio for speaking
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !isDetecting) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    const normalizedVolume = average / 255; // Normalize to 0-1

    const currentTime = Date.now();
    
    if (normalizedVolume > SPEAKING_THRESHOLD) {
      // Speaking detected
      if (!speakingStartTimeRef.current) {
        speakingStartTimeRef.current = currentTime;
        setIsSpeaking(true);
        console.log('🎤 Speech started');
        
        // Add violation immediately when speech starts (like other monitoring features)
        handleViolation();
      }
    } else if (normalizedVolume < SILENCE_THRESHOLD && speakingStartTimeRef.current) {
      // Silence detected after speaking
      const speakingDuration = currentTime - speakingStartTimeRef.current;
      
      // Optional: Log duration for debugging but don't add another violation
      console.log(`🔇 Speech ended after ${Math.round(speakingDuration / 1000)}s`);
      
      speakingStartTimeRef.current = null;
      setIsSpeaking(false);
    }

    // Continue analysis
    if (isDetecting) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }
  }, [isDetecting, handleViolation]);

  // Initialize voice detection
  const initializeVAD = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🎤 Initializing Voice Activity Detection...');
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      
      streamRef.current = stream;
      
      // Create audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      audioContextRef.current = audioContext;
      
      // Create analyser
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      
      analyserRef.current = analyser;
      
      // Connect microphone to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      microphoneRef.current = source;
      
      setIsInitialized(true);
      console.log('✅ Voice Activity Detection initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize VAD:', error);
      
      let errorMessage = 'Failed to initialize voice detection';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied. Please allow microphone access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is already in use by another application.';
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start voice detection
  const startDetection = useCallback(() => {
    if (!isInitialized) {
      return;
    }
    
    setIsDetecting(true);
    console.log('🎯 Starting voice activity detection...');
    
    // Start audio analysis
    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [isInitialized, analyzeAudio]);

  // Stop voice detection
  const stopDetection = useCallback(() => {
    setIsDetecting(false);
    setIsSpeaking(false);
    console.log('⏹️ Stopping voice activity detection...');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    speakingStartTimeRef.current = null;
  }, []);

  // Cleanup resources
  const cleanup = useCallback(() => {
    stopDetection();
    
    if (microphoneRef.current) {
      try {
        microphoneRef.current.disconnect();
      } catch (error) {
        console.log('Error disconnecting microphone:', error);
      }
      microphoneRef.current = null;
    }
    
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.log('Error closing audio context:', error);
      }
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    setIsInitialized(false);
    setViolations([]);
    violationCountRef.current = 0;
  }, [stopDetection]);

  // Auto-initialize when active
  useEffect(() => {
    if (isActive && !isInitialized) {
      initializeVAD();
    }
  }, [isActive, isInitialized, initializeVAD]);

  // Auto-start/stop detection based on active state
  useEffect(() => {
    if (isActive && isInitialized) {
      startDetection();
    } else {
      stopDetection();
    }
  }, [isActive, isInitialized, startDetection, stopDetection]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    // State
    isInitialized,
    isDetecting,
    isSpeaking,
    violations,
    error,
    isLoading,
    
    // Actions
    initializeVAD,
    startDetection,
    stopDetection,
    cleanup,
    
    // Computed values
    hasViolations: violations.length > 0,
    violationCount: violations.length,
    isMicrophoneActive: isDetecting
  };
};

export default useVoiceDetection;
