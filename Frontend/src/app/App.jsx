// src/App.jsx
import React, { useEffect, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { ThemeProvider } from "../context/ThemeContext";
import { AuthProvider } from "../context/AuthContext";

import GoogleSuccess from "../features/auth/GoogleSuccess";
import Home from "../features/home/Home";
import Login from "../features/auth/Login";
import Register from "../features/auth/Register";
import Dashboard from "../features/dashboard/Dashboard";
import Quiz from "../features/quiz/Quiz";
import ProtectedRoute from "./ProtectedRoute";
import ForgotPassword from "../features/auth/ForgotPassword";
import VerifyEmail from "../features/auth/VerifyEmail";
import StaffLogin from "../features/auth/StaffLogin";
import ResetPassword from "../features/auth/ResetPassword";
import AdminDashboard from "../features/admin/AdminDashboard";
import AddQuestion from "../features/admin/AddQuestion";
import AdminAnalytics from "../features/admin/AdminAnalytics";
import QuizReview from "../features/quiz/QuizReview";
import Placement from "../features/placement/Placement";
import TeacherDashboard from "../features/teacher/TeacherDashboard";
import ClassView from "../features/teacher/ClassView";
import StudentDetail from "../features/teacher/StudentDetail";

import "./App.css";

function App() {
  const dotRef = useRef(null);

  useEffect(() => {
    const move = (e) => {
      const { clientX, clientY } = e;

      // 🔴 SMALL DOT (exact cursor)
      if (dotRef.current) {
        dotRef.current.style.left = `${clientX}px`;
        dotRef.current.style.top = `${clientY}px`;
      }
    };

    window.addEventListener("mousemove", move);

    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="App">
            {/* <Navbar /> */}
            {/* <div ref={dotRef} className="cursor-dot"></div> */}

            <Routes>
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
                <Route index element={<Navigate to="analytics" />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
            {/* <Footer/> */}
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;