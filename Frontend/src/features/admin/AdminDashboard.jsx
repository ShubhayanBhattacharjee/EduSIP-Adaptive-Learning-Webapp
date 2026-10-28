// src/features/admin/AdminDashboard.jsx
import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import "./AdminDashboard.css";

/**
 * Admin + super admin shell.
 * Left: sticky sidebar. Right: whichever admin page the router picked (<Outlet />).
 * The page is keyed by its path so every page change plays the small fade-in.
 */
const AdminDashboard = () => {
  const { pathname } = useLocation();

  return (
    <div className="ad">
      <AdminSidebar />
      <main className="ad-content">
        <div className="ad-view" key={pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;