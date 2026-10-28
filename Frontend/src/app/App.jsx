// src/app/App.jsx
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import { ThemeProvider } from "../context/ThemeContext";
import { AuthProvider } from "../context/AuthContext";

import Navbar from "../shared/layout/Navbar";
import Footer from "../shared/layout/Footer";

import GoogleSuccess from "../features/auth/GoogleSuccess";
import Home from "../features/home/Home";
import Login from "../features/auth/Login";
import Register from "../features/auth/Register";
import Dashboard from "../features/dashboard/Dashboard";
import Profile from "../features/profile/Profile";
import Quiz from "../features/quiz/Quiz";
import ProtectedRoute from "./ProtectedRoute";
import ForgotPassword from "../features/auth/ForgotPassword";
import VerifyEmail from "../features/auth/VerifyEmail";
import StaffLogin from "../features/auth/StaffLogin";
import ResetPassword from "../features/auth/ResetPassword";
import AdminDashboard from "../features/admin/AdminDashboard";
import AddQuestion from "../features/admin/AddQuestion";
import AdminAnalytics from "../features/admin/AdminAnalytics";
import AdminQuestions from "../features/admin/AdminQuestions";
import AdminReview from "../features/admin/AdminReview";
import AdminGenerate from "../features/admin/AdminGenerate";
import AdminTopics from "../features/admin/AdminTopics";
import AdminPlacement from "../features/admin/AdminPlacement";
import AdminUsers from "../features/admin/AdminUsers";
import AdminSystem from "../features/admin/AdminSystem";
import SuperDashboard from "../features/superadmin/SuperDashboard";
import StaffManagement from "../features/superadmin/StaffManagement";
import SuperClasses from "../features/superadmin/SuperClasses";
import SuperAuditLog from "../features/superadmin/SuperAuditLog";
import SuperSettings from "../features/superadmin/SuperSettings";
import SuperMlControl from "../features/superadmin/SuperMlControl";
import QuizReview from "../features/quiz/QuizReview";
import Placement from "../features/placement/Placement";
import TeacherDashboard from "../features/teacher/TeacherDashboard";
import ClassView from "../features/teacher/ClassView";
import StudentDetail from "../features/teacher/StudentDetail";

import "./App.css";

// Pages only a super admin may open. An admin who types the address is sent back to the admin area.
const Super = ({ children }) => <ProtectedRoute role="superadmin">{children}</ProtectedRoute>;

/**
 * The permanent shell: Navbar on top, Footer at the bottom.
 * Whatever page the router picks is rendered in the middle (<Outlet />),
 * and that middle area grows or shrinks to fit. The page scrolls only
 * when the content is taller than the space between navbar and footer.
 */
const AppLayout = () => (
  <div className="app-shell">
    <Navbar />
    <main className="app-main">
      <Outlet />
    </main>
    <Footer />
  </div>
);

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            
            <Route element={<AppLayout />}>
              {/* Public */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/google-success" element={<GoogleSuccess />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/verify-email/:code" element={<VerifyEmail />} />
              <Route path="/staff/login" element={<StaffLogin />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              {/* Student */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute role="student">
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route
                path="/quiz"
                element={
                  <ProtectedRoute role="student">
                    <Quiz />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/placement"
                element={
                  <ProtectedRoute role="student">
                    <Placement />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/quiz-review/:id"
                element={
                  <ProtectedRoute role="student">
                    <QuizReview />
                  </ProtectedRoute>
                }
              />

              {/* Teacher */}
              <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherDashboard /></ProtectedRoute>} />
              <Route path="/teacher/class/:id" element={<ProtectedRoute role="teacher"><ClassView /></ProtectedRoute>} />
              <Route path="/teacher/class/:id/student/:sid" element={<ProtectedRoute role="teacher"><StudentDetail /></ProtectedRoute>} />

              {/* Admin */}
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute role={["admin", "superadmin"]}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              >
                <Route path="add-question" element={<AddQuestion />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="questions" element={<AdminQuestions />} />
                <Route path="review" element={<AdminReview />} />
                <Route path="generate" element={<AdminGenerate />} />
                <Route path="topics" element={<AdminTopics />} />
                <Route path="placement" element={<AdminPlacement />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="system" element={<AdminSystem />} />
                <Route path="super" element={<Super><SuperDashboard /></Super>} />
                <Route path="super/staff" element={<Super><StaffManagement /></Super>} />
                <Route path="super/classes" element={<Super><SuperClasses /></Super>} />
                <Route path="super/audit" element={<Super><SuperAuditLog /></Super>} />
                <Route path="super/settings" element={<Super><SuperSettings /></Super>} />
                <Route path="super/ml" element={<Super><SuperMlControl /></Super>} />
                <Route index element={<Navigate to="analytics" />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;