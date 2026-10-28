import React from "react";
import { motion } from "framer-motion";
import "./QuestionCard.css";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

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
  hints,
  hintsLeft,
  onMoreHint,
  hideHint,
  hideCounter,
  onNext,
  isLastQuestion,
  hasSelectedOption,
  isTransitioning,
}) => {
  const handleOptionClick = (index) => {
    if (!isTransitioning) onOptionSelect(index);
  };

  const handleNextClick = () => {
    if (hasSelectedOption && !isTransitioning) onNext();
  };

  const hintList = (hints && hints.length ? hints : hint ? [hint] : []).filter(Boolean);

  return (
    <motion.section
      className="qcard"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
    >
      {!hideCounter && (
        <p className="qcard-counter">
          Question {questionNumber} of {totalQuestions}
        </p>
      )}

      <h2 className="qcard-question">{questionText}</h2>

      <div className="qcard-options" role="radiogroup">
        {options?.map((option, index) => (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={selectedOption === index}
            className={`qcard-opt ${selectedOption === index ? "on" : ""}`}
            onClick={() => handleOptionClick(index)}
            disabled={isTransitioning}
          >
            <span className="qcard-letter">{LETTERS[index]}</span>
            <span className="qcard-opt-text">{option}</span>
          </button>
        ))}
      </div>

      {!hideHint && showHint && hintList.length > 0 && (
        <motion.div
          className="qcard-hint"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {hintList.map((h, i) => (
            <p key={i}>
              {hintList.length > 1 && <b>Hint {i + 1} · </b>}
              {h}
            </p>
          ))}
          {onMoreHint && hintsLeft > 0 && (
            <button
              type="button"
              className="qcard-link"
              onClick={onMoreHint}
              disabled={isTransitioning}
            >
              More help ({hintsLeft} left)
            </button>
          )}
        </motion.div>
      )}

      <div className="qcard-actions">
        {!hideHint ? (
          <button
            type="button"
            className={`qcard-ghost ${showHint ? "active" : ""}`}
            onClick={onHint}
            disabled={isTransitioning}
          >
            💡 {showHint ? "Hide hint" : "Show hint"}
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          className="qcard-next"
          onClick={handleNextClick}
          disabled={!hasSelectedOption || isTransitioning}
        >
          {isTransitioning ? "Saving…" : isLastQuestion ? "Finish" : "Next →"}
        </button>
      </div>
    </motion.section>
  );
};

export default QuestionCard;