import React from "react";
import { motion } from "framer-motion";
import "./QuestionCard.css";

const QuestionCard = ({
  questionNumber,
  totalQuestions,
  questionText,
  options,
  selectedOption,
  onOptionSelect,
  onHint,
  showHint,
  hint,
  onNext,
  isLastQuestion,
  hasSelectedOption,
  isTransitioning,
}) => {
  const handleOptionClick = (index) => {
    if (!isTransitioning) {
      onOptionSelect(index);
    }
  };

  const handleNextClick = () => {
    if (hasSelectedOption && !isTransitioning) {
      onNext();
    }
  };

  return (
    <motion.div
      className="question-card"
      initial={{ x: 150, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -150, opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <p className="question-number">
        Question {questionNumber} of {totalQuestions}
      </p>

      <h1 id="questionText">{questionText}</h1>

      <div className="options-grid">
        {options?.map((option, index) => (
          <motion.button
            key={index}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`option-btn ${
              selectedOption === index ? "option-selected" : ""
            }`}
            onClick={() => handleOptionClick(index)}
            disabled={isTransitioning}
          >
            <span>{option}</span>
          </motion.button>
        ))}
      </div>

      {showHint && (
        <motion.div
          className="hint-content"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p>💡 {hint}</p>
        </motion.div>
      )}

      <div className="action-buttons">
        <motion.button
          className={`hint-btn ${showHint ? "active" : ""}`}
          onClick={onHint}
          disabled={isTransitioning}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          💡 {showHint ? "Hide Hint" : "Show Hint"}
        </motion.button>

        <motion.button
          className={`next-btn ${
            !hasSelectedOption || isTransitioning ? "disabled" : ""
          }`}
          onClick={handleNextClick}
          disabled={!hasSelectedOption || isTransitioning}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {isLastQuestion ? "Finish Quiz" : "Next Question"}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default QuestionCard;