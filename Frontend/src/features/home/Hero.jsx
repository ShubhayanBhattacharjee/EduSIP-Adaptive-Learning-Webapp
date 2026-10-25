import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import demoVideo from "../../assets/demo.mp4";
// import React, { useRef } from "react";
import "./Hero.css";

/* ─── DATA ─── */
const TYPING_PHRASES = [
  "Sip knowledge & Level Up.",
  "Study smarter. Not harder.",
];

const FEATURES = [
  {
    tag: "AI",
    tagClass: "tag-ai",
    icon: "🧠",
    title: "Smart Difficulty Scaling",
    desc: "Too easy? It challenges you. Too hard? It adapts instantly — keeping you in the perfect learning zone.",
  },
  {
    tag: "Analytics",
    tagClass: "tag-analytics",
    icon: "📊",
    title: "Performance Insights",
    desc: "Track accuracy, speed, and improvement with intelligent analytics built for real growth.",
  },
  {
    tag: "Speed",
    tagClass: "tag-speed",
    icon: "⚡",
    title: "Instant Feedback",
    desc: "Know your mistakes immediately and correct them before they become habits.",
  },
  {
    tag: "Brain",
    tagClass: "tag-brain",
    icon: "🎯",
    title: "Focused Practice",
    desc: "Practice only what matters — no repetition, no wasted effort.",
  },
  {
    tag: "Security",
    tagClass: "tag-security",
    icon: "🔒",
    title: "Reliable System",
    desc: "Fast, stable, and built to handle real-time adaptive learning at scale.",
  },
  {
    tag: "Security",
    tagClass: "tag-security",
    icon: "🛡️",
    title: "Anti-Cheating System",
    desc: "Advanced behavioral monitoring detects suspicious patterns and ensures every assessment reflects your true performance.",
  },
];

const TESTIMONIALS = [
  {
    name: "Rahul M.",
    role: "JEE Aspirant",
    text: "EduSip rewired how I study. It's the first app that actually felt like it knew my gaps.",
    img: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    name: "Ananya S.",
    role: "NEET Preparer",
    text: "Feels like Netflix for learning — you just keep going. My biology scores jumped 23%.",
    img: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    name: "Arjun K.",
    role: "CS, IIT",
    text: "The AI tutor caught patterns in my mistakes I hadn't noticed in two years of studying.",
    img: "https://randomuser.me/api/portraits/men/76.jpg",
  },
];

/* ─── PARTICLE CANVAS (inside mockup) ─── */
const ParticleCanvas = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      r: Math.random() * 1.8 + 0.5,
    }));
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,77,109,0.85)";
        ctx.shadowColor = "rgba(255,77,109,0.5)";
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x,
            dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 85) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(255,77,109,${(1 - d / 85) * 0.3})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} className="mockup-particle-canvas" />;
};

