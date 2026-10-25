// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from "../utils/roles";

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }

  if (!user) {
    // Not logged in
    return <Navigate to="/login" replace />;
  }

  const roles = [].concat(role || []);
if (roles.length && !roles.includes(user.role)) {
  return <Navigate to={homeFor(user.role)} replace />;
}

  // Logged in with correct role (or no role restriction)
  return children;
};

export default ProtectedRoute;