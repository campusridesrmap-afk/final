import { useState } from "react";
import { Mail, Lock, ShieldCheck, Sparkles } from "lucide-react";

const PRE_REGISTRATION_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSd0IvGCblZ9FMrjkJMMLkRqsUMXONiCJIqXE2ss4SSlP35oeg/viewform?usp=header";

export default function AuthPage({
  onLogin,
  busy,
  errorMessage,
  onClearError,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (onClearError) onClearError();
    onLogin({ email, password });
  }

  return (
    <div className="auth-layout">
      {/* Informative Branding Aside */}
      <div className="auth-aside">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
          <img
            src="/cr.jpeg"
            alt="CampusRide Logo"
            className="brand-mark"
            style={{ width: "48px", height: "48px" }}
          />
          <div>
            <strong style={{ fontSize: "19px", display: "block", color: "var(--ink)", lineHeight: 1.2 }}>CampusRide</strong>
            <small style={{ fontSize: "12px", color: "var(--muted)" }}>SRM University-AP Carpooling</small>
          </div>
        </div>
        <span className="eyebrow">SRM UNIVERSITY-AP COMMUNITY</span>
        <h1>Authorized Campus Carpooling</h1>
        <p>
          Secure ride-sharing exclusively for SRM University-AP students, faculty,
          and staff. Log in with your campus credentials to search or manage rides.
        </p>

        <div className="auth-features">
          <div className="feature-item">
            <ShieldCheck size={18} />
            <span>Authorized SRM-AP accounts only</span>
          </div>
          <div className="feature-item">
            <Sparkles size={18} />
            <span>Verified student co-riders & zero booking fees</span>
          </div>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="form-card auth-card">
        <h2>Log In</h2>
        <p className="auth-subtitle">
          Enter your email and password to access your CampusRide account.
        </p>

        {errorMessage && (
          <div className="notice notice-error" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label className="field-label">
              <Mail size={15} /> College / Registered Email
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student@srmap.edu.in"
              disabled={busy}
            />
          </div>

          <div className="field">
            <label className="field-label">
              <Lock size={15} /> Password
            </label>
            <input
              type="password"
              minLength={6}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={busy}
            />
          </div>

          <button
            type="submit"
            className="button button-primary button-full auth-submit-btn"
            disabled={busy}
          >
            {busy ? "Signing in..." : "Log In"}
          </button>

          {/* Pre-Registration Link below login button */}
          <div className="preregister-box">
            <span>
              Don't have a CampusRide account? Pre-register{" "}
              <a
                href={PRE_REGISTRATION_URL}
                className="preregister-link"
              >
                here
              </a>
              !
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
