import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../utils/supabase";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Error during email login:", error);
    } else {
      // 로그인 성공 시 메인 페이지로 리디렉션
      navigate("/");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-md text-center p-8 bg-gray-800 rounded-lg shadow-lg text-white">
        <h1 className="text-3xl mb-4">이메일 로그인</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 p-2 w-full rounded"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 p-2 w-full rounded"
        />
        <button
          onClick={handleLogin}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-4"
        >
          로그인
        </button>
        <div>
          <span>계정이 없으신가요? </span>
          <button
            onClick={() => navigate("/signup")}
            className="text-blue-300 hover:text-blue-500"
          >
            회원가입
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
