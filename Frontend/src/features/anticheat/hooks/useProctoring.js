import { useState, useEffect, useCallback, useRef } from 'react';

const useProctoring = (isActive = false) => {
  const [warning, setWarning] = useState(null);
  const [violationCount, setViolationCount] = useState(0);
  const [shouldTerminate, setShouldTerminate] = useState(false);
  const isInitialized = useRef(false);
  const warningTimeoutRef = useRef(null);
  const eventListenersRef = useRef({});
  const isQuizCompleted = useRef(false);

  const clearWarning = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    setWarning(null);
  }, []);

  const showWarning = useCallback((message) => {
    clearWarning();
    setWarning(message);
    warningTimeoutRef.current = setTimeout(() => {
      clearWarning();
    }, 3000);
  }, [clearWarning]);

  const logEvent = useCallback(async (eventType, details) => {
    try {
      await fetch('http://localhost:5000/api/anti-cheat/log-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          eventType,
          details,
          timestamp: new Date().toISOString(),
          violationCount: violationCount + 1
        })
      });
    } catch (error) {
      console.error('Failed to log anti-cheat event:', error);
    }
  }, [violationCount]);

  const handleTabSwitch = useCallback(() => {
    const newViolationCount = violationCount + 1;
    setViolationCount(newViolationCount);
    showWarning('⚠️ Tab switching detected!');
    logEvent('TAB_SWITCH', { violationCount: newViolationCount });
    
    if (newViolationCount >= 3) {
      setShouldTerminate(true);
    }
  }, [violationCount, showWarning, logEvent]);

  const handleFullscreenExit = useCallback(() => {
    const newViolationCount = violationCount + 1;
    setViolationCount(newViolationCount);
    showWarning('⚠️ Fullscreen mode exited!');
    logEvent('FULLSCREEN_EXIT', { violationCount: newViolationCount });
    
    if (newViolationCount >= 3) {
      setShouldTerminate(true);
    }
    // Note: Fullscreen re-entry is now handled by the fullscreenchange event listener
  }, [violationCount, showWarning, logEvent]);

  const initializeProctoring = useCallback(() => {
    if (!isActive || isInitialized.current) return;

    try {
      // Initialize exam-guard features manually
      isInitialized.current = true;

      // Request fullscreen
      document.documentElement.requestFullscreen().catch(() => {
        console.log('Could not enter fullscreen');
        showWarning('⚠️ Please enable fullscreen mode');
      });

      // Block right-click
      const handleContextMenu = (e) => {
        e.preventDefault();
        return false;
      };
      document.addEventListener('contextmenu', handleContextMenu);
      eventListenersRef.current.contextmenu = handleContextMenu;

      // Block keyboard shortcuts
      const handleKeyDown = (e) => {
        const blockedKeys = [
          'F12', // Dev tools
          'I', // Ctrl+I (view source)
          'U', // Ctrl+U (view source)
          'T', // Ctrl+T (new tab)
          'N', // Ctrl+N (new window)
          'W', // Ctrl+W (close tab)
        ];

        if (e.ctrlKey && blockedKeys.includes(e.key.toUpperCase())) {
          e.preventDefault();
          return false;
        }

        if (e.key === 'F12') {
          e.preventDefault();
          return false;
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      eventListenersRef.current.keydown = handleKeyDown;

      // Block copy/paste
      const handleCopy = (e) => {
        e.preventDefault();
        return false;
      };
      
      const handlePaste = (e) => {
        e.preventDefault();
        return false;
      };
      
      document.addEventListener('copy', handleCopy);
      document.addEventListener('cut', handleCopy);
      document.addEventListener('paste', handlePaste);
      eventListenersRef.current.copy = handleCopy;
      eventListenersRef.current.cut = handleCopy;
      eventListenersRef.current.paste = handlePaste;

      console.log('Proctoring initialized successfully');

    } catch (error) {
      console.error('Failed to initialize proctoring:', error);
      showWarning('⚠️ Proctoring initialization failed');
    }
  }, [isActive, showWarning]);

  const stopProctoring = useCallback(() => {
    if (!isInitialized.current) return;
    
    isInitialized.current = false;
    isQuizCompleted.current = true; // Mark quiz as completed
    
    // Exit fullscreen mode
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        console.log('Could not exit fullscreen');
      });
    }
    
    // Remove all event listeners using stored references
    const listeners = eventListenersRef.current;
    if (listeners.contextmenu) {
      document.removeEventListener('contextmenu', listeners.contextmenu);
    }
    if (listeners.keydown) {
      document.removeEventListener('keydown', listeners.keydown);
    }
    if (listeners.copy) {
      document.removeEventListener('copy', listeners.copy);
    }
    if (listeners.cut) {
      document.removeEventListener('cut', listeners.cut);
    }
    if (listeners.paste) {
      document.removeEventListener('paste', listeners.paste);
    }
    
    // Clear the event listeners reference
    eventListenersRef.current = {};
    
    clearWarning();
    setViolationCount(0);
    
    console.log('Proctoring stopped - all detection disabled, fullscreen exited');
  }, [clearWarning]);

  useEffect(() => {
    if (isActive) {
      initializeProctoring();
    } else {
      stopProctoring();
    }

    return () => {
      stopProctoring();
    };
  }, [isActive, initializeProctoring, stopProctoring]);

  // Handle page navigation away from quiz
  useEffect(() => {
    if (!isActive) return;
    
    const handleBeforeUnload = (event) => {
      // Stop proctoring when user navigates away
      stopProctoring();
    };
    
    const handlePageHide = (event) => {
      // Stop proctoring when page is hidden (navigation)
      stopProctoring();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isActive, stopProctoring]);

  // Handle page visibility change (tab detection)
  useEffect(() => {
    if (!isActive) return;
    
    const handleVisibilityChange = () => {
      // If user leaves the page (not just tab switching within quiz)
      if (document.hidden && !document.URL.includes('/quiz')) {
        // User navigated away from quiz page - stop proctoring
        stopProctoring();
        return;
      }
      
      // Normal tab switching during quiz
      if (isActive && document.hidden) {
        handleTabSwitch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    eventListenersRef.current.visibilitychange = handleVisibilityChange;
    
    return () => {
      if (eventListenersRef.current.visibilitychange) {
        document.removeEventListener('visibilitychange', eventListenersRef.current.visibilitychange);
        delete eventListenersRef.current.visibilitychange;
      }
    };
  }, [isActive, handleTabSwitch, stopProctoring]);

  // Handle window focus/blur (tab detection)
  useEffect(() => {
    if (!isActive) return;
    
    const handleBlur = () => {
      if (isActive) {
        handleTabSwitch();
      }
    };

    window.addEventListener('blur', handleBlur);
    eventListenersRef.current.blur = handleBlur;
    
    return () => {
      if (eventListenersRef.current.blur) {
        window.removeEventListener('blur', eventListenersRef.current.blur);
        delete eventListenersRef.current.blur;
      }
    };
  }, [isActive, handleTabSwitch]);

  // Handle fullscreen change
  useEffect(() => {
    if (!isActive) return;
    
    const handleFullscreenChange = () => {
      // If user exits fullscreen during quiz and quiz is not completed
      if (isActive && !document.fullscreenElement && !isQuizCompleted.current) {
        handleFullscreenExit();
        // Continuously try to re-enter fullscreen
        const tryReenterFullscreen = () => {
          if (isActive && !isQuizCompleted.current && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {
              console.log('Could not re-enter fullscreen');
              // Try again after 2 seconds
              setTimeout(tryReenterFullscreen, 2000);
            });
          }
        };
        
        // Initial attempt after 1 second
        setTimeout(tryReenterFullscreen, 1000);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    eventListenersRef.current.fullscreenchange = handleFullscreenChange;
    
    return () => {
      if (eventListenersRef.current.fullscreenchange) {
        document.removeEventListener('fullscreenchange', eventListenersRef.current.fullscreenchange);
        delete eventListenersRef.current.fullscreenchange;
      }
    };
  }, [isActive, handleFullscreenExit]);

  const markQuizCompleted = useCallback(() => {
    isQuizCompleted.current = true;
  }, []);

  return {
    warning,
    violationCount,
    shouldTerminate,
    clearWarning,
    stopProctoring,
    markQuizCompleted
  };
};

export default useProctoring;
