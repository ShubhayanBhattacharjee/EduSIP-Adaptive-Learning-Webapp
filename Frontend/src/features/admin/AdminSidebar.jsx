import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3, ClipboardCheck, Cpu, Database, Layers, Plus, School, ScrollText,
  ServerCog, Settings, ShieldCheck, Sparkles, Target, UserCog, Users,
} from "lucide-react";
import adminApi from "../../services/adminApi";
import { useAuth } from "../../context/AuthContext";
import "./AdminSidebar.css";

/* [path, label, icon, badge key, exact-match?] */
const groups = [
  {
    title: "Insights",
    items: [
      ["/admin/analytics", "Analytics", BarChart3],
    ],
  },
  {
    title: "Content",
    items: [
      ["/admin/questions", "Question bank", Database],
      ["/admin/add-question", "Add question", Plus],
      ["/admin/generate", "AI generator", Sparkles],
      ["/admin/review", "Review queue", ClipboardCheck, "pending"],
      ["/admin/topics", "Topics", Layers],
      ["/admin/placement", "Placement test", Target],
    ],
  },
  {
    title: "People & system",
    items: [
      ["/admin/users", "Users", Users, "teachers"],
      ["/admin/system", "System", ServerCog],
    ],
  },
];

// Only a super admin sees these (the pages and the server routes refuse everyone else too).
const superGroup = {
  title: "Super admin",
  items: [
    ["/admin/super", "Overview", ShieldCheck, null, true],
    ["/admin/super/staff", "Staff", UserCog],
    ["/admin/super/classes", "Classes", School],
    ["/admin/super/audit", "Audit log", ScrollText],
    ["/admin/super/settings", "Settings", Settings],
    ["/admin/super/ml", "ML control", Cpu],
  ],
};

const AdminSidebar = () => {
  const { user } = useAuth();
  const [counts, setCounts] = useState({});

  const isSuper = !!user && user.role === "superadmin";
  const name = (user && (user.fullname || user.name || user.username)) || "Admin";

  // little numbers: questions waiting for review, teachers waiting for approval
  useEffect(() => {
    const load = () =>
      adminApi
        .analytics()
        .then((d) => setCounts({ pending: d.pendingQuestions, teachers: d.pendingTeachers }))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const item = ([to, label, Icon, badge, end]) => (
    <NavLink
      key={to}
      to={to}
      end={!!end}
      className={({ isActive }) => `ad-item ${isActive ? "on" : ""}`}
    >
      <Icon size={17} />
      <span className="ad-item-label">{label}</span>
      {badge && counts[badge] > 0 && <span className="ad-badge">{counts[badge]}</span>}
    </NavLink>
  );

  const group = (g) => (
    <div className="ad-group" key={g.title}>
      <p className="ad-group-title">{g.title}</p>
      {g.items.map(item)}
    </div>
  );

  return (
    <aside className="ad-side">
      <div className="ad-me">
        <span className="ad-me-av" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
        <span className="ad-me-txt">
          <b>{name}</b>
          <span className={`ad-role ${isSuper ? "super" : ""}`}>{isSuper ? "Super admin" : "Admin"}</span>
        </span>
      </div>

      <nav className="ad-menu" aria-label="Admin sections">
        {groups.map(group)}
        {isSuper && group(superGroup)}
      </nav>
    </aside>
  );
};

export default AdminSidebar;