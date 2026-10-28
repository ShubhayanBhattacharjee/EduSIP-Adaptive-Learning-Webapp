import API_URL from "../../config";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, BarChart3, CheckCircle2, ClipboardList, Flame, History as HistoryIcon,
  LayoutGrid, Minus, Play, Plus, Sparkles, Target, Trophy, Users, Zap,
} from "lucide-react";
import AnalyticsChart from "./AnalyticsChart";
import StreakHeatmap, { dayKey } from "./StreakHeatmap";
import usericon from "../../assets/usericon.png";
import JoinClass from "./JoinClass";
import LearningPanel from "./LearningPanel";
import AssignedWork from "./AssignedWork";
import { OrbitRing, CountUp, ScoreRing } from "./DashParts";
import "./Dashboard.css";

/* ───────────── views (one per sidebar item) ───────────── */
const NAV = [
  { id: "overview", title: "Overview", icon: LayoutGrid,  sub: "" },
  { id: "progress", title: "Progress", icon: BarChart3,   sub: "How you are doing, over time" },
  { id: "feedback", title: "Feedback", icon: Sparkles,    sub: "What to focus on, with videos to help" },
  { id: "history",  title: "History",  icon: HistoryIcon, sub: "Your past quizzes. Open one to review your answers" },
    { id: "classes",  title: "Classes",  icon: Users,       sub: "Join a class with a code from your teacher" },
];
const VIEW_IDS = NAV.map((n) => n.id);

const initialView = () => {
  const h = window.location.hash.replace("#", "");
  return VIEW_IDS.includes(h) ? h : "overview";
};

const GOAL_KEY = "db_daily_goal";
const readGoal = () => {
  try {
    const v = Number(localStorage.getItem(GOAL_KEY));
    return v >= 5 && v <= 100 ? v : 10;
  } catch { return 10; }
};

const fmtDate = (d) => {
  if (!d) return "";
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/* ───────────── small building blocks ───────────── */
const Rule = ({ children }) => (
  <div className="db-rule"><span>{children}</span></div>
);

const ViewHead = ({ id }) => {
  const n = NAV.find((x) => x.id === id);
  return (
    <header className="db-vh">
      <h2>{n.title}</h2>
      <p>{n.sub}</p>
    </header>
  );
};

/* mounts its children (and so starts the chart animation) only once scrolled into view */
const Reveal = ({ children, minHeight = 270, lift = false }) => {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!("IntersectionObserver" in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`db-reveal ${lift ? "db-reveal--lift" : ""} ${seen ? "in" : ""}`} style={{ minHeight }}>
      {seen ? children : null}
    </div>
  );
};

const ChartCard = ({ title, tag, empty, span = 4, children }) => (
  <div className={`db-card db-span-${span}`}>
    <div className="db-card-head">
      <h3>{title}</h3>
      {tag && <span className="db-pill">{tag}</span>}
    </div>
    {empty ? (
      <p className="db-empty-note">Not enough data yet. Complete a few quizzes to see this.</p>
    ) : (
      <Reveal>{children}</Reveal>
    )}
  </div>
);

