import { useState, useEffect, useRef, useCallback } from 'react';
import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

  // Prohibited items configuration
const PROHIBITED_ITEMS = {
  'cell phone': { type: 'ELECTRONIC', severity: 'HIGH', label: 'Phone' },
  'book': { type: 'MATERIAL', severity: 'MEDIUM', label: 'Book/Notes' },
  'laptop': { type: 'ELECTRONIC', severity: 'HIGH', label: 'Laptop' },
  'notebook': { type: 'MATERIAL', severity: 'MEDIUM', label: 'Notebook' },
  'paper': { type: 'MATERIAL', severity: 'LOW', label: 'Paper' }
};

const useObjectDetection = (isActive = false) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setDetections] = useState([]);
  const [violations, setViolations] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const objectDetectorRef = useRef(null);
  const filesetResolverRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);



  // Initialize MediaPipe Object Detector
  const initializeDetector = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔧 Initializing MediaPipe Object Detector...');
      
      // Initialize FilesetResolver
      filesetResolverRef.current = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );

      // Initialize Object Detector with GPU acceleration
      objectDetectorRef.current = await ObjectDetector.createFromOptions(
        filesetResolverRef.current,
        {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
            delegate: 'GPU'
          },
          scoreThreshold: 0.5, // 50% confidence threshold
          categoryAllowlist: ['cell phone', 'book', 'laptop', 'cup', 'person', 'notebook', 'paper']
        }
      );

      setIsInitialized(true);
      console.log('✅ Object Detector initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Object Detector:', error);
      setError('Failed to initialize object detection. Please refresh and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Detect objects in video frame
  const detectObjects = useCallback(() => {
    if (!objectDetectorRef.current || !videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas dimensions to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      // Create ImageData from video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Run object detection
      const results = objectDetectorRef.current.detect(imageData);
      const detectionResults = results.detections || [];

      // Process detections
      const processedDetections = detectionResults.map(detection => {
        const category = detection.categories[0];
        const boundingBox = detection.boundingBox;
        const isProhibited = PROHIBITED_ITEMS[category.categoryName.toLowerCase()];
        
        return {
          id: `${category.categoryName}-${Date.now()}-${Math.random()}`,
          label: category.categoryName,
          confidence: category.score,
          boundingBox: {
            x: boundingBox.originX * canvas.width,
            y: boundingBox.originY * canvas.height,
            width: boundingBox.width * canvas.width,
            height: boundingBox.height * canvas.height
          },
          isProhibited: !!isProhibited,
          severity: isProhibited?.severity || 'LOW',
          type: isProhibited?.type || 'SAFE',
          displayLabel: isProhibited?.label || category.categoryName
        };
      });

      setDetections(processedDetections);

      // Check for violations
      const newViolations = processedDetections.filter(d => d.isProhibited && d.confidence > 0.6);
      
      if (newViolations.length > 0) {
        const violationEvents = newViolations.map(v => ({
          id: v.id,
          type: v.type,
          label: v.displayLabel,
          confidence: v.confidence,
          timestamp: new Date().toISOString(),
          severity: v.severity
        }));
        
        setViolations(prev => [...prev, ...violationEvents]);
        
        // Log violations to console (in real app, send to backend)
        violationEvents.forEach(violation => {
          console.warn(`🚨 VIOLATION DETECTED: ${violation.label} (${(violation.confidence * 100).toFixed(1)}%)`);
        });
      }

    } catch (error) {
      console.error('❌ Detection error:', error);
    }
  }, [videoRef]);

  // Draw detection overlay
  const drawOverlay = useCallback(() => {
    if (!canvasRef.current || detections.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(detection => {
      const { boundingBox, isProhibited, confidence, displayLabel, severity } = detection;
      
      // Set color based on severity
      let color, lineWidth;
      if (isProhibited) {
        if (severity === 'HIGH') {
          color = '#ef4444'; // Red
          lineWidth = 3;
        } else if (severity === 'MEDIUM') {
          color = '#f59e0b'; // Orange
          lineWidth = 2;
        } else {
          color = '#eab308'; // Yellow
          lineWidth = 2;
        }
      } else {
        color = '#22c55e'; // Green for safe objects
        lineWidth = 1;
      }

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height);

      // Draw label background
      const text = `${displayLabel} (${(confidence * 100).toFixed(1)}%)`;
      ctx.font = '14px Arial';
      const textMetrics = ctx.measureText(text);
      const textHeight = 20;
      
      ctx.fillStyle = color;
      ctx.fillRect(
        boundingBox.x,
        boundingBox.y - textHeight,
        textMetrics.width + 8,
        textHeight
      );

      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, boundingBox.x + 4, boundingBox.y - 6);
    });

    // Continue animation loop
    if (isDetecting) {
      animationFrameRef.current = requestAnimationFrame(drawOverlay);
    }
  }, [detections, isDetecting]);

  // Start detection
  const startDetection = useCallback(() => {
    if (!isInitialized || !videoRef.current) {
      return;
    }

    setIsDetecting(true);
    console.log('🎯 Starting object detection...');

    // Start detection interval (every 500ms as required)
    detectionIntervalRef.current = setInterval(() => {
      detectObjects();
    }, 500);

    // Start overlay rendering
    drawOverlay();
  }, [isInitialized, detectObjects, drawOverlay]);

  // Stop detection
  const stopDetection = useCallback(() => {
    setIsDetecting(false);
    console.log('⏹️ Stopping object detection...');

    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear overlay
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  // Cleanup resources
  const cleanup = useCallback(() => {
    stopDetection();
    
    if (objectDetectorRef.current) {
      try {
        objectDetectorRef.current.close();
      } catch (error) {
        console.log('Error closing object detector:', error);
      }
      objectDetectorRef.current = null;
    }

    if (filesetResolverRef.current) {
      filesetResolverRef.current = null;
    }

    setIsInitialized(false);
    setDetections([]);
    setViolations([]);
  }, [stopDetection]);

  // Auto-initialize when active
  useEffect(() => {
    if (isActive && !isInitialized) {
      initializeDetector();
    }
  }, [isActive, isInitialized, initializeDetector]);

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
    detections,
    violations,
    error,
    isLoading,
    
    // Refs for components
    videoRef,
    canvasRef,
    
    // Actions
    initializeDetector,
    startDetection,
    stopDetection,
    cleanup,
    
    // Configuration
    PROHIBITED_ITEMS,
    
    // Computed values
    hasViolations: violations.length > 0,
    violationCount: violations.length,
    highSeverityViolations: violations.filter(v => v.severity === 'HIGH').length
  };
};

export default useObjectDetection;
