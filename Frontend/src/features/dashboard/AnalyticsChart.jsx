import React, { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import "./AnalyticsChart.css";

/* read a CSS variable from the active theme (falls back if it is missing) */
const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
};

/* "#ff4d6d" + 0.2 -> "rgba(255,77,109,0.2)"  (non-hex colours are returned unchanged) */
const withAlpha = (color, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/**
 * type:    "line" | "bar" | "doughnut" | "radar"
 * max:     fixed top of the y axis (e.g. 100 for accuracy)
 * suffix:  appended to tick + tooltip numbers (e.g. "%")
 * height:  chart height in px
 */
const AnalyticsChart = ({ type, data, labels, max, suffix = "", height = 260 }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [themeTick, setThemeTick] = useState(0);

  /* redraw when the light / dark toggle flips the class on <body> */
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    if (chartRef.current) chartRef.current.destroy();

    const dark = document.body.classList.contains("dark-mode");
    const accent = cssVar("--accent", "#ff4d6d");
    const sub = cssVar("--subtext-color", "#6b7280");
    const text = cssVar("--text-color", "#0f172a");
    const card = cssVar("--card-bg", "#ffffff");
    const grid = dark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.07)";
    const palette = [1, 0.8, 0.62, 0.48, 0.36, 0.26, 0.18].map((o) => withAlpha(accent, o)); // one colour, different strengths

    const ctx = canvasRef.current.getContext("2d");
    const fillGradient = ctx.createLinearGradient(0, 0, 0, height);
    fillGradient.addColorStop(0, withAlpha(accent, 0.32));
    fillGradient.addColorStop(1, withAlpha(accent, 0));

    const dataset = { data };
    if (type === "line") {
      Object.assign(dataset, {
        borderColor: accent,
        backgroundColor: fillGradient,
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: data.length > 24 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: card,
        pointBorderColor: accent,
        pointBorderWidth: 2,
      });
    } else if (type === "bar") {
      Object.assign(dataset, {
        backgroundColor: withAlpha(accent, 0.85),
        hoverBackgroundColor: accent,
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 46,
      });
    } else if (type === "doughnut") {
      Object.assign(dataset, {
        backgroundColor: data.map((_, i) => palette[i % palette.length]),
        borderColor: card,
        borderWidth: 4,
        hoverOffset: 8,
      });
    } else if (type === "radar") {
      Object.assign(dataset, {
        borderColor: accent,
        backgroundColor: withAlpha(accent, 0.2),
        borderWidth: 2.5,
        pointBackgroundColor: accent,
        pointRadius: 4,
      });
    }

    const axisTicks = {
      color: sub,
      font: { size: 12 },
      callback: (v) => `${v}${suffix}`,
    };

    let scales = {};
    if (type === "line" || type === "bar") {
      scales = {
        y: {
          beginAtZero: true,
          suggestedMax: max,
          max,
          grid: { color: grid },
          border: { display: false },
          ticks: axisTicks,
        },
        x: { grid: { display: false }, border: { display: false }, ticks: { color: sub, font: { size: 12 } } },
      };
    } else if (type === "radar") {
      scales = {
        r: {
          min: 0,
          max: max || 100,
          angleLines: { color: grid },
          grid: { color: grid },
          pointLabels: { color: text, font: { size: 12, weight: "600" } },
          ticks: { display: false, stepSize: 25 },
        },
      };
    }

    /* a different entrance for every chart type */
    let animation;
    if (type === "line") {
      /* the line is drawn from left to right, point by point */
      const total = 1500;
      const step = total / Math.max(1, data.length);
      const prevY = (c) =>
        c.index === 0
          ? c.chart.scales.y.getPixelForValue(0)
          : c.chart.getDatasetMeta(c.datasetIndex).data[c.index - 1].getProps(["y"], true).y;
      animation = {
        x: {
          type: "number", easing: "linear", duration: step, from: NaN,
          delay: (c) => { if (c.type !== "data" || c.xStarted) return 0; c.xStarted = true; return c.index * step; },
        },
        y: {
          type: "number", easing: "linear", duration: step, from: prevY,
          delay: (c) => { if (c.type !== "data" || c.yStarted) return 0; c.yStarted = true; return c.index * step; },
        },
      };
    } else if (type === "bar") {
      /* bars spring up with a small bounce, one after another */
      animation = {
        duration: 900,
        easing: "easeOutBack",
        delay: (c) => (c.type === "data" && c.mode === "default" ? Math.min(c.dataIndex * 70, 700) : 0),
      };
    } else if (type === "doughnut") {
      /* the ring spins round to its final shape */
      animation = { animateRotate: true, animateScale: false, duration: 1400, easing: "easeOutQuart" };
    } else {
      /* radar: the shape blooms outward from the centre with a soft overshoot */
      animation = { duration: 1300, easing: "easeOutBack" };
    }

    chartRef.current = new Chart(ctx, {
      type,
      data: { labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: type === "doughnut" ? "68%" : undefined,
        animation: animation,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: type === "doughnut",
            position: "bottom",
            labels: { color: sub, usePointStyle: true, pointStyle: "circle", boxWidth: 8, padding: 16, font: { size: 12 } },
          },
          tooltip: {
            backgroundColor: dark ? "#0b0b12" : "#0f172a",
            titleColor: "#fff",
            bodyColor: "#e2e8f0",
            padding: 12,
            cornerRadius: 12,
            displayColors: type === "doughnut",
            callbacks: { label: (c) => ` ${c.parsed.r ?? c.parsed.y ?? c.parsed}${suffix}` },
          },
        },
        scales,
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, data, labels, max, suffix, height, themeTick]);

  return (
    <div className="chart-container" style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default AnalyticsChart;