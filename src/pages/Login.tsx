import React from "react";
import supabaseAuth from "../utils/supabaseAuth";

const Login: React.FC = () => {
  const handleLogin = async () => {
    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: "kakao",
    });

    if (error) {
      console.error("Error during Kakao login:", error);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-3xl mb-4">Login</h1>
        <button
          onClick={handleLogin}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Login with Kakao
        </button>
      </div>
    </div>
  );
};

export default Login;
