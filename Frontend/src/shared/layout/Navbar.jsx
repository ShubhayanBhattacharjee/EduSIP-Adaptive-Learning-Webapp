import React, { useState, useEffect, useRef } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { Sun, Moon, Menu, ChevronDown } from "lucide-react";
import logo from "../../assets/logo.png";
import "./Navbar.css";

const Navbar = () => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef(null);

  // close the account menu on outside click or Esc
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e) => { if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setAcctOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [acctOpen]);
  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
    closeMenu();
    setAcctOpen(false);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Esc closes the mobile menu
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  

  const isStaff = ["admin", "superadmin"].includes(user?.role);

  return (
    <>
      <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-left">
          <Link to="/" aria-label="EduSip home">
            <img src={logo} alt="EduSip" className="nav-logo" />
          </Link>
        </div>

        <div className="nav-pill">
          <NavLink to="/" end className="nav-item">Home</NavLink>
          {user?.role === "student" && <NavLink to="/quiz" className="nav-item">Quiz</NavLink>}
          {user?.role === "student" && <NavLink to="/dashboard" className="nav-item">Dashboard</NavLink>}
          {isStaff && <NavLink to="/admin/analytics" className="nav-item">Admin</NavLink>}
          {user?.role === "teacher" && <NavLink to="/teacher" className="nav-item">Classes</NavLink>}
          {/* <span className="nav-item" role="button" tabIndex={0}
            onClick={() => handleScroll("team")}
            onKeyDown={(e) => { if (e.key === "Enter") handleScroll("team"); }}>
            Contact
          </span> */}
        </div>

        <div className="nav-right">
          <div className="theme-section">
            <Sun size={18} className={!isDarkMode ? "icon-active" : "icon-dim"} aria-hidden="true" />
            <button type="button" role="switch" aria-checked={isDarkMode} aria-label="Dark mode"
              className={`theme-toggle ${isDarkMode ? "dark" : ""}`} onClick={toggleTheme}>
              <span className="toggle-circle" />
            </button>
            <Moon size={18} className={isDarkMode ? "icon-active" : "icon-dim"} aria-hidden="true" />
          </div>

          {!user ? (
            <>
              <button className="nav-btn" onClick={() => navigate("/login")}>Log in</button>
              <button className="nav-cta" onClick={() => navigate("/register")}>Register</button>
            </>
                    ) : (
            <div className="nav-acct" ref={acctRef}>
              <button type="button" className="nav-cta nav-acct-btn" aria-haspopup="menu"
                aria-expanded={acctOpen} onClick={() => setAcctOpen((o) => !o)}>
                Profile <ChevronDown size={15} className={acctOpen ? "chev open" : "chev"} />
              </button>
              {acctOpen && (
                <div className="nav-menu" role="menu">
                  <div className="nav-menu-head">
                    <b>{user.fullname}</b>
                    <span>{user.email}</span>
                  </div>
                  <button type="button" role="menuitem" className="nav-menu-item"
                    onClick={() => { setAcctOpen(false); navigate("/profile"); }}>You</button>
                  <button type="button" role="menuitem" className="nav-menu-item danger"
                    onClick={handleLogout}>Log out</button>
                </div>
              )}
            </div>
          )}

          <button type="button" className="hamburger"aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu size={26} />
          </button>
        </div>
      </nav>

      {/* MOBILE PANEL — outside <nav> so backdrop-filter on the navbar can't break it */}
      <div className={`mobile-backdrop ${menuOpen ? "open" : ""}`} onClick={closeMenu} />
      <div className={`mobile-panel ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        <button type="button" className="mobile-close" onClick={closeMenu}>Close</button>

        <div className="mobile-links">
          <NavLink to="/" end onClick={closeMenu}>Home</NavLink>
          {user?.role === "student" && <NavLink to="/quiz" onClick={closeMenu}>Quiz</NavLink>}
          {user?.role === "student" && <NavLink to="/dashboard" onClick={closeMenu}>Dashboard</NavLink>}
          {isStaff && <NavLink to="/admin/analytics" onClick={closeMenu}>Admin</NavLink>}
          {user?.role === "teacher" && <NavLink to="/teacher" onClick={closeMenu}>Classes</NavLink>}
          {/* <span onClick={() => handleScroll("team")}>Contact</span> */}
        </div>

        <div className="mobile-auth">
          {!user ? (
            <>
              <button onClick={() => { navigate("/login"); closeMenu(); }}>Log in</button>
              <button className="primary" onClick={() => { navigate("/register"); closeMenu(); }}>Register</button>
            </>
          ) : (
                        <>
              <button onClick={() => { navigate("/profile"); closeMenu(); }}>You</button>
              <button className="primary" onClick={handleLogout}>Log out</button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default Navbar;