import React from "react";
import "./ProgressBar.css";

/**
 * Usage A (segmented): <ProgressBar current={3} total={10} />
 * Usage B (continuous, old API still works): <ProgressBar progress={40} />
 */
const ProgressBar = ({ progress = 0, current, total, label }) => {
  const hasSteps =
    Number.isFinite(current) && Number.isFinite(total) && total > 0;
  const segmented = hasSteps && total <= 30;

  const raw = hasSteps ? (current / total) * 100 : progress;
  const pct = Math.min(Math.max(Math.round(raw), 0), 100);
  const text = label || (hasSteps ? `Question ${current} of ${total}` : "");

  return (
    <div
      className="pbar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="pbar-head">
        <span className="pbar-label">{text}</span>
        <span className="pbar-pct">{pct}%</span>
      </div>

      {segmented ? (
        <div className="pbar-steps">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`pbar-seg ${
                i < current - 1 ? "done" : i === current - 1 ? "now" : ""
              }`}
            />
          ))}
        </div>
      ) : (
        <div className="pbar-track">
          <div className="pbar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

export default ProgressBar;