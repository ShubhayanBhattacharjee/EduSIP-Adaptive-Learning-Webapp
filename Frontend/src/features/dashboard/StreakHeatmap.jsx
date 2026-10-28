import React, { useEffect, useMemo, useRef } from "react";
import "./StreakHeatmap.css";

export const dayKey = (d) => new Date(d).toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

const level = (n) => (n <= 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);

/* The whole current year, stretched to the full width of its card. */
const StreakHeatmap = ({ activity = [] }) => {
  const scrollRef = useRef(null);

  const { weeks, months, activeDays, bestDay, total } = useMemo(() => {
    const year = new Date().getFullYear();
    const map = {};
    activity.forEach((a) => { map[dayKey(a.date)] = (map[dayKey(a.date)] || 0) + (a.count || 0); });

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const cursor = new Date(start);
    cursor.setDate(start.getDate() - start.getDay()); // line up on Sunday

    const todayKey = dayKey(new Date());
    const wk = [];
    const mo = [];
    let week = [];
    let lastMonth = -1;
    let active = 0;
    let best = 0;
    let sum = 0;

    for (; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const d = new Date(cursor);
      if (d.getDay() === 0 && week.length) { wk.push(week); week = []; }

      const inYear = d.getFullYear() === year;
      const key = dayKey(d);
      const count = inYear ? map[key] || 0 : 0;
      if (inYear && d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        mo.push({ name: d.toLocaleString("default", { month: "short" }), col: wk.length + 1 });
      }
      if (count > 0) active += 1;
      if (count > best) best = count;
      sum += count;

      week.push({ key, count, out: !inYear, future: key > todayKey, today: key === todayKey });
    }
    if (week.length) wk.push(week);
    return { weeks: wk, months: mo, activeDays: active, bestDay: best, total: sum };
  }, [activity]);

  /* on narrow screens the grid scrolls sideways, so start near "today" */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = weeks.findIndex((w) => w.some((d) => d.today));
    if (idx > 0) el.scrollLeft = Math.max(0, (el.scrollWidth * idx) / weeks.length - el.clientWidth + 80);
  }, [weeks]);

  return (
    <div className="hm">
      <div className="hm-top">
        <div className="hm-facts">
          <span><b>{total}</b> questions this year</span>
          <span><b>{activeDays}</b> active days</span>
          <span><b>{bestDay}</b> best day</span>
        </div>
        <div className="hm-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`hm-cell hm-l${l}`} />)}
          <span>More</span>
        </div>
      </div>

      <div className="hm-scroll" ref={scrollRef}>
        <div className="hm-board">
          <div className="hm-days" aria-hidden="true">
            <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
          </div>

          <div className="hm-right">
            <div className="hm-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
              {months.map((m, i) => (
                <span key={i} style={{ gridColumnStart: m.col }}>{m.name}</span>
              ))}
            </div>

            <div className="hm-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
              {weeks.map((week, wi) =>
                week.map((d, di) => (
                  <i
                    key={`${wi}-${di}`}
                    className={`hm-cell hm-l${level(d.count)} ${d.out ? "hm-out" : ""} ${d.future ? "hm-future" : ""} ${d.today ? "hm-today" : ""}`}
                    style={{ gridColumn: wi + 1, gridRow: di + 1 }}
                    title={d.out ? "" : `${d.key} · ${d.count} question${d.count === 1 ? "" : "s"}`}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreakHeatmap;