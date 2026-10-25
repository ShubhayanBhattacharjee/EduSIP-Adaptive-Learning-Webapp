import React from 'react';
import './VoiceDetectionStatus.css';

const VoiceDetectionStatus = ({ 
  isInitialized, 
  isDetecting, 
  isSpeaking, 
  violations, 
  error, 
  isLoading 
}) => {
  const getStatusIcon = () => {
    if (isLoading) return '⏳';
    if (error) return '❌';
    if (!isInitialized) return '🎤';
    if (isSpeaking) return '🔊';
    if (isDetecting) return '🎯';
    return '🔇';
  };

  const getStatusText = () => {
    if (isLoading) return 'Initializing microphone...';
    if (error) return 'Microphone error';
    if (!isInitialized) return 'Voice detection ready';
    if (isSpeaking) return 'Speaking detected!';
    if (isDetecting) return 'Voice monitoring active';
    return 'Voice detection inactive';
  };

  const getStatusColor = () => {
    if (isLoading) return '#f59e0b'; // Orange
    if (error) return '#ef4444'; // Red
    if (!isInitialized) return '#6b7280'; // Gray
    if (isSpeaking) return '#ef4444'; // Red (violation)
    if (isDetecting) return '#22c55e'; // Green
    return '#6b7280'; // Gray
  };

  const violationCount = violations.length;

  return (
    <div className="voice-detection-status">
      <div className="voice-status-indicator">
        <div 
          className="status-dot"
          style={{ backgroundColor: getStatusColor() }}
        ></div>
        <span className="status-text">{getStatusText()}</span>
        <span className="status-icon">{getStatusIcon()}</span>
      </div>
      
      {violationCount > 0 && (
        <div className="voice-violation-summary">
          <span className="violation-count">
            Voice Violations: {violationCount}
          </span>
        </div>
      )}
      
      {error && (
        <div className="voice-error">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
        </div>
      )}
      
      {isSpeaking && (
        <div className="speaking-indicator">
          <div className="speaking-wave"></div>
          <div className="speaking-wave"></div>
          <div className="speaking-wave"></div>
          <span className="speaking-text">Speaking...</span>
        </div>
      )}
    </div>
  );
};

export default VoiceDetectionStatus;
