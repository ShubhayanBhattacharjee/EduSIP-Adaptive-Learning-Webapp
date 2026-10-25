import React from "react";
import "./StreakHeatmap.css";

const StreakHeatmap = ({ activity = [], streak }) => {
  const year = new Date().getFullYear();

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  // 👉 Align to Sunday (GitHub style)
  const startDay = start.getDay();
  const alignedStart = new Date(start);
  alignedStart.setDate(start.getDate() - startDay);

  const activityMap = {};
  activity.forEach((a) => {
    const d = new Date(a.date).toLocaleDateString("en-CA");
    activityMap[d] = a.count;
  });

  const weeks = [];
  const months = [];
  let currentMonth = -1;

  let currentWeek = [];

  for (let d = new Date(alignedStart); d <= end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const formatted = date.toLocaleDateString("en-CA");

    const dayOfWeek = date.getDay(); // 0 = Sunday

    // Start new week
    if (dayOfWeek === 0 && currentWeek.length) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    // Track month labels
    if (
      date.getMonth() !== currentMonth &&
      date.getFullYear() === year // 👈 IMPORTANT FIX
    ) {
      currentMonth = date.getMonth();
      months.push({
        name: date.toLocaleString("default", { month: "short" }),
        weekIndex: weeks.length,
      });
    }
    currentWeek.push({
      date: formatted,
      count: activityMap[formatted] || 0,
    });
  }

  if (currentWeek.length) weeks.push(currentWeek);

  // Color scale
  const getColor = (count) => {
    if (count === 0) return "#ebedf0";
    if (count <= 2) return "#9be9a8";
    if (count <= 4) return "#40c463";
    return "#216e39";
  };

  return (
    <div className="heatmap-wrapper-full">
      {/* MONTH LABELS */}
      <div
        className="heatmap-months"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, 18px)` }}
      >
        {months.map((m, i) => (
          <span key={i} style={{ gridColumnStart: m.weekIndex + 1 }}>
            {m.name}
          </span>
        ))}
      </div>

      {/* HEATMAP GRID */}
      <div className="heatmap-container">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-week">
            {week.map((day, di) => (
              <div
                key={di}
                className="heatmap-cell"
                style={{ backgroundColor: getColor(day.count) }}
                title={`${day.date} — ${day.count} attempts`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StreakHeatmap;
