import React from "react";
import "./TeamSection.css";
import logo from "../../assets/logo.png";
const TeamSection = () => {
  const teamMembers = [
    {
      name: "Priyangshu Saha",
      roll: "23051446",
      email: "23051446@kiit.ac.in",
      role: "AI/ML",
    },
    {
      name: "Saarnab Bishayee",
      roll: "23051457",
      email: "23051457@kiit.ac.in",
      role: "AI/ML",
    },
    {
      name: "Akashdeep Sengupta",
      roll: "23052862",
      email: "23052862@kiit.ac.in",
      role: "Anti-Cheat",
    },
    {
      name: "Trayambak Sarkar",
      roll: "23052443",
      email: "23052443@kiit.ac.in",
      role: "Frontend",
    },
    {
      name: "Shubham Chaudhary",
      roll: "23053304",
      email: "23053304@kiit.ac.in",
      role: "Frontend",
    },
    {
      name: "Shubhayan Bhattacharjee",
      roll: "2305574",
      email: "2305574@kiit.ac.in",
      role: "Full Stack",
    },
  ];

  return (
    <section className="team" id="team">
      {/* Translucent line */}
      <div className="team-line"></div>

      {/* EDUSIP section */}
      <div className="edusip-section">
        {/* EDUSIP with lines on both sides */}
        <div className="edusip-line-wrapper">
          <span className="edusip-line"></span>
          <img src={logo} alt="EduSip" className="edusip-logo" />
          <span className="edusip-line"></span>
        </div>
        <p className="edusip-subtitle">Sip the knowledge</p>


        {/* Blue button that opens Gmail */}
        <a
          href="mailto:info@edusip.com?subject=Inquiry%20from%20Website&body=Hello%20Edusip%2C%0A%0AI%20would%20like%20to%20get%20in%20touch%20with%20you."
          className="get-in-touch"
        >
          Get in Touch
        </a>

        <p className="contact-info">
          Email: info@edusip.com | Phone: +91 98765 43210
        </p>
      </div>

      {/* <h2>Meet Our Team</h2> */}

      <div className="team-grid">
        {teamMembers.map((member, index) => (
          <div key={index} className="team-card">
            <div className="team-icon">👨‍💻</div>
            <h3>{member.name}</h3>
            <span
              className={`role-tag ${member.role.toLowerCase().replace(/\s/g, "-")}`}
            >
              {member.role}
            </span>
            <p className="team-roll">{member.roll}</p>
            <p className="team-email">{member.email}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TeamSection;