/* ═════════════════════════════ PAGE ═════════════════════════════ */
const Dashboard = () => {
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [quizHistory, setQuizHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [goal, setGoal] = useState(readGoal);
  const [view, setView] = useState(initialView);

  const token = localStorage.getItem("token");
  const userProfile = analytics?.user || {};

  const fetchData = useCallback(async () => {
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [aRes, pRes, hRes] = await Promise.all([
        fetch(`${API_URL}/dashboard/analytics`, { headers }),
        fetch(`${API_URL}/dashboard/performance`, { headers }),
        fetch(`${API_URL}/quiz/history`, { headers }).catch(() => null),
      ]);
      const aData = await aRes.json();
      const pData = await pRes.json();
      const hData = hRes ? await hRes.json().catch(() => ({})) : {};

      if (hData.success) setQuizHistory(hData.history || []);
      setAnalytics(aData.success ? aData : null);
      setPerformance(pData.success ? pData : null);
      setLoadError(aData.success ? "" : aData.message || "Could not load your dashboard.");
    } catch (e) {
      console.error(e);
      setLoadError("Cannot reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) fetchData(); }, [token, fetchData]);



  /* switch view, remember it in the URL hash, and bring the page back to the top */
  const go = (id) => {
    setView(id);
    try { window.history.replaceState(window.history.state, "", `#${id}`); } catch { /* ignore */ }
    if (window.scrollY > 140) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* chart data is memoised so charts are not rebuilt on every render */
  const charts = useMemo(() => {
    const a = analytics || {};
    const subj = a.subjects || [];
    const improv = a.improvementTrend || [];
    const diffTrend = a.difficultyTrend || [];
    const diffPerf = a.difficultyPerformance || [];
    return {
      subjectNames: subj.map((s) => s.subject),
      subjectAcc: subj.map((s) => s.accuracy),
      subjectCount: subj.map((s) => s.totalQuestions),
      improvData: improv.map((i) => i.accuracy),
      improvLabels: improv.map((i) => i.attempt),
      diffPerfData: diffPerf.map((d) => d.accuracy),
      diffPerfLabels: diffPerf.map((d) => String(d.difficulty || "").toUpperCase()),
      diffTrendData: diffTrend.map((d) => d.level),
      diffTrendLabels: diffTrend.map((d) => d.label),
    };
  }, [analytics]);

  const videoGroups = useMemo(() => {
    const vids = analytics?.recommendations?.videos || [];
    const grouped = vids.reduce((acc, v) => {
      (acc[v.topic] = acc[v.topic] || []).push(v);
      return acc;
    }, {});
    return Object.entries(grouped);
  }, [analytics]);

  /* questions answered per day (for today's goal ring and the week bars) */
  const week = useMemo(() => {
    const byDay = {};
    (analytics?.activity || []).forEach((a) => {
      const k = dayKey(a.date);
      byDay[k] = (byDay[k] || 0) + (a.count || 0);
    });
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      days.push({
        key: k,
        count: byDay[k] || 0,
        label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1),
        today: i === 0,
      });
    }
    return days;
  }, [analytics]);

  const changeGoal = (delta) => {
    setGoal((g) => {
      const next = Math.max(5, Math.min(100, g + delta));
      try { localStorage.setItem(GOAL_KEY, String(next)); } catch { /* storage can be blocked */ }
      return next;
    });
  };



  /* ───────────── loading / error ───────────── */
  if (loading) {
    return (
      <div className="db db-center">
        <div className="db-spinner" aria-hidden="true" />
        <p className="db-muted">Loading your dashboard…</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="db db-center">
        <div className="db-card db-error-card">
          <h3>We could not load your dashboard</h3>
          <p className="db-muted">{loadError || "No analytics found."}</p>
          <button
            type="button"
            className="db-btn db-btn--primary"
            onClick={() => { setLoading(true); fetchData(); }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  /* ───────────── derived values ───────────── */
  const stats = analytics.stats || {};
  const streak = analytics.streak || {};
  const rec = analytics.recommendations || {};
  const firstName = userProfile.fullname?.split(" ")[0] || "there";
  const visibleHistory = showAll ? quizHistory : quizHistory.slice(0, 10);

  const todayCount = week[week.length - 1]?.count || 0;
  const remaining = Math.max(0, goal - todayCount);
  const heroMsg =
    todayCount >= goal
      ? "Daily goal done. Anything extra today is a bonus."
      : streak.current > 0
      ? `${streak.current}-day streak going. ${remaining} more question${remaining === 1 ? "" : "s"} to hit today's goal.`
      : stats.totalAttempts
      ? `Answer ${remaining} question${remaining === 1 ? "" : "s"} today to start a new streak.`
      : "Take your first quiz and this page starts filling up with your progress.";

  const statCards = [
    { icon: Zap,          num: stats.totalAttempts || 0,   suffix: "",  lbl: "Questions answered" },
    { icon: Target,       num: stats.overallAccuracy || 0, suffix: "%", lbl: "Accuracy", bar: stats.overallAccuracy || 0 },
    { icon: CheckCircle2, num: stats.noHintRate || 0,      suffix: "%", lbl: "No-hint rate", bar: stats.noHintRate || 0, title: "Answers that were right without using a hint" },
    { icon: Flame,        num: streak.current || 0,        suffix: "",  lbl: "Day streak", note: `Best: ${streak.longest || 0}` },
  ];

  const facts = [
    { icon: Trophy,        lbl: "Strongest subject", val: performance?.strongSubject || "N/A", tone: "good" },
    { icon: Target,        lbl: "Needs work",        val: performance?.weakSubject || "N/A",   tone: "warn" },
    { icon: Flame,         lbl: "Longest streak",    val: `${streak.longest || 0} day${streak.longest === 1 ? "" : "s"}` },
    { icon: ClipboardList, lbl: "Quizzes taken",     val: quizHistory.length },
  ];

  const hasAiExtras = rec.weakTopics?.length > 0 || rec.strongTopics?.length > 0;

  /* ═════════════════════════════ RENDER ═════════════════════════════ */
  return (
    <div className="db">
      {/* ───────── SIDEBAR (becomes a tab bar on phones) ───────── */}
      <aside className="db-side">
        <div className="db-me">
          <img src={usericon} alt="" className="db-me-img" />
          <span className="db-me-txt">
            <b>{userProfile.fullname || "Student"}</b>
            <span>@{userProfile.username || "username"}</span>
          </span>
        </div>

        <nav className="db-menu" aria-label="Dashboard sections">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = view === n.id;
            return (
              <button
                key={n.id}
                type="button"
                className={`db-item ${on ? "on" : ""}`}
                onClick={() => go(n.id)}
                aria-current={on ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{n.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="db-streak" title="Your current daily streak">
          <span className="db-streak-flame"><Flame size={18} /></span>
          <span className="db-streak-txt">
            <b><CountUp value={streak.current || 0} /></b>
            <span>day streak</span>
          </span>
        </div>
      </aside>

      {/* ───────── CONTENT ───────── */}
      <main className="db-content">
        <div className="db-view" key={view}>

          {/* ═════ OVERVIEW ═════ */}
          {view === "overview" && (
            <>
              <header className="db-top">
                <div className="db-top-main">
                  <p className="db-eyebrow">
                    {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                  </p>
                  <h1 className="db-title">{greeting()},<br /><em>{firstName}</em></h1>
                  <p className="db-lede">{heroMsg}</p>
                </div>
                <div className="db-top-cta">
                  <button type="button" className="db-btn db-btn--primary db-btn--lg" onClick={() => navigate("/quiz")}>
                    <Play size={17} /> Start a quiz
                  </button>
                  {quizHistory[0] && (
                    <button type="button" className="db-btn db-btn--ghost db-btn--lg" onClick={() => navigate(`/quiz-review/${quizHistory[0]._id}`)}>
                      Review last
                    </button>
                  )}
                </div>
              </header>

              <Rule>At a glance</Rule>
              <div className="db-bento">
                {/* today's goal */}
                <section className="db-card db-goal" aria-label="Today's goal">
                  <div className="db-goal-head">
                    <span className="db-label">Today's goal</span>
                    <span className="db-stepper">
                      <button type="button" onClick={() => changeGoal(-5)} aria-label="Lower daily goal" disabled={goal <= 5}><Minus size={13} /></button>
                      <b>{goal}</b>
                      <button type="button" onClick={() => changeGoal(5)} aria-label="Raise daily goal" disabled={goal >= 100}><Plus size={13} /></button>
                    </span>
                  </div>

                  <OrbitRing value={todayCount} max={goal} size={150}>
                    <span className="db-goal-num"><CountUp value={todayCount} /><small>/{goal}</small></span>
                    <span className="db-goal-lbl">questions</span>
                  </OrbitRing>

                  <div className="db-wk" aria-label="Last 7 days">
                    {week.map((d) => {
                      const h = d.count ? Math.max(16, Math.min(100, (d.count / goal) * 100)) : 6;
                      return (
                        <div
                          key={d.key}
                          className={`db-wk-col ${d.today ? "today" : ""} ${d.count ? "on" : ""} ${d.count >= goal ? "hit" : ""}`}
                          title={`${d.key} · ${d.count} questions`}
                        >
                          <span className="db-wk-bar"><i style={{ height: `${h}%` }} /></span>
                          <span className="db-wk-lbl">{d.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* headline numbers */}
                <section className="db-stats" aria-label="Your numbers">
                  {statCards.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div className="db-card db-stat" key={s.lbl} title={s.title}>
                        <span className="db-stat-icon"><Icon size={16} /></span>
                        <span className="db-stat-num"><CountUp value={s.num} suffix={s.suffix} /></span>
                        <span className="db-stat-lbl">{s.lbl}</span>
                        {s.bar !== undefined && <span className="db-bar"><i style={{ width: `${Math.min(100, s.bar)}%` }} /></span>}
                        {s.note && <span className="db-stat-note">{s.note}</span>}
                      </div>
                    );
                  })}
                </section>
              </div>

              <Rule>Up next</Rule>
              <div className="db-stack">
                <AssignedWork />
                <LearningPanel learning={analytics.learning} />
              </div>
            </>
          )}

          {/* ═════ PROGRESS ═════ */}
          {view === "progress" && (
            <>
              <ViewHead id="progress" />
              <div className="db-stack">
                <div className="db-facts">
                  {facts.map((t) => {
                    const Icon = t.icon;
                    return (
                      <div className={`db-fact ${t.tone ? `db-fact--${t.tone}` : ""}`} key={t.lbl}>
                        <span className="db-fact-lbl"><Icon size={14} /> {t.lbl}</span>
                        <span className="db-fact-val">{t.val}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="db-card">
                  <div className="db-card-head">
                    <h3>Your year in questions</h3>
                    <span className="db-pill">{stats.totalAttempts || 0} submissions</span>
                  </div>
                  <Reveal minHeight={200} lift><StreakHeatmap activity={analytics.activity || []} /></Reveal>
                </div>

                <div className="db-grid">
                  <ChartCard title="Improvement trend" tag="Accuracy over attempts" span={8} empty={!charts.improvData.length}>
                    <AnalyticsChart type="line" data={charts.improvData} labels={charts.improvLabels} max={100} suffix="%" height={290} />
                  </ChartCard>

                  {charts.subjectAcc.length >= 3 ? (
                    <ChartCard title="Subject web" tag="Accuracy" span={4} empty={!charts.subjectAcc.length}>
                      <AnalyticsChart type="radar" data={charts.subjectAcc} labels={charts.subjectNames} max={100} height={290} />
                    </ChartCard>
                  ) : (
                    <ChartCard title="Accuracy per subject" tag="Accuracy" span={4} empty={!charts.subjectAcc.length}>
                      <AnalyticsChart type="bar" data={charts.subjectAcc} labels={charts.subjectNames} max={100} suffix="%" height={290} />
                    </ChartCard>
                  )}

                  <ChartCard title="Subject split" tag="Questions per subject" span={4} empty={!charts.subjectCount.length}>
                    <AnalyticsChart type="doughnut" data={charts.subjectCount} labels={charts.subjectNames} height={270} />
                  </ChartCard>

                  <ChartCard title="By difficulty" tag="Accuracy" span={4} empty={!charts.diffPerfData.length}>
                    <AnalyticsChart type="bar" data={charts.diffPerfData} labels={charts.diffPerfLabels} max={100} suffix="%" height={270} />
                  </ChartCard>

                  <ChartCard title="Difficulty progression" tag="Level over time" span={4} empty={!charts.diffTrendData.length}>
                    <AnalyticsChart type="line" data={charts.diffTrendData} labels={charts.diffTrendLabels} height={270} />
                  </ChartCard>
                </div>
              </div>
            </>
          )}

          {/* ═════ FEEDBACK ═════ */}
          {view === "feedback" && (
            <>
              <ViewHead id="feedback" />
              <div className="db-grid">
                <div className={`db-card db-ai ${videoGroups.length ? "db-span-5" : "db-span-12"}`}>
                  <span className="db-ai-badge"><Sparkles size={13} /> AI feedback</span>
                  <p className="db-ai-msg">{rec.message || "No insights yet. Answer a few questions and feedback will appear here."}</p>

                  {hasAiExtras && (
                    <div className={`db-topic-groups ${videoGroups.length ? "" : "db-topic-groups--row"}`}>
                      {rec.weakTopics?.length > 0 && (
                        <div>
                          <p className="db-label">Focus areas</p>
                          <div className="db-chips">
                            {rec.weakTopics.map((t, i) => <span key={i} className="db-chip db-chip--weak">{t}</span>)}
                          </div>
                        </div>
                      )}
                      {rec.strongTopics?.length > 0 && (
                        <div>
                          <p className="db-label">Strengths</p>
                          <div className="db-chips">
                            {rec.strongTopics.map((t, i) => <span key={i} className="db-chip db-chip--strong">{t}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {videoGroups.length > 0 && (
                  <div className="db-card db-span-7 db-videos">
                    <div className="db-card-head">
                      <h3>Watch to improve</h3>
                      <span className="db-pill">{videoGroups.length} topic{videoGroups.length === 1 ? "" : "s"}</span>
                    </div>
                    {videoGroups.map(([topic, vids]) => (
                      <div key={topic} className="db-vblock">
                        <p className="db-vtopic">{topic}</p>
                        <div className="db-vgrid">
                          {vids.map((v, i) => (
                            <a key={i} href={v.url} target="_blank" rel="noreferrer" className="db-vcard">
                              <span className="db-vthumb">
                                <img src={v.thumbnail} alt="" loading="lazy" />
                                <span className="db-vplay"><Play size={15} /></span>
                              </span>
                              <p>{v.title}</p>
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═════ HISTORY ═════ */}
          {view === "history" && (
            <>
              <ViewHead id="history" />
              {quizHistory.length === 0 ? (
                <div className="db-card db-empty-card">
                  <p className="db-empty-note">No quizzes yet. Your finished quizzes will be listed here.</p>
                  <button type="button" className="db-btn db-btn--primary" onClick={() => navigate("/quiz")}>
                    Take your first quiz
                  </button>
                </div>
              ) : (
                <div className="db-stack">
                  <div className="db-hlist">
                    {visibleHistory.map((quiz, idx) => {
                      const pct = quiz.accuracy ?? 0;
                      const tier = pct >= 75 ? "high" : pct >= 50 ? "mid" : "low";
                      const date = fmtDate(quiz.createdAt || quiz.date);
                      return (
                        <button
                          type="button"
                          key={quiz._id}
                          className="db-hrow"
                          onClick={() => navigate(`/quiz-review/${quiz._id}`)}
                        >
                          <ScoreRing pct={pct} tier={tier} />
                          <span className="db-hmain">
                            <b>{quiz.subject}</b>
                            <span className="db-hsub">{quiz.topic || "Mixed topics"}</span>
                          </span>
                          <span className="db-hscore">{quiz.correctAnswers}/{quiz.totalQuestions}</span>
                          <span className="db-hdate">{date || `#${quizHistory.length - idx}`}</span>
                          <span className="db-hgo"><ArrowRight size={16} /></span>
                        </button>
                      );
                    })}
                  </div>

                  {quizHistory.length > 10 && (
                    <button type="button" className="db-btn db-btn--ghost db-more" onClick={() => setShowAll((s) => !s)}>
                      {showAll ? "Show fewer" : `Show all ${quizHistory.length}`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

                    {/* ═════ CLASSES ═════ */}
          {view === "classes" && (
            <>
              <ViewHead id="classes" />
              <JoinClass />
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;