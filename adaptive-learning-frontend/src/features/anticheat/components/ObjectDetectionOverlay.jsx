import React, { useEffect, useRef, useCallback } from 'react';
import './ObjectDetectionOverlay.css';

const ObjectDetectionOverlay = ({ 
  detections = [], 
  isActive = false,
  showLabels = true,
  showConfidence = true,
  animated = true 
}) => {
  const overlayCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Simple detection status display (no bounding boxes)
  const drawDetectionStatus = useCallback(() => {
    if (!overlayCanvasRef.current || detections.length === 0) {
      return;
    }

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Count violations
    const violationCount = detections.filter(d => d.isProhibited).length;
    
    if (violationCount > 0) {
      // Draw violation indicator
      const text = `⚠️ ${violationCount} Violation${violationCount > 1 ? 's' : ''} Detected`;
      ctx.font = 'bold 16px Arial';
      const textMetrics = ctx.measureText(text);
      const padding = 12;
      const boxWidth = textMetrics.width + (padding * 2);
      const boxHeight = 40;
      const x = (canvas.width - boxWidth) / 2;
      const y = 20;

      // Background
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.fillRect(x, y, boxWidth, boxHeight);

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + padding, y + 26);
    }

    // Continue animation loop if active
    if (isActive && animated) {
      animationFrameRef.current = requestAnimationFrame(drawDetectionStatus);
    }
  }, [detections, isActive, animated]);

  // Start/stop animation based on active state
  useEffect(() => {
    if (isActive) {
      drawDetectionStatus();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, drawDetectionStatus]);

  // Auto-draw when detections change
  useEffect(() => {
    if (isActive && detections.length > 0) {
      drawDetectionStatus();
    }
  }, [detections, isActive, drawDetectionStatus]);

  if (!isActive || detections.length === 0) {
    return null;
  }

  return (
    <div className="object-detection-overlay">
      <canvas
        ref={overlayCanvasRef}
        className="overlay-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 5
        }}
      />
      
      {/* Detection Summary */}
      <div className="detection-summary">
        <div className="summary-item">
          <span className="summary-label">Objects Detected:</span>
          <span className="summary-value">{detections.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Violations:</span>
          <span className="summary-value violation">
            {detections.filter(d => d.isProhibited).length}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ObjectDetectionOverlay;
