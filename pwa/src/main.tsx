import React from "react";
import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import "@/styles/chessgroundBaseOverride.css";
import "./style.css";
import { AccountApp } from "./AccountApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccountApp />
  </React.StrictMode>,
);
