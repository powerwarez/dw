import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import MainPage from "./pages/MainPage";
// import Login from "./pages/Login";
// import Signup from "./pages/Signup";
import { Session } from "@supabase/supabase-js";

const App: React.FC = () => {
  // 임시로 세션을 항상 로그인된 상태로 설정
  const [session, setSession] = useState<Session | null>({} as Session);

  useEffect(() => {
    // 실제 인증 로직을 나중에 추가
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Navigate to="/" />} />
        <Route path="/signup" element={<Navigate to="/" />} />
        <Route
          path="/"
          element={
            <MainPage session={session || { user: { id: "", email: "" } }} />
          }
        />
      </Routes>
    </Router>
  );
};

export default App;
