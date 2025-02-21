import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import supabase from "../utils/supabase";
import { Session } from "@supabase/supabase-js";

const Login: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // 현재 세션을 가져와서 상태에 저장
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
  }, []);

  const handleKakaoLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: window.location.origin },
    });
  };

  // 세션이 있으면 메인페이지로 리디렉트
  if (session) {
    console.log("session이 있니?", session);
    return <Navigate to="/" state={{ session }} />;
  }

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold text-center mb-6 bg-clip-text text-transparent bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300">
        기계처럼 투자해서 부자되자 동파법
      </h1>
      <button
        onClick={handleKakaoLogin}
        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded"
      >
        카카오로 로그인
      </button>
    </div>
  );
};

export default Login; 