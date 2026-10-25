import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { Sun, Moon, Menu } from "lucide-react";
import logo from "../../assets/logo.png";
import "./Navbar.css";

const Navbar = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setMenuOpen(false);
  };
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScrollEffect = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScrollEffect);
    return () => window.removeEventListener("scroll", handleScrollEffect);
  }, []);
  // ✅ FIXED SCROLL FUNCTION
  const handleScroll = (id) => {
    if (window.location.pathname !== "/") {
      navigate("/", { state: { scrollTo: id } });
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
    setMenuOpen(false);
  };

  return (
    <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
      {/* LEFT LOGO */}
      <div className="nav-left">
        <img src={logo} alt="EduSip" className="nav-logo" />
      </div>

      {/* CENTER PILL */}
      <div className="nav-pill">
        <NavLink to="/" className="nav-item">
          Home
        </NavLink>

        {/* ✅ FIXED */}
        {user?.role === "student" && (
          <NavLink to="/quiz" className="nav-item">
            Quiz
          </NavLink>
        )}

        {user?.role === "student" && (
          <NavLink to="/dashboard" className="nav-item">
            Dashboard
          </NavLink>
        )}

        {user?.role === "admin" && (
          <NavLink to="/admin/analytics" className="nav-item">
            Admin
          </NavLink>
        )}
        {user?.role === "teacher" && (
          <NavLink to="/teacher" className="nav-item">Classes</NavLink>
        )}
        <span className="nav-item" onClick={() => handleScroll("team")}>
          Contact
        </span>
      </div>

      {/* RIGHT SIDE */}
      <div className="nav-right">
        {/* THEME */}
        <div className="theme-section">
          <Sun size={18} className={!isDarkMode ? "icon-active" : "icon-dim"} />

          <div
            className={`theme-toggle ${isDarkMode ? "dark" : ""}`}
            onClick={toggleTheme}
          >
            <div className="toggle-circle"></div>
          </div>

          <Moon size={18} className={isDarkMode ? "icon-active" : "icon-dim"} />
        </div>

        {/* AUTH */}
        {!user ? (
          <>
            <button className="nav-btn" onClick={() => navigate("/login")}>
              Login
            </button>

            <button className="nav-cta" onClick={() => navigate("/register")}>
              Register
            </button>
          </>
        ) : (
          <button className="nav-cta" onClick={handleLogout}>
            Logout
          </button>
        )}

        {/* HAMBURGER */}
        <div className="hamburger" onClick={() => setMenuOpen(true)}>
          <Menu size={28} />
        </div>
      </div>

      {/* MOBILE PANEL */}
      <div className={`mobile-panel ${menuOpen ? "open" : ""}`}>
        <div className="mobile-close" onClick={() => setMenuOpen(false)}>
          CLOSE ✕
        </div>

        <div className="mobile-links">
          <NavLink to="/" onClick={() => setMenuOpen(false)}>
            HOME
          </NavLink>

          {/* ✅ FIXED */}
          {user?.role === "student" && (
            <NavLink to="/quiz" onClick={() => setMenuOpen(false)}>
              QUIZ
            </NavLink>
          )}
          {user?.role === "student" && (
            <NavLink to="/dashboard" onClick={() => setMenuOpen(false)}>
              DASHBOARD
            </NavLink>
          )}

          {user?.role === "admin" && (
            <NavLink to="/admin/analytics" onClick={() => setMenuOpen(false)}>
              ADMIN
            </NavLink>
          )}

          {user?.role === "teacher" && (
            <NavLink to="/teacher" className="nav-item">Classes</NavLink>
          )}
          <span onClick={() => handleScroll("team")}>CONTACT</span>
        </div>

        <div className="mobile-auth">
          {!user ? (
            <>
              <button onClick={() => { navigate("/login"); setMenuOpen(false); }}>Login</button>
              <button className="primary" onClick={() => { navigate("/register"); setMenuOpen(false); }}>Register</button>
            </>
          ) : (
            <button className="primary" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
