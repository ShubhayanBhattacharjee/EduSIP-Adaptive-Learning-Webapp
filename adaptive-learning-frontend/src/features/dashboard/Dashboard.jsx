import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Navbar from "../../shared/layout/Navbar";
import AnalyticsChart from "./AnalyticsChart";
import StreakHeatmap from "./StreakHeatmap";
import Footer from "../../shared/layout/Footer";
import usericon from "../../assets/usericon.png";
import JoinClass from "./JoinClass";
import "./Dashboard.css";

const Dashboard = () => {
  const { updateProfile } = useAuth();
  const navigate = useNavigate();

  const [analytics, setAnalytics]     = useState(null);
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [quizHistory, setQuizHistory] = useState([]);
  const [isEditing, setIsEditing]     = useState(false);
  const [bio, setBio]                 = useState("");
  const [skills, setSkills]           = useState("");

  const BASE_URL    = "http://localhost:5000";
  const token       = localStorage.getItem("token");
  const userProfile = analytics?.user || {};

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [aRes, pRes] = await Promise.all([
        fetch(`${BASE_URL}/dashboard/analytics`,  { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BASE_URL}/dashboard/performance`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const aData = await aRes.json();
      const pData = await pRes.json();
      const hRes  = await fetch(`${BASE_URL}/quiz/history`, { headers: { Authorization: `Bearer ${token}` } });
      const hData = await hRes.json();
      if (hData.success) setQuizHistory(hData.history);
      setAnalytics(aData.success ? aData : null);
      setPerformance(pData.success ? pData : null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (token) fetchData(); }, [token, fetchData]);
  useEffect(() => {
    if (analytics?.user) {
      setBio(analytics.user.bio || "");
      setSkills((analytics.user.skills || []).join(", "));
    }
  }, [analytics]);

  const handleSave = async () => {
    const res = await updateProfile(bio, skills.split(",").map(s => s.trim()));
    if (res.success) { alert("Profile updated ✅"); setIsEditing(false); window.location.reload(); }
    else alert(res.error);
  };

  if (loading) return <div className="db-loading"><div className="db-spinner" /></div>;
  if (!analytics) return <p className="db-empty">No analytics found.</p>;

  /* ── chart data ─────────────────────────────────── */
  const subjects   = analytics.subjects?.map(s => s.subject)       || [];
  const subjectAcc = analytics.subjects?.map(s => s.accuracy)       || [];
  const subjectDis = analytics.subjects?.map(s => s.totalQuestions) || [];
  const improv     = analytics.improvementTrend    || [];
  const diffTrend  = analytics.difficultyTrend     || [];
  const diffPerf   = analytics.difficultyPerformance || [];

  const emojiMap = {
    Math:"🧮", Physics:"⚛️", Chemistry:"🧪", Biology:"🧬",
    AI:"🤖", CS:"💻", English:"📚", CN:"🌐",
    OS:"💾", DBMS:"🗄️", SE:"🛠️", default:"📝",
  };

  return (
    <>
      <Navbar />
      <div className="db-page">

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            HERO BANNER
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="db-hero">
          <div className="db-hero-text">
            <p className="db-hero-eyebrow">Dashboard</p>
            <h1 className="db-hero-heading">
              Welcome in, <span className="db-hero-name">{userProfile.fullname?.split(" ")[0]}</span>
            </h1>
          </div>

          <div className="db-hero-stats">
            <div className="db-qs">
              <span className="db-qs-num">{analytics.stats?.totalAttempts || 0}</span>
              <span className="db-qs-lbl">Questions</span>
            </div>
            <div className="db-qs">
              <span className="db-qs-num">{analytics.stats?.overallAccuracy || 0}%</span>
              <span className="db-qs-lbl">Accuracy</span>
            </div>
            <div className="db-qs">
              <span className="db-qs-num">
                {analytics.streak?.current || 0}
                <span className="db-qs-fire">🔥</span>
              </span>
              <span className="db-qs-lbl">Streak</span>
            </div>
            <button className="db-cta" onClick={() => navigate("/quiz")}>Start Quiz</button>
          </div>
        </section>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            BENTO GRID
            Columns: 230px | 1fr | 1fr | 200px

            Row 1: Profile(r2) | Streak Summary | Strong/Weak | Subject Donut
            Row 2: Profile(r2) | Improvement    | By Difficulty | —(donut above)
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="db-bento">

          {/* ── COL 1: Profile — spans both rows ── */}
          <div className="db-card db-profile db-r2">
            <div className="db-avatar-wrap">
              <img src={usericon} alt="avatar" className="db-avatar" />
              <div className="db-avatar-ring" />
            </div>

            <h2 className="db-pname">{userProfile.fullname}</h2>
            <p className="db-phandle">@{userProfile.username || "username"}</p>
            <p className="db-pemail">{userProfile.email}</p>

            {isEditing
              ? <textarea className="db-input" value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="Bio…" />
              : <p className="db-pbio">{userProfile.bio || "No bio added yet."}</p>
            }

            <div className="db-skills">
              {isEditing
                ? <input className="db-input" value={skills} onChange={e => setSkills(e.target.value)} placeholder="react, python…" />
                : (userProfile.skills || []).length > 0
                  ? userProfile.skills.map((s, i) => <span key={i} className="db-skill">{s}</span>)
                  : <span className="db-muted-sm">No skills yet</span>
              }
            </div>

            {isEditing
              ? (
                <div className="db-btns">
                  <button className="db-btn-primary" onClick={handleSave}>Save</button>
                  <button className="db-btn-ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                </div>
              )
              : <button className="db-btn-ghost db-btn-full" onClick={() => setIsEditing(true)}>Edit Profile</button>
            }

            <div className="db-streak-row">
              <div className="db-streak-box">
                <span className="db-streak-n">{analytics.streak?.current || 0}</span>
                <span className="db-streak-l">Current 🔥</span>
              </div>
              <div className="db-streak-box">
                <span className="db-streak-n">{analytics.streak?.longest || 0}</span>
                <span className="db-streak-l">Longest 🏆</span>
              </div>
            </div>
          </div>

          {/* ── ROW 1, COL 2: Streak Summary Card ── */}
          <div className="db-card db-streak-summary">
            <div className="db-ch">
              <span className="db-ch-title">Streak Overview</span>
            </div>
            <div className="db-ss-row">
              <div className="db-ss-box">
                <span className="db-ss-num">
                  {analytics.streak?.current || 0}
                  <span className="db-ss-icon">🔥</span>
                </span>
                <span className="db-ss-lbl">Current Streak</span>
              </div>
              <div className="db-ss-box">
                <span className="db-ss-num">
                  {analytics.streak?.longest || 0}
                  <span className="db-ss-icon">🏆</span>
                </span>
                <span className="db-ss-lbl">Longest Streak</span>
              </div>
            </div>
          </div>

          {/* ── ROW 1, COL 3: Strong / Weak ── */}
          <div className="db-card db-sw-card">
            <div className="db-sw-half db-sw-strong">
              <span className="db-sw-emoji">💪</span>
              <span className="db-sw-lbl">Strong Subject</span>
              <span className="db-sw-val">{performance?.strongSubject || "N/A"}</span>
            </div>
            <div className="db-sw-sep" />
            <div className="db-sw-half db-sw-weak">
              <span className="db-sw-emoji">⚠️</span>
              <span className="db-sw-lbl">Weak Subject</span>
              <span className="db-sw-val">{performance?.weakSubject || "N/A"}</span>
            </div>
          </div>

          {/* ── ROW 1, COL 4: Subject Donut ── */}
          <div className="db-card db-chart-card">
            <div className="db-ch">
              <span className="db-ch-title">Subject Split</span>
              <span className="db-ch-pill">Donut</span>
            </div>
            <AnalyticsChart type="doughnut" data={subjectDis} labels={subjects} />
          </div>

          {/* ── ROW 2, COL 2: Improvement Trend ── */}
          <div className="db-card db-chart-card">
            <div className="db-ch">
              <span className="db-ch-title">Improvement Trend</span>
              <span className="db-ch-pill">Line</span>
            </div>
            <AnalyticsChart type="line" data={improv.map(i => i.accuracy)} labels={improv.map(i => i.attempt)} />
          </div>

          {/* ── ROW 2, COL 3: By Difficulty ── */}
          <div className="db-card db-chart-card">
            <div className="db-ch">
              <span className="db-ch-title">By Difficulty</span>
              <span className="db-ch-pill">Bar</span>
            </div>
            <AnalyticsChart type="bar" data={diffPerf.map(d => d.accuracy)} labels={diffPerf.map(d => d.difficulty.toUpperCase())} />
          </div>

          {/* ── ROW 2, COL 4: empty — donut already in row 1 ── */}

        </div>{/* /db-bento */}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            HEATMAP — full width
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="db-fw-card db-card db-heatmap-card">
          <div className="db-ch">
            <span className="db-ch-title">
              {analytics.stats?.totalAttempts || 0} submissions in the last year
            </span>
          </div>
          <StreakHeatmap activity={analytics.activity || []} />
        </div>

        <JoinClass />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ACCURACY PER SUBJECT + DIFFICULTY PROGRESSION — side by side
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="db-fw-row">
          <div className="db-card">
            <div className="db-ch">
              <span className="db-ch-title">Accuracy Per Subject</span>
              <span className="db-ch-pill">Bar</span>
            </div>
            <AnalyticsChart type="bar" data={subjectAcc} labels={subjects} />
          </div>

          <div className="db-card">
            <div className="db-ch">
              <span className="db-ch-title">Difficulty Progression</span>
              <span className="db-ch-pill">Line</span>
            </div>
            <AnalyticsChart type="line" data={diffTrend.map(d => d.level)} labels={diffTrend.map(d => d.label)} />
          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            AI FEEDBACK
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <h2 className="db-section-title">🧠 AI Feedback</h2>
        <div className="db-card db-ai-card">
          <p className="db-ai-msg">{analytics.recommendations?.message || "No insights yet."}</p>

          <div className="db-topic-row">
            {analytics.recommendations?.weakTopics?.length > 0 && (
              <div className="db-topic-group">
                <p className="db-topic-head">⚠️ Focus Areas</p>
                <div className="db-tags">
                  {analytics.recommendations.weakTopics.map((t, i) =>
                    <span key={i} className="db-tag db-tag-weak">{t}</span>
                  )}
                </div>
              </div>
            )}
            {analytics.recommendations?.strongTopics?.length > 0 && (
              <div className="db-topic-group">
                <p className="db-topic-head">💪 Strengths</p>
                <div className="db-tags">
                  {analytics.recommendations.strongTopics.map((t, i) =>
                    <span key={i} className="db-tag db-tag-strong">{t}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {analytics.recommendations?.videos?.length > 0 &&
            Object.entries(
              analytics.recommendations.videos.reduce((acc, v) => {
                (acc[v.topic] ??= []).push(v); return acc;
              }, {})
            ).map(([topic, vids], idx) => (
              <div key={idx} className="db-vblock">
                <p className="db-vtopic">📌 {topic}</p>
                <div className="db-vgrid">
                  {vids.map((v, i) => (
                    <a key={i} href={v.url} target="_blank" rel="noreferrer" className="db-vcard">
                      <span className="db-vnum">#{i + 1}</span>
                      <img src={v.thumbnail} alt={v.title} />
                      <p>{v.title}</p>
                    </a>
                  ))}
                </div>
              </div>
            ))
          }
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            QUIZ HISTORY
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <h2 className="db-section-title">Quiz History</h2>
        <div className="db-history">
          {quizHistory.map((quiz, idx) => {
            const pct  = quiz.accuracy;
            const tier = pct >= 75 ? "high" : pct >= 50 ? "mid" : "low";
            const emoji = emojiMap[quiz.subject] || emojiMap.default;
            return (
              <div key={quiz._id} className="db-hcard" onClick={() => navigate(`/quiz-review/${quiz._id}`)}>
                <div className="db-hcard-top">
                  <span className="db-hcard-badge">#{quizHistory.length - idx}</span>
                </div>
                <p className="db-hcard-sub">{emoji} <strong>{quiz.subject}</strong></p>
                <p className="db-hcard-score">{quiz.correctAnswers}/{quiz.totalQuestions} ✅</p>
                <span className={`db-hcard-acc db-hcard-acc--${tier}`}>{pct}%</span>
              </div>
            );
          })}
        </div>

        <Footer />
      </div>
    </>
  );
};

export default Dashboard;