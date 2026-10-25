import React, { useState, useEffect, useRef, useCallback } from 'react';
import './WebcamStream.css';

const WebcamStream = ({ 
  isActive = false, 
  onVideoRef, 
  onStreamReady, 
  onError,
  showControls = true 
}) => {
  const [stream, setStream] = useState(null);
  const [isPermissionGranted, setIsPermissionGranted] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const retryTimeoutRef = useRef(null);


  // Handle errors
  const handleError = useCallback((err) => {
    let errorMessage = 'Failed to access camera';
    
    if (err.name === 'NotAllowedError') {
      errorMessage = 'Camera permission denied. Please allow camera access and try again.';
    } else if (err.name === 'NotFoundError') {
      errorMessage = 'No camera found. Please connect a camera and try again.';
    } else if (err.name === 'NotReadableError') {
      errorMessage = 'Camera is already in use by another application.';
    } else if (err.name === 'OverconstrainedError') {
      errorMessage = 'Camera does not support the required settings.';
    } else if (typeof err === 'string') {
      errorMessage = err;
    }
    
    setError(errorMessage);
    setIsPermissionGranted(false);
    setIsLoading(false);
    setStream(null);
    
    if (onError) {
      onError(err);
    }
  }, [onError]);
  
  // Handle camera connection
  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📷 Requesting camera permission...');
      
      // Request camera access with optimal settings
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user',
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      });

      // Set stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(() => {
            console.log('✅ Camera stream started successfully');
            setStream(mediaStream);
            streamRef.current = mediaStream;
            setIsPermissionGranted(true);
            setIsLoading(false);
            
            // Notify parent component
            if (onVideoRef) {
              onVideoRef(videoRef.current);
            }
            if (onStreamReady) {
              onStreamReady(mediaStream, videoRef.current);
            }
          }).catch(err => {
            console.error('❌ Failed to play video:', err);
            handleError('Failed to start video stream');
          });
        };
      }
      
    } catch (err) {
      console.error('❌ Camera access error:', err);
      handleError(err);
    }
  }, [onVideoRef, onStreamReady, handleError]);
  

  // Stop camera stream
  const stopCamera = useCallback(() => {
    console.log('⏹️ Stopping camera stream...');
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setStream(null);
    setIsPermissionGranted(null);
    setIsLoading(false);
  }, []);

  // Retry camera access
  const retryCamera = useCallback(() => {
    setRetryCount(prev => prev + 1);
    setError(null);
    
    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    // Wait a moment before retrying
    retryTimeoutRef.current = setTimeout(() => {
      startCamera();
    }, 1000);
  }, [startCamera]);

  // Auto-start when active
  useEffect(() => {
    if (isActive && !stream && !isLoading) {
      startCamera();
    } else if (!isActive && stream) {
      stopCamera();
    }
  }, [isActive, stream, isLoading, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [stopCamera]);

  return (
    <div className="webcam-stream">
      {/* Video Element */}
      <div className="video-container">
        <video
          ref={videoRef}
          className={`webcam-video ${isPermissionGranted ? 'active' : ''}`}
          autoPlay
          playsInline
          muted
          style={{ display: isPermissionGranted ? 'block' : 'none' }}
        />
        
        {/* Loading State */}
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Accessing camera...</p>
          </div>
        )}
        
        {/* Error State */}
        {error && (
          <div className="error-overlay">
            <div className="error-icon">📷</div>
            <h3>Camera Access Required</h3>
            <p>{error}</p>
            <button 
              onClick={retryCamera} 
              className="retry-button"
              disabled={isLoading}
            >
              {isLoading ? 'Retrying...' : 'Retry'}
            </button>
            <p className="retry-hint">
              {retryCount > 0 && `Attempt ${retryCount + 1}`}
            </p>
          </div>
        )}
        
        {/* Permission Prompt */}
        {isPermissionGranted === null && !isLoading && !error && (
          <div className="permission-prompt">
            <div className="camera-icon">📷</div>
            <h3>Camera Permission Needed</h3>
            <p>This exam requires camera access for proctoring</p>
            <button 
              onClick={startCamera} 
              className="allow-button"
              disabled={isLoading}
            >
              Allow Camera Access
            </button>
          </div>
        )}
      </div>
      
      {/* Status Indicator */}
      {isPermissionGranted && showControls && (
        <div className="status-indicator">
          <div className="status-dot active"></div>
          <span>Camera Active</span>
        </div>
      )}
      
      {/* Stream Info */}
      {stream && showControls && (
        <div className="stream-info">
          <span className="info-item">
            Resolution: {videoRef.current?.videoWidth || 'N/A'}x{videoRef.current?.videoHeight || 'N/A'}
          </span>
          <span className="info-item">
            FPS: 30
          </span>
        </div>
      )}
    </div>
  );
};

export default WebcamStream;
