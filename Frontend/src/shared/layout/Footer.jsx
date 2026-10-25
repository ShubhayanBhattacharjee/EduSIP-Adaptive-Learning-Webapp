import React from "react";
import "./Footer.css";

const Footer = () => {
  return (
    <footer className="footer">

      <div className="footer-container">

        <div className="footer-left">
          <h3>EduSip</h3>
          <p>AI Powered Learning Platform</p>
        </div>

        <div className="footer-links">
          <a href="/">Home</a>
          <a href="/quiz">Quiz</a>
          <a href="/dashboard">Dashboard</a>
          <a href="#team">Team</a>
        </div>

        <div className="footer-right">
          <p>© 2026 Edusip</p>
          <p>KIIT University Project</p>
        </div>

      </div>

    </footer>
  );
};

export default Footer;