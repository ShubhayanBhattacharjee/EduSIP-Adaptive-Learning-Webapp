// src/components/admin/AdminDashboard.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import Navbar from "../../shared/layout/Navbar";
import Footer from "../../shared/layout/Footer";
import "./AdminDashboard.css";

const AdminDashboard = () => {
  return (
    <div className="admin-dashboard">
      <Navbar />

      <div className="main-area admin-dashboard-hero">
        <AdminSidebar />
        <div className="admin-content">
          <Outlet />
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AdminDashboard;