import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import './ProctoringWarning.css';

const ProctoringWarning = ({ warning, onClear }) => {
  useEffect(() => {
    if (warning) {
      // Auto-clear warning after 3 seconds
      const timer = setTimeout(() => {
        onClear();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [warning, onClear]);

  if (!warning) return null;

  return (
    <div className="proctoring-warning">
      <div className="warning-content">
        <AlertTriangle size={20} className="warning-icon" />
        <span className="warning-text">{warning}</span>
        <button 
          className="warning-close"
          onClick={onClear}
          aria-label="Close warning"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default ProctoringWarning;
