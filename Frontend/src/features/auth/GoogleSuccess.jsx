import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/roles";
import "./auth.css";

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

  return (
    <div className="au">
           <div className="au-shell">
        <p className="au-brand">EduSip</p>
        <div className="au-card au-done" role="status" aria-live="polite">
          <h2 className="au-title" style={{ textAlign: "center", marginBottom: 0 }}>Signing you in...</h2>
        </div>
      </div>
    </div>
  );
};

export default GoogleSuccess;