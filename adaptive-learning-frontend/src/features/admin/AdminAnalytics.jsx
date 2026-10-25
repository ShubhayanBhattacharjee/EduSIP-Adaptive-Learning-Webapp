import React, { useEffect, useState } from "react";
import adminService from "../../services/adminService";
import "./AdminAnalytics.css";

const AdminAnalytics = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await adminService.getAnalyticsAPI();
        if (res.success) {
          setAnalytics(res);
        }
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (!analytics) return <p>No data available</p>;

  return (
    <div className="analytics-wrapper">
      <div className="analytics-card">
        {/* Left Panel */}
        <div className="analytics-left-panel">
          <h2>Admin Analytics</h2>
          <p>Total Users: {analytics.totalUsers}</p>
          <p>Total Questions: {analytics.totalQuestionsInDB}</p>
        </div>

        {/* Right Panel */}
        <div className="analytics-right-panel">
          <div className="table-container">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Total Questions</th>
                  <th>Easy</th>
                  <th>Medium</th>
                  <th>Hard</th>
                </tr>
              </thead>
              <tbody>
                {analytics.subjects.map((subj) => (
                  <tr key={subj.subject}>
                    <td>{subj.subject}</td>
                    <td>{subj.totalQuestions}</td>
                    <td>{subj.easy}</td>
                    <td>{subj.medium}</td>
                    <td>{subj.hard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;