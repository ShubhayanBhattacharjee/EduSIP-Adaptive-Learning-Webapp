import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import adminApi from "../../services/adminApi";
import { useAuth } from "../../context/AuthContext";
import "./AdminSidebar.css";

const links = [
  ["/admin/analytics", "Analytics"],
  ["/admin/questions", "Question bank"],
  ["/admin/add-question", "Add question"],
  ["/admin/generate", "AI generator"],
  ["/admin/review", "Review queue", "pending"],
  ["/admin/topics", "Topics"],
  ["/admin/placement", "Placement test"],
  ["/admin/users", "Users", "teachers"],
  ["/admin/system", "System"],
];

// Only a super admin sees these (the pages and the server routes refuse everyone else too).
const superLinks = [
  ["/admin/super", "Overview", null, true],
  ["/admin/super/staff", "Staff"],
  ["/admin/super/classes", "Classes"],
  ["/admin/super/audit", "Audit log"],
  ["/admin/super/settings", "Settings"],
  ["/admin/super/ml", "ML control"],
];

const AdminSidebar = () => {
  const { user } = useAuth();
  const [counts, setCounts] = useState({});

  // little red numbers: questions waiting for review, teachers waiting for approval
  useEffect(() => {
    const load = () => adminApi.analytics()
      .then((d) => setCounts({ pending: d.pendingQuestions, teachers: d.pendingTeachers }))
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const item = ([to, label, badge, end]) => (
    <NavLink key={to} to={to} end={!!end} className={({ isActive }) => (isActive ? "active" : "inactive")}>
      {label}
      {badge && counts[badge] > 0 && <span className="admin-badge">{counts[badge]}</span>}
    </NavLink>
  );

  return (
    <div className="admin-sidebar">
      {links.map(item)}
      {user && user.role === "superadmin" && (
        <>
          <div className="admin-sidebar-label">Super admin</div>
          {superLinks.map(item)}
        </>
      )}
    </div>
  );
};

export default AdminSidebar;
