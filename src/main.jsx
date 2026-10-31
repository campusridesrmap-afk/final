
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./festivalTheme";
import { initThemeSystem } from "./lib/theme";
import App from "./App.jsx";

// Initialize Centralized Theme System (Light / Dark / System)
initThemeSystem();

// Intentional application appreciation message - emitted once per page load
console.log("Thanks for being a valued user at CampusRide");

// Register Service Worker for background push notifications
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
