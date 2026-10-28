import React, { useEffect, useState } from "react";
import adminService from "../../services/adminService";
import "./AdminAnalytics.css";
import "./AdminPages.css";

/* width of one difficulty slice, as a % of the subject's questions */
const pct = (n, total) => (total > 0 ? Math.round(((n || 0) / total) * 1000) / 10 : 0);

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
  const subjects = analytics.subjects || [];
  const stat = (n, label, cls = "") => (
    <div className={`ap-stat ${cls}`}><b>{n ?? 0}</b><span>{label}</span></div>
  );

  return (
    <div className="ap-page">
      <h2>Analytics</h2>
      <p className="ap-sub">How the platform and the question bank are doing right now.</p>

      {/* headline numbers */}
      <div className="ap-grid">
        {stat(analytics.totalUsers, "Total users")}
        {stat(analytics.totalQuestionsInDB, "Total questions")}
        {stat(analytics.activeStudents7d, "Students active this week")}
        {stat(analytics.answers7d, "Answers this week")}
        {stat(analytics.newUsers7d, "New sign-ups this week")}
        {stat(`${role.student || 0} / ${role.teacher || 0} / ${(role.admin || 0) + (role.superadmin || 0)}`, "Students / teachers / staff")}
      </div>

      {/* things that need attention */}
      <div className="ap-grid">
        {stat(analytics.pendingQuestions, "Questions to review", analytics.pendingQuestions ? "warn" : "")}
        {stat(analytics.pendingTeachers, "Teachers to approve", analytics.pendingTeachers ? "warn" : "")}
        {stat(h.unused, "Live questions never answered")}
        {stat(h.tooEasy, "Questions that are too easy", h.tooEasy ? "warn" : "")}
        {stat(h.tooHard, "Questions that are too hard or wrong", h.tooHard ? "bad" : "")}
      </div>

      {/* question bank by subject */}
      <div className="ap-card">
        <div className="an-head">
          <h3>Question bank by subject</h3>
          <div className="an-legend" aria-hidden="true">
            <span><i className="easy" /> Easy</span>
            <span><i className="medium" /> Medium</span>
            <span><i className="hard" /> Hard</span>
          </div>
        </div>

        {subjects.length === 0 ? (
          <p className="ap-sub">No questions yet.</p>
        ) : (
          <div className="ap-scroll">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Questions</th>
                  <th className="an-mixcol">Difficulty mix</th>
                  <th>Easy</th>
                  <th>Medium</th>
                  <th>Hard</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subj) => {
                  const total = subj.totalQuestions || (subj.easy || 0) + (subj.medium || 0) + (subj.hard || 0);
                  return (
                    <tr key={subj.subject}>
                      <td className="an-subject">{subj.subject}</td>
                      <td className="an-num">{subj.totalQuestions}</td>
                      <td className="an-mixcol">
                        <div
                          className="an-split"
                          title={`Easy ${subj.easy || 0} · Medium ${subj.medium || 0} · Hard ${subj.hard || 0}`}
                        >
                          <i className="easy" style={{ width: `${pct(subj.easy, total)}%` }} />
                          <i className="medium" style={{ width: `${pct(subj.medium, total)}%` }} />
                          <i className="hard" style={{ width: `${pct(subj.hard, total)}%` }} />
                        </div>
                      </td>
                      <td className="an-num">{subj.easy}</td>
                      <td className="an-num">{subj.medium}</td>
                      <td className="an-num">{subj.hard}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAnalytics;