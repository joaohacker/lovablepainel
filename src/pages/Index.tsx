import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Landing from "./Landing";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const clientPath = sessionStorage.getItem("client_token_path");
    if (clientPath) {
      navigate(clientPath, { replace: true });
    }
  }, [navigate]);

  return <Landing />;
};

export default Index;