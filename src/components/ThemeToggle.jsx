import { Sun, Moon } from "lucide-react";
import { useTheme } from "../lib/theme";

/**
 * Single Combined Theme Toggle Button (Light & Dark Combined)
 *
 * A single, compact, accessible pill button that seamlessly toggles
 * between Light mode and Midnight Blue Dark mode.
 */
export default function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className={`theme-toggle-switch ${isDark ? "is-dark" : "is-light"}`}
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
      title={isDark ? "Switch to Light mode" : "Switch to Midnight Blue Dark mode"}
    >
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-side sun-side">
          <Sun size={13} strokeWidth={2.4} />
        </span>
        <span className="theme-switch-side moon-side">
          <Moon size={13} strokeWidth={2.4} />
        </span>
        <span className="theme-switch-thumb">
          {isDark ? (
            <Moon size={13} strokeWidth={2.4} className="thumb-icon moon" />
          ) : (
            <Sun size={13} strokeWidth={2.4} className="thumb-icon sun" />
          )}
        </span>
      </span>
    </button>
  );
}
