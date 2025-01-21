import React from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../utils/supabase";

const Login: React.FC = () => {
  const navigate = useNavigate();

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error("Error during Kakao login:", error);
    } else {
      // 로그인 성공 시 메인 페이지로 리디렉션
      navigate("/");
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-900">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-full max-w-md text-center p-8 bg-gray-800 rounded-lg shadow-lg text-white">
            <h1 className="text-3xl mb-4">동파법 로그인</h1>
            <button
              onClick={handleLogin}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              카카오로 로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
