import React from 'react';
import { AlertTriangle, Home } from 'lucide-react';
import './QuizTerminationModal.css';

const QuizTerminationModal = ({ onGoToDashboard, violationCount }) => {
  return (
    <div className="quiz-termination-overlay">
      <div className="quiz-termination-modal">
        <div className="termination-icon">
          <AlertTriangle size={64} />
        </div>
        
        <div className="termination-content">
          <h2>Quiz Terminated</h2>
          <p className="termination-message">
            Your quiz has been terminated due to non-compliance with exam rules.
          </p>
          <div className="violation-summary">
            <span className="violation-count">{violationCount} violations detected</span>
            <p>
              Multiple violations of anti-cheating measures were recorded. 
              This includes tab switching, exiting fullscreen mode, or attempting to access restricted features.
            </p>
          </div>
        </div>
        
        <div className="termination-actions">
          <button 
            className="dashboard-btn"
            onClick={onGoToDashboard}
          >
            <Home size={20} />
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizTerminationModal;
