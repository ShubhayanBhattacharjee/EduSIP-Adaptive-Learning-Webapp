// src/app/App.jsx
import React, { lazy, Suspense } from "react";
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
import ProtectedRoute from "./ProtectedRoute";
import "./App.css";

const GoogleSuccess = lazy(() => import("../features/auth/GoogleSuccess"));
const Home = lazy(() => import("../features/home/Home"));
const Login = lazy(() => import("../features/auth/Login"));
const Register = lazy(() => import("../features/auth/Register"));
const Dashboard = lazy(() => import("../features/dashboard/Dashboard"));
const Profile = lazy(() => import("../features/profile/Profile"));
const Quiz = lazy(() => import("../features/quiz/Quiz"));
const ForgotPassword = lazy(() => import("../features/auth/ForgotPassword"));
const VerifyEmail = lazy(() => import("../features/auth/VerifyEmail"));
const StaffLogin = lazy(() => import("../features/auth/StaffLogin"));
const ResetPassword = lazy(() => import("../features/auth/ResetPassword"));
const AdminDashboard = lazy(() => import("../features/admin/AdminDashboard"));
const AddQuestion = lazy(() => import("../features/admin/AddQuestion"));
const AdminAnalytics = lazy(() => import("../features/admin/AdminAnalytics"));
const AdminQuestions = lazy(() => import("../features/admin/AdminQuestions"));
const AdminReview = lazy(() => import("../features/admin/AdminReview"));
const AdminGenerate = lazy(() => import("../features/admin/AdminGenerate"));
const AdminTopics = lazy(() => import("../features/admin/AdminTopics"));
const AdminPlacement = lazy(() => import("../features/admin/AdminPlacement"));
const AdminUsers = lazy(() => import("../features/admin/AdminUsers"));
const AdminSystem = lazy(() => import("../features/admin/AdminSystem"));
const SuperDashboard = lazy(() => import("../features/superadmin/SuperDashboard"));
const StaffManagement = lazy(() => import("../features/superadmin/StaffManagement"));
const SuperClasses = lazy(() => import("../features/superadmin/SuperClasses"));
const SuperAuditLog = lazy(() => import("../features/superadmin/SuperAuditLog"));
const SuperSettings = lazy(() => import("../features/superadmin/SuperSettings"));
const SuperMlControl = lazy(() => import("../features/superadmin/SuperMlControl"));
const QuizReview = lazy(() => import("../features/quiz/QuizReview"));
const Placement = lazy(() => import("../features/placement/Placement"));
const TeacherDashboard = lazy(() => import("../features/teacher/TeacherDashboard"));
const ClassView = lazy(() => import("../features/teacher/ClassView"));
const StudentDetail = lazy(() => import("../features/teacher/StudentDetail"));

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
          <Suspense fallback={<div style={{ padding: "4rem", textAlign: "center" }}>Loading…</div>}>
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
          </Suspense>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;