/* ─── BROWSER MOCKUP with parallax tilt ─── */
const BrowserMockup = () => {
  const wrapRef = useRef(null);
  const deviceRef = useRef(null);
  const rafRef = useRef(null);
  const targetRot = useRef({ x: 0, y: 0 });
  const currentRot = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e) => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      targetRot.current = {
        x:
          ((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)) *
          -7,
        y: ((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)) * 9,
      };
    };
    const onLeave = () => {
      targetRot.current = { x: 0, y: 0 };
    };
    const loop = () => {
      const lerp = (a, b, t) => a + (b - a) * t;
      currentRot.current.x = lerp(
        currentRot.current.x,
        targetRot.current.x,
        0.055,
      );
      currentRot.current.y = lerp(
        currentRot.current.y,
        targetRot.current.y,
        0.055,
      );
      if (deviceRef.current)
        deviceRef.current.style.transform = `perspective(1200px) rotateX(${currentRot.current.x}deg) rotateY(${currentRot.current.y}deg)`;
      rafRef.current = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="mockup-outer" ref={wrapRef}>
      {/* Handwritten annotations */}
      <div className="hw-annot hw-left">
        <span className="hw-text">
          Generate adaptive
          <br />
          quizzes instantly
        </span>
        <svg className="hw-arrow" viewBox="0 0 70 50" fill="none">
          <path
            d="M8 8 Q35 6 62 44"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          <polygon points="57,41 65,48 56,44" fill="currentColor" />
        </svg>
      </div>
      <div className="hw-annot hw-right">
        <svg className="hw-arrow hw-arrow-flip" viewBox="0 0 70 50" fill="none">
          <path
            d="M62 8 Q35 6 8 44"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          <polygon points="13,41 5,48 14,44" fill="currentColor" />
        </svg>
        <span className="hw-text">
          Track scores &amp;
          <br />
          AI insights live
        </span>
      </div>

      <div className="mockup-device" ref={deviceRef}>
        {/* Particle canvas as bg */}
        <ParticleCanvas />

        {/* Chrome topbar */}
        <div className="m-chrome">
          <div className="m-traffic">
            <span className="m-dot m-red" />
            <span className="m-dot m-yellow" />
            <span className="m-dot m-green" />
          </div>
          <div className="m-brand">
            <span className="m-spark">✦</span>
            <span className="m-brand-name">EduSip AI</span>
            <span className="m-beta">Beta v1.0</span>
            <span className="m-back">↩</span>
            <span className="m-fwd">↪</span>
          </div>
          <div className="m-chrome-right">
            <span className="m-cbtn">▷</span>
            <span className="m-cbtn">❤</span>
            <span className="m-cbtn m-code">⟨⟩</span>
            <span className="m-cbtn m-share">↑ Share</span>
            <span className="m-cbtn m-publish">Publish ▾</span>
            <span className="m-avatar">RS</span>
          </div>
        </div>

        {/* App layout */}
        <div className="m-app">
          {/* Sidebar */}
          <div className="m-sidebar">
            <div className="m-logo">✦</div>
            <div className="m-nav active">
              ⊞<em>Subjects</em>
            </div>
            <div className="m-nav">
              ◎<em>AI Tutor</em>
            </div>
            <div className="m-nav">
              📊<em>Analytics</em>
            </div>
            <div className="m-nav">
              ⭐<em>Favorites</em>
            </div>
            <div className="m-nav m-quality">
              ✓<em>Quality</em>
            </div>
            <div className="m-spacer" />
            <div className="m-nav">
              ⊙<em>Settings</em>
            </div>
            <div className="m-nav m-clear">
              ✕<em>Clear</em>
            </div>
          </div>

          {/* AI prompt panel */}
          <div className="m-ai-panel">
            <div className="m-aip-header">
              <span>How can I help?</span>
              <span className="m-aip-new">✦ Start new</span>
              <span className="m-aip-x">✕</span>
            </div>
            <div className="m-aip-body">
              <div className="m-aip-msg">
                <span className="m-aip-icon">✦</span>
                <p>
                  Generate an adaptive quiz on Thermodynamics based on your weak
                  areas and recent errors.
                </p>
              </div>
              <div className="m-aip-chips">
                <span>More creative</span>
                <span>Hover effect</span>
                <span>Improve layout</span>
              </div>
            </div>
            <button className="m-aip-btn">✦ Ask modification</button>
          </div>

          {/* Main dashboard */}
          <div className="m-main">
            <div className="m-main-hdr">
              <span>Dashboard</span>
              <button className="m-add">+ Add Item</button>
            </div>
            <div className="m-kpi-row">
              <div className="m-kpi" style={{ background: "var(--accent)" }}>
                <span className="m-kpi-label">Physics</span>
                <span className="m-kpi-val">87%</span>
              </div>
              <div className="m-kpi" style={{ background: "#0d9488" }}>
                <span className="m-kpi-label">Chemistry</span>
                <span className="m-kpi-val">74%</span>
              </div>
              <div className="m-kpi m-kpi-dashed">
                <span className="m-kpi-label" style={{ opacity: 0.4 }}>
                  Item 3
                </span>
                <span className="m-kpi-plus">＋</span>
              </div>
            </div>
            <div className="m-row2">
              <div className="m-box">
                <span className="m-box-title">Chart</span>
                <div className="m-bars">
                  {[28, 50, 40, 68, 55, 80, 62].map((h, i) => (
                    <div
                      key={i}
                      className="m-bar"
                      style={{
                        height: `${h}%`,
                        animationDelay: `${i * 0.07}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="m-box">
                <span className="m-box-title">Notifications</span>
                <p className="m-notif">📌 New quiz unlocked: Optics</p>
                <p className="m-notif">✅ Score improved by 12%</p>
                <p className="m-notif">⚡ AI recalibrated your plan</p>
              </div>
            </div>
            <div className="m-row2">
              <div className="m-box">
                <span className="m-box-title">Performance</span>
                <svg viewBox="0 0 100 36" style={{ width: "100%", height: 32 }}>
                  <polyline
                    points="0,32 20,25 40,18 60,12 80,6 100,1"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                  />
                  <polyline
                    points="0,32 20,25 40,18 60,12 80,6 100,1 100,36 0,36"
                    fill="rgba(255,77,109,0.1)"
                  />
                </svg>
              </div>
              <div className="m-box">
                <span className="m-box-title">Tasks</span>
                <p className="m-notif">◻ Complete 10 MCQs – Physics</p>
                <p className="m-notif">◻ Review wrong answers</p>
                <p className="m-notif">◻ Watch: Organic Chemistry</p>
              </div>
            </div>
          </div>

          {/* Right config panel */}
          <div className="m-right">
            <div className="m-rp-row">
              <span className="m-rp-label">Select theme</span>
              <div className="m-rp-select">Custom ▾</div>
            </div>
            <div className="m-rp-row">
              <span className="m-rp-label">Colors</span>
              <div className="m-color-chips">
                <span className="m-cc" style={{ background: "var(--accent)" }}>
                  <span className="m-cc-label">Primary</span>
                </span>
                <span className="m-cc" style={{ background: "#f5f5f5" }}>
                  <span className="m-cc-label" style={{ color: "#333" }}>
                    Neutral
                  </span>
                </span>
              </div>
              <div className="m-extra-colors">
                <span style={{ background: "#e11d48" }} />
                <span style={{ background: "#2563eb" }} />
                <span style={{ background: "#0d9488" }} />
                <span style={{ background: "#7c3aed" }} />
                <span className="m-ec-more">+10</span>
              </div>
            </div>
            <div className="m-rp-row">
              <span className="m-rp-label">Font</span>
              <div className="m-rp-select">Poppins ▾</div>
            </div>
            <div className="m-rp-row">
              <span className="m-rp-label">Spacing</span>
              <div className="m-slider">
                <div className="m-slider-fill" />
              </div>
            </div>
          </div>
        </div>

        {/* Floating collaborator labels */}
        <div className="fl-label fl-daniel">Daniel</div>
        <div className="fl-label fl-you">You</div>

        {/* Bottom bar */}
        <div className="m-footer">
          <span>▲ Code editor</span>
          <div className="m-footer-right">
            <button className="m-zoom-btn">+</button>
            <span>64%</span>
            <button className="m-zoom-btn">−</button>
            <span className="m-footer-brand">by EduSip ✦</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── HERO PAGE ─── */
const Hero = () => {
  const location = useLocation();
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef(null);
  useEffect(() => {
    const els = document.querySelectorAll(".feature");

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("feature-visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setShowVideo(false);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  useEffect(() => {
    const phrase = TYPING_PHRASES[phraseIdx];
    let to;
    if (!deleting && typed.length < phrase.length) {
      to = setTimeout(() => setTyped(phrase.slice(0, typed.length + 1)), 44);
    } else if (!deleting && typed.length === phrase.length) {
      to = setTimeout(() => setDeleting(true), 2000);
    } else if (deleting && typed.length > 0) {
      to = setTimeout(() => setTyped(typed.slice(0, -1)), 24);
    } else {
      setDeleting(false);
      setPhraseIdx((i) => (i + 1) % TYPING_PHRASES.length);
    }
    return () => clearTimeout(to);
  }, [typed, deleting, phraseIdx]);

  useEffect(() => {
    if (location.state?.scrollTo) {
      const el = document.getElementById(location.state.scrollTo);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [location]);

  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className="edu-root"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.7s ease" }}
    >
      {/* ═══ HERO ═══ */}
      <section className="edu-hero">
        <div className="edu-grid-bg" />

        <div className="edu-hero-text reveal">
          <h1 className="edu-headline">
            Learn like you were <span className="edu-highlight">born</span> for
            it.
          </h1>
          <p className="edu-sub">
            {typed}
            <span className="edu-cursor" />
          </p>
          <div className="edu-cta-row">
            <button
              className="edu-btn-primary"
              onClick={() => (window.location.href = "/login")}
            >
              Start for free
            </button>
            <button
              className="edu-btn-ghost"
              onClick={() => setShowVideo(true)}
            >
              Watch demo ▶
            </button>
          </div>
        </div>

        <div className="edu-mockup-zone reveal">
          <BrowserMockup />
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="features" id="features">
        <div className="features-heading">
          <span className="line"></span>
          <h2 className="features-title">Why Choose EduSip</h2>
          <span className="line"></span>
        </div>

        <p className="features-subtext">
          It’s not just practice. <span>It adapts to you.</span>
        </p>

        <div className="feature-grid">
          {/* 🔥 MAIN USP CARD */}
          <div className="feature feature-main">
            <div className="split-card">
              {/* LEFT: USER SIDE */}
              <div className="split-left">
                <p className="mini-title">You</p>

                <div className="question correct">
                  Q: 2 + 2 = ?<span>4 ✓</span>
                </div>

                <div className="question wrong">
                  Q: 12 × 13 = ?<span>156 ✕</span>
                </div>
              </div>

              {/* RIGHT: AI SIDE */}
              <div className="split-right">
                <p className="mini-title">EduSip AI</p>

                <div className="ai-action">⬆ Difficulty Increased</div>
                <div className="ai-action down">⬇ Difficulty Adjusted</div>

                <p className="ai-note">
                  Questions adapt instantly based on your performance.
                </p>
              </div>
            </div>

            <h3>Real-Time Adaptive Engine</h3>
            <p>
              Every question is chosen for you — in real time. Struggle less,
              learn faster.
            </p>
          </div>

          {/* 🔹 OTHER FEATURES */}
          {FEATURES.map((f, i) => (
            <div className={`feature ${f.tagClass}`} key={i}>
              <span className={`feature-tag ${f.tagClass}`}>{f.tag}</span>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="edu-how reveal" id="how-it-works">
        <div className="edu-heading">
          <span className="line"></span>
          <h2 className="edu-section-h2">Four steps to mastery</h2>
          <span className="line"></span>
        </div>
        <div className="edu-steps">
          {[
            {
              n: "1",
              title: "Create your account",
              desc: "Sign up in 30 seconds. No credit card required.",
            },
            {
              n: "2",
              title: "Pick your subject",
              desc: "Choose from 20+ topics across science, math, and tech.",
            },
            {
              n: "3",
              title: "AI calibrates to you",
              desc: "Our model assesses your baseline and adapts each question.",
            },
            {
              n: "4",
              title: "Watch scores climb",
              desc: "Track your progress in real-time with rich analytics.",
            },
          ].map((s, i) => (
            <div className="edu-step" key={i}>
              <div className="edu-step-n">{s.n}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ VIDEO ═══ */}
      <section className="video-preview">
        <p>Watch a quick demo of how our AI-powered learning platform works.</p>
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="demo-video"
          onMouseEnter={() => {
            if (videoRef.current) videoRef.current.muted = false;
          }}
          onMouseLeave={() => {
            if (videoRef.current) videoRef.current.muted = true;
          }}
        >
          <source src={demoVideo} type="video/mp4" />
        </video>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="testimonials" id="testimonials">
        <div className="testimonials-title-wrapper">
          <span className="line"></span>
          <h2>What Students Say</h2>
          <span className="line"></span>
        </div>

        <div className="testimonial-grid reveal">
          {TESTIMONIALS.map((t, i) => (
            <div className="testimonial glass" key={i}>
              <img src={t.img} alt={t.name} />
              <p>"{t.text}"</p>
              <h4>{t.name}</h4>
              <span className="testi-role">{t.role}</span>
            </div>
          ))}
        </div>
      </section>

      {showVideo && (
        <div
          className="video-modal"
          onClick={() => setShowVideo(false)} // click outside closes
        >
          <div
            className="video-content"
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
          >
            <button className="close-btn" onClick={() => setShowVideo(false)}>
              ✖
            </button>

            <video controls autoPlay className="modal-video">
              <source src={demoVideo} type="video/mp4" />
            </video>
          </div>
        </div>
      )}
    </div>
  );
};

export default Hero;
