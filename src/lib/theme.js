/**
 * CAMPUSRIDE — CENTRALIZED THEME SYSTEM
 * File: src/lib/theme.js
 *
 * Supports 3 modes:
 * - 'light'  : Classic CampusRide light mode (100% preserved)
 * - 'dark'   : Premium Midnight Blue dark mode
 * - 'system' : Automatically follows user's OS/device preference
 */

import { useState, useEffect } from "react";

export const THEME_STORAGE_KEY = "campusride_theme";
export const THEME_CHANGE_EVENT = "campusride:theme-change";

/**
 * Reads user's stored theme preference from localStorage.
 * Defaults to 'system' if not set.
 */
export function getStoredTheme() {
  if (typeof window === "undefined") return "system";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch (_) {}
  return "system";
}

/**
 * Checks system media query for dark mode.
 */
export function getSystemTheme() {
  if (typeof window === "undefined") return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch (_) {
    return "light";
  }
}

/**
 * Resolves effective theme ('light' or 'dark') given a preference.
 */
export function resolveTheme(preference = getStoredTheme()) {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return getSystemTheme();
}

/**
 * Applies theme preference to the DOM:
 * - Updates <html> classes and data-theme attribute
 * - Sets color-scheme
 * - Updates meta[name="theme-color"]
 * - Persists to localStorage
 * - Emits event for reactive components
 */
export function applyTheme(preference) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const validPreference = preference === "light" || preference === "dark" || preference === "system"
    ? preference
    : "system";

  try {
    localStorage.setItem(THEME_STORAGE_KEY, validPreference);
  } catch (_) {}

  const resolved = resolveTheme(validPreference);
  const isDark = resolved === "dark";
  const root = document.documentElement;

  // Set class & data-theme on <html>
  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  }

  // Update browser theme-color meta tag for native mobile status bar
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", isDark ? "#0b1120" : "#2563eb");
  } catch (_) {}

  // Dispatch custom event for React components
  try {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, {
        detail: { preference: validPreference, resolvedTheme: resolved }
      })
    );
  } catch (_) {}

  return resolved;
}

/**
 * Initialize system media query listener
 */
let isListenerInitialized = false;
export function initThemeSystem() {
  if (typeof window === "undefined" || isListenerInitialized) return;
  isListenerInitialized = true;

  // Apply current theme on boot
  applyTheme(getStoredTheme());

  // Listen for device OS dark/light mode changes when preference is 'system'
  try {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentPref = getStoredTheme();
      if (currentPref === "system") {
        applyTheme("system");
      }
    };

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange);
    } else if (typeof mql.addListener === "function") {
      mql.addListener(handleChange);
    }
  } catch (_) {}
}

/**
 * Toggles between light and dark modes directly.
 */
export function toggleTheme() {
  const currentResolved = resolveTheme(getStoredTheme());
  const next = currentResolved === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/**
 * React hook to read and change theme reactively
 */
export function useTheme() {
  const [theme, setThemeState] = useState(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(getStoredTheme()));

  useEffect(() => {
    // Ensure listener is active
    initThemeSystem();

    const handleThemeChange = (e) => {
      if (e?.detail) {
        setThemeState(e.detail.preference);
        setResolvedTheme(e.detail.resolvedTheme);
      } else {
        const pref = getStoredTheme();
        setThemeState(pref);
        setResolvedTheme(resolveTheme(pref));
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  const setTheme = (newTheme) => {
    applyTheme(newTheme);
  };

  const toggle = () => {
    return toggleTheme();
  };

  return { theme, resolvedTheme, setTheme, toggleTheme: toggle };
}

