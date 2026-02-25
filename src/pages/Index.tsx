import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Landing from "./Landing";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const clientPath = sessionStorage.getItem("client_token_path");
    // SECURITY: Only allow redirects to internal paths starting with /
    // Prevent open redirect attacks via sessionStorage manipulation
    if (clientPath && typeof clientPath === "string" && clientPath.startsWith("/") && !clientPath.startsWith("//")) {
      navigate(clientPath, { replace: true });
    }
  }, [navigate]);

  return <Landing />;
};

export default Index;