import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css"; // Tailwind CSS 파일 가져오기
import App from "./App";

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
