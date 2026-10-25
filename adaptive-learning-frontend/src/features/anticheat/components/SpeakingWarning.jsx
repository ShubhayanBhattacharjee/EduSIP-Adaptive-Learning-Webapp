import React, { useEffect, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import './SpeakingWarning.css';

const SpeakingWarning = ({ violation, onClear, autoClear = true }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(5);

  useEffect(() => {
    if (violation) {
      setIsVisible(true);
      setTimeRemaining(5);
      
      if (autoClear) {
        const timer = setInterval(() => {
          setTimeRemaining(prev => {
            if (prev <= 1) {
              setIsVisible(false);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        return () => clearInterval(timer);
      }
    } else {
      setIsVisible(false);
    }
  }, [violation, autoClear]);

  const handleClear = () => {
    setIsVisible(false);
    if (onClear) {
      onClear();
    }
  };

  if (!isVisible || !violation) {
    return null;
  }

  const getSeverityColor = () => {
    switch (violation.severity) {
      case 'HIGH': return '#ef4444';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#eab308';
      default: return '#f59e0b';
    }
  };

  const getSeverityText = () => {
    switch (violation.severity) {
      case 'HIGH': return 'High Priority';
      case 'MEDIUM': return 'Medium Priority';
      case 'LOW': return 'Low Priority';
      default: return 'Medium Priority';
    }
  };

  return (
    <div className="speaking-warning-overlay">
      <div className="speaking-warning" style={{ borderLeftColor: getSeverityColor() }}>
        <div className="warning-content">
          <div className="warning-icon">
            <Volume2 size={24} style={{ color: getSeverityColor() }} />
          </div>
          
          <div className="warning-details">
            <div className="warning-header">
              <h4>Speaking Detected</h4>
              <span className="severity-badge" style={{ backgroundColor: getSeverityColor() }}>
                {getSeverityText()}
              </span>
            </div>
            
            <p className="warning-message">
              Voice activity detected during quiz. Speaking is not allowed during examination.
            </p>
            
            <div className="violation-info">
              {violation.duration > 0 ? (
                <span className="duration">Duration: {Math.round(violation.duration / 1000)}s</span>
              ) : (
                <span className="duration">Speaking detected</span>
              )}
              <span className="confidence">Confidence: {Math.round(violation.confidence * 100)}%</span>
            </div>
            
            <div className="warning-timestamp">
              {new Date(violation.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
        
        <div className="warning-actions">
          {autoClear && (
            <div className="auto-clear-timer">
              <span className="timer-text">Auto-clear in {timeRemaining}s</span>
            </div>
          )}
          
          <button className="clear-warning-btn" onClick={handleClear}>
            <X size={16} />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpeakingWarning;
