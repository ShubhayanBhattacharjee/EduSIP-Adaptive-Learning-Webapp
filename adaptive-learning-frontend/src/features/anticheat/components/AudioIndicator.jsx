import React from 'react';
import './AudioIndicator.css';

const AudioIndicator = ({ 
  isInitialized, 
  isDetecting, 
  isSpeaking, 
  violations, 
  error, 
  isLoading
}) => {
  const getAudioStatus = () => {
    if (isLoading) return 'initializing';
    if (error) return 'error';
    if (!isInitialized) return 'ready';
    if (isSpeaking) return 'speaking';
    if (isDetecting) return 'active';
    return 'inactive';
  };

  const getStatusIcon = () => {
    switch (getAudioStatus()) {
      case 'initializing': return '⏳';
      case 'error': return '❌';
      case 'ready': return '🎤';
      case 'speaking': return '🔊';
      case 'active': return '🎯';
      case 'inactive': return '🎤';
      default: return '🎤';
    }
  };

  const getStatusText = () => {
    switch (getAudioStatus()) {
      case 'initializing': return 'Initializing mic...';
      case 'error': return 'Mic error';
      case 'ready': return 'Mic ready';
      case 'speaking': return 'Speaking!';
      case 'active': return 'Voice monitoring';
      case 'inactive': return 'Mic inactive';
      default: return 'Mic status';
    }
  };

  const getStatusColor = () => {
    switch (getAudioStatus()) {
      case 'initializing': return '#f59e0b'; // Orange
      case 'error': return '#ef4444'; // Red
      case 'ready': return '#6b7280'; // Gray
      case 'speaking': return '#ef4444'; // Red
      case 'active': return '#22c55e'; // Green
      case 'inactive': return '#6b7280'; // Gray
      default: return '#6b7280';
    }
  };

  const audioStatus = getAudioStatus();
  const violationCount = violations.length;

  return (
    <div className="audio-indicator">
      <div className="audio-status">
        <div 
          className="audio-dot"
          style={{ backgroundColor: getStatusColor() }}
          data-status={audioStatus}
        ></div>
        <span className="audio-icon">{getStatusIcon()}</span>
        <span className="audio-text">{getStatusText()}</span>
      </div>
      
      {violationCount > 0 && (
        <div className="audio-violations">
          <span className="violation-count">{violationCount}</span>
        </div>
      )}
      
      {isSpeaking && (
        <div className="speaking-waves">
          <div className="wave"></div>
          <div className="wave"></div>
          <div className="wave"></div>
          <div className="wave"></div>
          <div className="wave"></div>
        </div>
      )}
    </div>
  );
};

export default AudioIndicator;
