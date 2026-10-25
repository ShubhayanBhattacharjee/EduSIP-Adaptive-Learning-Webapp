import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Check, User, CreditCard, AlertCircle } from 'lucide-react';
import './IdentityVerification.css';

const IdentityVerification = ({ onVerificationComplete, onClose }) => {
  const [currentStep, setCurrentStep] = useState('user'); // 'user' | 'id' | 'microphone' | 'complete'
  const [userPhoto, setUserPhoto] = useState(null);
  const [idPhoto, setIdPhoto] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [micPermission, setMicPermission] = useState(null);
  const [micError, setMicError] = useState('');
  
  const webcamRef = useRef(null);

  // Handle microphone permission check
  const handleMicrophonePermission = async () => {
    setIsProcessing(true);
    setMicError('');
    
    try {
      console.log('🎤 Requesting microphone permission...');
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      
      // Stop the stream immediately (we just needed permission)
      stream.getTracks().forEach(track => track.stop());
      
      setMicPermission('granted');
      console.log('✅ Microphone permission granted');
      
      // Prepare verification data
      const verificationData = {
        userPhoto: userPhoto || null,
        idPhoto: idPhoto || null,
        micPermission: 'granted',
        timestamp: new Date().toISOString()
      };
      
      // Complete verification with data
      onVerificationComplete(verificationData);
      
    } catch (error) {
      console.error('❌ Microphone permission error:', error);
      
      let errorMessage = 'Failed to access microphone';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied. Voice monitoring is required for this quiz.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is already in use by another application.';
      }
      
      setMicError(errorMessage);
      setMicPermission('denied');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle skip verification
  const handleSkipVerification = () => {
    console.log('⏭️ Skipping identity verification');
    // When skipping, go directly to microphone step
    setCurrentStep('microphone');
  };

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'user',
  };

  useEffect(() => {
    setIsCameraActive(true);
    return () => {
      setIsCameraActive(false);
    };
  }, []);

  const capturePhoto = useCallback(() => {
    if (!webcamRef.current) return null;
    
    const imageSrc = webcamRef.current.getScreenshot();
    return imageSrc;
  }, []);

  const handleUserPhotoCapture = async () => {
    setIsProcessing(true);
    try {
      const photo = capturePhoto();
      if (photo) {
        setUserPhoto(photo);
        setCurrentStep('id');
      }
    } catch (error) {
      console.error('Error capturing user photo:', error);
      setCameraError('Failed to capture photo. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIdPhotoCapture = async () => {
    setIsProcessing(true);
    try {
      const photo = capturePhoto();
      if (photo) {
        setIdPhoto(photo);
        setCurrentStep('microphone'); // Go to microphone step instead of complete
      }
    } catch (error) {
      console.error('Error capturing ID photo:', error);
      setCameraError('Failed to capture photo. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetakePhoto = (type) => {
    if (type === 'user') {
      setUserPhoto(null);
      setCurrentStep('user');
    } else {
      setIdPhoto(null);
      setCurrentStep('id');
    }
  };

  const handleStartQuiz = () => {
    onVerificationComplete({
      userPhoto,
      idPhoto,
      verified: true,
      timestamp: new Date().toISOString()
    });
  };

  const handleCameraError = (error) => {
    console.error('Camera error:', error);
    setCameraError('Unable to access camera. Please ensure camera permissions are granted.');
    setIsCameraActive(false);
  };

  const resetStep = (step) => {
    if (step === 'user') {
      setUserPhoto(null);
    } else if (step === 'id') {
      setIdPhoto(null);
    }
    setCurrentStep(step);
  };

  return (
    <div className="identity-verification-overlay">
      <div className="identity-verification-modal">
        <div className="verification-header">
          <h2>Identity Verification</h2>
          <p>Please complete the verification process to start your quiz</p>
        </div>

        <div className="verification-steps">
          <div className={`step ${userPhoto ? 'completed' : ''} ${currentStep === 'user' ? 'active' : ''}`}>
            <div className="step-icon">
              {userPhoto ? <Check /> : <User />}
            </div>
            <span>Photo Capture</span>
          </div>
          
          <div className={`step ${idPhoto ? 'completed' : ''} ${currentStep === 'id' ? 'active' : ''}`}>
            <div className="step-icon">
              {idPhoto ? <Check /> : <CreditCard />}
            </div>
            <span>ID Verification</span>
          </div>
        </div>

        <div className="verification-content">
          {currentStep === 'user' && (
            <div className="capture-section">
              <h3>Take Your Photo</h3>
              <p>Please position your face clearly in the frame</p>
              
              <div className="camera-container">
                {isCameraActive ? (
                  <>
                    <Webcam
                      audio={false}
                      height={480}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      width={640}
                      videoConstraints={videoConstraints}
                      onUserMediaError={handleCameraError}
                      className="webcam-feed"
                    />
                    <div className="face-guide-overlay">
                      <div className="face-guide-circle"></div>
                    </div>
                  </>
                ) : (
                  <div className="camera-error">
                    <AlertCircle size={48} />
                    <p>{cameraError || 'Camera is not accessible'}</p>
                  </div>
                )}
              </div>

              <div className="capture-controls">
                <button
                  className="capture-btn"
                  onClick={handleUserPhotoCapture}
                  disabled={!isCameraActive || isProcessing}
                >
                  <Camera size={20} />
                  {isProcessing ? 'Processing...' : 'Capture Photo'}
                </button>
                <button
                  className="skip-btn"
                  onClick={handleSkipVerification}
                  disabled={isProcessing}
                >
                  Skip Verification
                </button>
              </div>
            </div>
          )}

          {currentStep === 'id' && (
            <div className="capture-section">
              <h3>Show Your ID</h3>
              <p>Please hold your ID card clearly in front of the camera</p>
              
              <div className="camera-container">
                {isCameraActive ? (
                  <>
                    <Webcam
                      audio={false}
                      height={480}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      width={640}
                      videoConstraints={videoConstraints}
                      onUserMediaError={handleCameraError}
                      className="webcam-feed"
                    />
                    <div className="id-guide-overlay">
                      <div className="id-guide-rectangle"></div>
                    </div>
                  </>
                ) : (
                  <div className="camera-error">
                    <AlertCircle size={48} />
                    <p>{cameraError || 'Camera is not accessible'}</p>
                  </div>
                )}
              </div>

              <div className="capture-controls">
                <button
                  className="secondary-btn"
                  onClick={() => resetStep('user')}
                  disabled={isProcessing}
                >
                  Back
                </button>
                <button
                  className="capture-btn"
                  onClick={handleIdPhotoCapture}
                  disabled={!isCameraActive || isProcessing}
                >
                  <Camera size={20} />
                  {isProcessing ? 'Processing...' : 'Capture ID'}
                </button>
                <button
                  className="skip-btn"
                  onClick={handleSkipVerification}
                  disabled={isProcessing}
                >
                  Skip Verification
                </button>
              </div>
            </div>
          )}

          {currentStep === 'microphone' && (
            <div className="microphone-section">
              <h3>Microphone Setup</h3>
              <p>This quiz requires voice monitoring to ensure academic integrity</p>
              
              <div className="microphone-icon">
                <div className="mic-icon-large">🎤</div>
              </div>
              
              {micPermission === 'granted' ? (
                <div className="mic-success">
                  <div className="success-message">
                    <Check size={32} />
                    <span>Microphone access granted</span>
                  </div>
                  <p>Voice monitoring is now ready</p>
                </div>
              ) : micPermission === 'denied' ? (
                <div className="mic-error">
                  <div className="error-message">
                    <AlertCircle size={32} />
                    <span>Microphone access denied</span>
                  </div>
                  <p>{micError}</p>
                  <button
                    className="retry-btn"
                    onClick={handleMicrophonePermission}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Requesting...' : 'Retry'}
                  </button>
                </div>
              ) : (
                <div className="mic-prompt">
                  <p>Click below to enable microphone access for voice monitoring</p>
                  <button
                    className="mic-permission-btn"
                    onClick={handleMicrophonePermission}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <div className="spinner"></div>
                        Requesting Permission...
                      </>
                    ) : (
                      <>
                        <span className="mic-icon">🎤</span>
                        Enable Microphone
                      </>
                    )}
                  </button>
                </div>
              )}
              
              <div className="mic-controls">
                <button
                  className="secondary-btn"
                  onClick={() => resetStep('id')}
                  disabled={isProcessing}
                >
                  Back
                </button>
                <button
                  className="skip-btn"
                  onClick={handleSkipVerification}
                  disabled={isProcessing}
                >
                  Skip Verification
                </button>
              </div>
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="verification-complete">
              <div className="success-icon">
                <Check size={64} />
              </div>
              <h3>Verification Complete</h3>
              <p>Your identity has been verified successfully</p>
              
              <div className="photo-previews">
                <div className="photo-preview">
                  <img src={userPhoto} alt="User" />
                  <button 
                    className="retake-btn"
                    onClick={() => handleRetakePhoto('user')}
                  >
                    Retake
                  </button>
                </div>
                <div className="photo-preview">
                  <img src={idPhoto} alt="ID" />
                  <button 
                    className="retake-btn"
                    onClick={() => handleRetakePhoto('id')}
                  >
                    Retake
                  </button>
                </div>
              </div>

              <div className="completion-actions">
                <button className="secondary-btn" onClick={onClose}>
                  Cancel
                </button>
                <button className="start-quiz-btn" onClick={handleStartQuiz}>
                  Start Quiz
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IdentityVerification;
