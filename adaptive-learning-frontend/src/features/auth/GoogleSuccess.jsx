import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/roles";

const GoogleSuccess = () => {
  const navigate = useNavigate();
  const { handleGoogleSuccess } = useAuth();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return navigate("/login");
    handleGoogleSuccess(token).then((u) => navigate(u ? homeFor(u.role) : "/login"));
    // eslint-disable-next-line
  }, []);

  return <div>Signing you in...</div>;
};

export default GoogleSuccess;