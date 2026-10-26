import React, { useEffect, useState } from "react";
import adminService from "../../services/adminService";
import "./AdminAnalytics.css";
import "./AdminPages.css";

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

  const h = analytics.questionHealth || {};
  const role = analytics.usersByRole || {};
  const stat = (n, label, cls = "") => <div className={`ap-stat ${cls}`}><b>{n ?? 0}</b><span>{label}</span></div>;

  return (
    <div className="analytics-wrapper" style={{ flexDirection: "column", alignItems: "stretch", gap: 16 }}>
      <div className="ap-grid" style={{ width: "100%" }}>
        {stat(analytics.activeStudents7d, "Students active this week")}
        {stat(analytics.answers7d, "Answers this week")}
        {stat(analytics.newUsers7d, "New sign-ups this week")}
        {stat(analytics.pendingQuestions, "Questions to review", analytics.pendingQuestions ? "warn" : "")}
        {stat(analytics.pendingTeachers, "Teachers to approve", analytics.pendingTeachers ? "warn" : "")}
        {stat(`${role.student || 0} / ${role.teacher || 0} / ${(role.admin || 0) + (role.superadmin || 0)}`, "Students / teachers / staff")}
        {stat(h.unused, "Live questions never answered")}
        {stat(h.tooEasy, "Questions that are too easy", h.tooEasy ? "warn" : "")}
        {stat(h.tooHard, "Questions that are too hard or wrong", h.tooHard ? "bad" : "")}
      </div>

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