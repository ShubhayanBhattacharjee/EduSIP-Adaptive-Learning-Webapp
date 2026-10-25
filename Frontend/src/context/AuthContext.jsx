import API_URL from "../config";
import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  const BASE_URL = API_URL;

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setToken(storedToken);
    }

    setLoading(false);
  }, []);

  // LOGIN
  const login = async (email, password) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.message || "Login failed", code: data.code };
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);

      return { success: true };
    } catch (error) {
      return { success: false, error: "Cannot reach the server. Check your connection." };
    }
  };

  // STAFF LOGIN (admins and super admins only; the backend refuses everyone else)
  const staffLogin = async (email, password) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/staff/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.message || "Login failed" };
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: "Cannot reach the server. Check your connection." };
    }
  };

  // RESEND the verification email
  const resendVerification = async (email) => {
    try {
      await fetch(`${BASE_URL}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  // REGISTER
  const register = async (
    fullname,
    username,
    email,
    bio,
    skills,
    role,
    password,
    confirmPassword
  ) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullname,
          username,
          email,
          bio,
          skills,
          role,
          password,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      return { success: true, verificationRequired: !!data.verificationRequired, emailSent: data.emailSent !== false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // ✅ UPDATE PROFILE (FIXED POSITION)
  const updateProfile = async (bio, skills) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/update-profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bio, skills }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Update failed");
      }

      // Update local state
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // GOOGLE LOGIN
  const googleLogin = () => {
    window.location.href = `${BASE_URL}/auth/google`;
  };

  // GOOGLE SUCCESS
  const handleGoogleSuccess = async (code) => {
    // swap the one-time code from the URL for the real token (the token itself never appears in a URL)
    let token;
    try {
      const ex = await fetch(`${BASE_URL}/auth/google/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const exData = await ex.json();
      if (!ex.ok || !exData.token) return null;
      token = exData.token;
    } catch {
      return null;
    }
    localStorage.setItem("token", token);
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      localStorage.removeItem("token");
      return null;
    }
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(token);
    setUser(data.user);
    return data.user;
  };

  // LOGOUT
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  // ✅ IMPORTANT: include updateProfile here
  const value = {
    user,
    token,
    loading,
    login,
    staffLogin,
    resendVerification,
    register,
    updateProfile, // 🔥 FIXED
    logout,
    googleLogin,
    handleGoogleSuccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};