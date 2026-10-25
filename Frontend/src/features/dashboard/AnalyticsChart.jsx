import React, { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import "./AnalyticsChart.css";

const AnalyticsChart = ({ type, data, labels }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      // Destroy existing chart
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      // Create new chart 
      const ctx = chartRef.current.getContext("2d");

      const config = {
        type: type,
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor:
                type === "doughnut"
                  ? ["#fd6e01", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"]
                  : "#fd6e01",
              borderColor: type === "line" ? "#fd6e01" : "transparent",
              tension: 0.4,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: type === "doughnut",
              position: "bottom",
              labels: {
                color: document.body.classList.contains("dark-mode")
                  ? "white"
                  : "black",
              },
            },
          },
          scales:
            type !== "doughnut"
              ? {
                  y: {
                    beginAtZero: true,
                    grid: {
                      color: document.body.classList.contains("dark-mode")
                        ? "#334155"
                        : "#e2e8f0",
                    },
                    ticks: {
                      color: document.body.classList.contains("dark-mode")
                        ? "white"
                        : "black",
                    },
                  },
                  x: {
                    grid: {
                      display: false,
                    },
                    ticks: {
                      color: document.body.classList.contains("dark-mode")
                        ? "white"
                        : "black",
                    },
                  },
                }
              : {},
        },
      };

      chartInstance.current = new Chart(ctx, config);
    }

    // Cleanup
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [type, data, labels]);

  return (
    <div className="chart-container">
      <canvas ref={chartRef}></canvas>
    </div>
  );
};

export default AnalyticsChart;
