import React from "react";
import { NavLink } from "react-router-dom";
import "./AdminSidebar.css";

const AdminSidebar = () => {
  return (
    <div className="admin-sidebar">
      <NavLink
        to="/admin/add-question"
        className={({ isActive }) => (isActive ? "active" : "inactive")}
      >
        Add Question
      </NavLink>

      <NavLink
        to="/admin/analytics"
        className={({ isActive }) => (isActive ? "active" : "inactive")}
      >
        Analytics
      </NavLink>
    </div>
  );
};

export default AdminSidebar;