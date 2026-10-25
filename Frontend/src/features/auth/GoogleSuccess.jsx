import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/roles";

const GoogleSuccess = () => {
  const navigate = useNavigate();
  const { handleGoogleSuccess } = useAuth();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    window.history.replaceState({}, "", "/google-success");      // remove the code from the address bar and history
    if (!code) return navigate("/login", { replace: true });
    handleGoogleSuccess(code).then((u) => navigate(u ? homeFor(u.role) : "/login", { replace: true }));
    // eslint-disable-next-line
  }, []);

  return <div style={{ padding: 40, textAlign: "center" }}>Signing you in...</div>;
};

export default GoogleSuccess;
