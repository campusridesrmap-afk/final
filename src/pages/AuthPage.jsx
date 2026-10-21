import { useEffect, useState, useCallback, useRef } from "react";
import {
  Mail,
  Lock,
  ShieldCheck,
  Sparkles,
  User,
  IdCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  XCircle,
  ArrowRight,
  RotateCcw,
  KeyRound,
  Info,
} from "lucide-react";
import { CAMPUS_RIDE_LOGO } from "../assets/logo";
import { supabase } from "../lib/supabase";

export default function AuthPage({
  onLogin,
  busy,
  errorMessage,
  onClearError,
}) {
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Registration form state
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState("");
  const [isResubmitMode, setIsResubmitMode] = useState(false);

  // Notice banners
  const [existingAccountNotice, setExistingAccountNotice] = useState("");
  const [existingAppNotice, setExistingAppNotice] = useState("");

  // Inline Application Status state
  const [savedToken, setSavedToken] = useState(() => {
    try {
      return localStorage.getItem("campusride_registration_token") || "";
    } catch (_err) {
      return "";
    }
  });
  const [activeRegistration, setActiveRegistration] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [justResubmitted, setJustResubmitted] = useState(false);

  const hasLoadedSavedTokenRef = useRef(false);

  // Fetch status from Supabase using secure access token
  const fetchApplicationStatus = useCallback(async (tokenToFetch, isRefresh = false) => {
    if (!tokenToFetch) return;

    if (isRefresh) {
      setStatusRefreshing(true);
    } else {
      setStatusLoading(true);
    }
    setStatusError("");

    try {
      const { data, error: rpcErr } = await supabase.rpc("get_registration_status", {
        p_token: tokenToFetch.trim(),
      });

      if (rpcErr) throw new Error(rpcErr.message || "Failed to retrieve status.");
      if (!data || !data.success) {
        // Token invalid or expired, clear it
        try {
          localStorage.removeItem("campusride_registration_token");
        } catch (_clearErr) {
          /* ignore */
        }
        setSavedToken("");
        setActiveRegistration(null);
        return;
      }

      setActiveRegistration(data.registration);
      setSavedToken(tokenToFetch.trim());
      try {
        localStorage.setItem("campusride_registration_token", tokenToFetch.trim());
      } catch (_saveErr) {
        /* ignore */
      }
    } catch (err) {
      setStatusError(err.message || "Unable to refresh application status.");
    } finally {
      setStatusLoading(false);
      setStatusRefreshing(false);
    }
  }, []);

  // Hydrate saved registration status across page reloads
  useEffect(() => {
    if (savedToken && !hasLoadedSavedTokenRef.current) {
      hasLoadedSavedTokenRef.current = true;
      fetchApplicationStatus(savedToken);
    }
  }, [savedToken, fetchApplicationStatus]);

  function handleLoginSubmit(e) {
    e.preventDefault();
    if (onClearError) onClearError();
    onLogin({ email, password });
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setRegError("");
    setExistingAccountNotice("");
    setExistingAppNotice("");

    const cleanName = regFullName.trim();
    const cleanEmail = regEmail.trim().toLowerCase();
    const cleanReg = regNumber.trim().toUpperCase();

    // Validations
    if (!cleanName) {
      setRegError("Please enter your full name.");
      return;
    }
    if (!cleanEmail) {
      setRegError("Please enter your SRM university email address.");
      return;
    }
    if (!cleanEmail.endsWith("@srmap.edu.in")) {
      setRegError("Only official SRM University-AP email addresses are accepted.");
      return;
    }
    if (!cleanReg) {
      setRegError("Please enter your SRM registration number.");
      return;
    }
    if (cleanReg.length < 4 || cleanReg.length > 20) {
      setRegError("Please enter a valid SRM registration number");
      return;
    }

    setRegBusy(true);

    try {
      let rpcResult;
      if (isResubmitMode && savedToken) {
        // Resubmission flow: updates existing rejected record in-place via secure access token
        rpcResult = await supabase.rpc("resubmit_student_registration", {
          p_token: savedToken,
          p_full_name: cleanName,
          p_email: cleanEmail,
          p_registration_number: cleanReg,
        });
      } else {
        // Standard registration submission: exact 3-argument signature deployed in PostgreSQL
        rpcResult = await supabase.rpc("submit_student_registration", {
          p_full_name: cleanName,
          p_email: cleanEmail,
          p_registration_number: cleanReg,
        });
      }

      const { data, error: rpcErr } = rpcResult;

      if (rpcErr) {
        // Check for missing schema cache / function not found
        if (rpcErr.code === "PGRST202" || (rpcErr.message && rpcErr.message.includes("schema cache"))) {
          throw new Error(
            "Registration function not found in database. Please run the supabase_resubmission_fix.sql migration in the Supabase SQL Editor."
          );
        }
        throw new Error(rpcErr.message || "Failed to submit registration.");
      }
      if (!data) throw new Error("No response received from registration server.");

      if (data.code === "EXISTING_ACCOUNT") {
        // Case A — Active account already exists
        setExistingAccountNotice(data.message || "You already have an active account. Please log in instead.");
      } else if (data.code === "EXISTING_APPLICATION") {
        // Case B — Existing application detected
        const token = data.token;
        if (token) {
          try {
            localStorage.setItem("campusride_registration_token", token);
          } catch (_err) {
            /* ignore */
          }
          setSavedToken(token);
          setJustSubmitted(false);
          setJustResubmitted(false);
          setExistingAppNotice(data.message || "A request with this email has already been submitted.");
          await fetchApplicationStatus(token);
        }
      } else if (data.code === "DUPLICATE_REG_NO") {
        setRegError(data.message || "An application has already been submitted for this registration number.");
      } else if (data.code === "RESUBMITTED") {
        // Case C — Rejected application updated in-place and returned to pending
        const token = data.token || savedToken;
        if (token) {
          try {
            localStorage.setItem("campusride_registration_token", token);
          } catch (_err) {
            /* ignore */
          }
          setSavedToken(token);
          setJustSubmitted(false);
          setJustResubmitted(true);
          setIsResubmitMode(false);
          await fetchApplicationStatus(token);
        }

        // Asynchronously trigger server-side admin phone push notification (non-blocking)
        const resubId = data.registration?.id || data.id;
        if (resubId) {
          supabase.functions
            .invoke("notify-admins-new-registration", {
              body: { registrationId: resubId },
            })
            .catch((_err) => {});
        }
      } else if (data.code === "CREATED" || data.success) {
        // Case D — New application created
        const token = data.token;
        if (token) {
          try {
            localStorage.setItem("campusride_registration_token", token);
          } catch (_err) {
            /* ignore */
          }
          setSavedToken(token);
          setJustSubmitted(true);
          setJustResubmitted(false);
          setIsResubmitMode(false);
          await fetchApplicationStatus(token);
        }

        // Asynchronously trigger server-side admin phone push notification (non-blocking)
        const newRegId = data.registration?.id || data.id;
        if (newRegId) {
          supabase.functions
            .invoke("notify-admins-new-registration", {
              body: { registrationId: newRegId },
            })
            .catch((_err) => {});
        }
      } else {
        setRegError(data.message || "Registration submission failed.");
      }
    } catch (err) {
      console.error("Registration error:", err);
      setRegError(err.message || "Something went wrong. Please try again.");
    } finally {
      setRegBusy(false);
    }
  }

  // Handle student clicking "Submit Another Application" on a rejected application
  function handleStartResubmit() {
    if (activeRegistration) {
      setRegFullName(activeRegistration.full_name || "");
      setRegEmail(activeRegistration.email || "");
      // Allow them to review and edit their registration number, name, and SRM email
      setRegNumber(activeRegistration.registration_number || "");
    }
    setActiveRegistration(null);
    setJustSubmitted(false);
    setJustResubmitted(false);
    setExistingAppNotice("");
    setExistingAccountNotice("");
    setIsResubmitMode(true);
  }

  function formatDate(isoStr) {
    if (!isoStr) return "N/A";
    try {
      return new Date(isoStr).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_err) {
      return isoStr;
    }
  }

  return (
    <div className="auth-layout">
      {/* Informative Branding Aside */}
      <div className="auth-aside">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
          <img
            src={CAMPUS_RIDE_LOGO}
            alt="CampusRide Logo"
            className="brand-mark"
            width="48"
            height="48"
            loading="eager"
            fetchPriority="high"
            decoding="sync"
            style={{ width: "48px", height: "48px" }}
          />
          <div>
            <strong style={{ fontSize: "19px", display: "block", color: "var(--ink)", lineHeight: 1.2 }}>
              CampusRide
            </strong>
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

      {/* Main Authentication Card */}
      <div className="form-card auth-card">
        {/* Toggle between Log In and Register */}
        <div className="auth-mode-tabs" style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: "20px" }}>
          <button
            type="button"
            className={`auth-mode-tab ${authMode === "login" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("login");
              if (onClearError) onClearError();
            }}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "none",
              borderBottom: authMode === "login" ? "2px solid var(--primary)" : "2px solid transparent",
              fontWeight: authMode === "login" ? 600 : 400,
              color: authMode === "login" ? "var(--primary)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${authMode === "register" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("register");
              setRegError("");
              setExistingAccountNotice("");
              setExistingAppNotice("");
            }}
            style={{
              flex: 1,
              padding: "10px",
              background: "none",
              border: "none",
              borderBottom: authMode === "register" ? "2px solid var(--primary)" : "2px solid transparent",
              fontWeight: authMode === "register" ? 600 : 400,
              color: authMode === "register" ? "var(--primary)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            Register
          </button>
        </div>

        {/* ===================== LOG IN MODE ===================== */}
        {authMode === "login" ? (
          <>
            <h2>Log In</h2>
            <p className="auth-subtitle">
              Enter your email and password to access your CampusRide account.
            </p>

            {errorMessage && (
              <div className="notice notice-error" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="auth-form">
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

              <div className="auth-register-prompt">
                <span className="auth-register-prompt-text">Need an account?</span>
                <button
                  type="button"
                  className="auth-register-link"
                  onClick={() => {
                    setAuthMode("register");
                    setRegError("");
                    setExistingAccountNotice("");
                  }}
                >
                  Register
                </button>
              </div>

            </form>
          </>
        ) : (
          /* ===================== REGISTER MODE ===================== */
          <>
            {/* DUPLICATE APPLICATION MESSAGE (When an application with this email already exists) */}
            {existingAppNotice && (
              <div className="notice notice-info" role="status" style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Info size={16} style={{ flexShrink: 0 }} />
                  <strong>{existingAppNotice}</strong>
                </div>
              </div>
            )}

            {/* RESUBMITTED CONFIRMATION BANNER */}
            {justResubmitted && (
              <div className="notice notice-success" role="status" style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckCircle2 size={16} style={{ flexShrink: 0, color: "#166534" }} />
                  <strong>Your application has been resubmitted successfully and is awaiting verification.</strong>
                </div>
              </div>
            )}

            {/* INLINE APPLICATION STATUS CARD */}
            {activeRegistration ? (
              <div className="inline-status-card" style={{ animation: "fadeIn 0.2s ease" }}>
                {/* 1. Pending Status Card */}
                {activeRegistration.status === "pending" && (
                  <>
                    <div
                      className="status-card-banner status-pending"
                      style={{
                        borderRadius: "12px",
                        padding: "16px",
                        marginBottom: "16px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "14px",
                      }}
                    >
                      <div className="status-icon-circle icon-pending" style={{ width: "42px", height: "42px", flexShrink: 0 }}>
                        <Clock size={22} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: "17px", color: "#854d0e" }}>
                          {justResubmitted
                            ? "Application Resubmitted Successfully"
                            : justSubmitted
                            ? "Application Submitted Successfully"
                            : "Verification Pending"}
                        </h3>
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#a16207", lineHeight: 1.4 }}>
                          {justResubmitted
                            ? "Your application has been resubmitted successfully and is awaiting verification."
                            : "Your application has been submitted successfully and is awaiting verification."}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Approved Status Card */}
                {activeRegistration.status === "approved" && (
                  <div
                    className="status-card-banner status-approved"
                    style={{
                      borderRadius: "12px",
                      padding: "18px",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "14px",
                    }}
                  >
                    <div className="status-icon-circle icon-approved" style={{ width: "42px", height: "42px", flexShrink: 0 }}>
                      <CheckCircle2 size={24} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: "17px", color: "#166534" }}>
                        Application Approved!
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#15803d", lineHeight: 1.4 }}>
                        Your CampusRide account has been approved. Please check your registered SRM email address for your login details and instructions to get started.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3. Rejected Status Card */}
                {activeRegistration.status === "rejected" && (
                  <div
                    className="status-card-banner status-rejected"
                    style={{
                      borderRadius: "12px",
                      padding: "16px",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "14px",
                    }}
                  >
                    <div className="status-icon-circle icon-rejected" style={{ width: "42px", height: "42px", flexShrink: 0 }}>
                      <XCircle size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: "17px", color: "#991b1b" }}>
                        Application Rejected
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#b91c1c", lineHeight: 1.4 }}>
                        Your application was not approved. Please review the information you submitted and correct any errors before applying again.
                      </p>
                      {activeRegistration.rejection_reason && (
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "#7f1d1d", fontWeight: 500 }}>
                          Reason: {activeRegistration.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {statusError && (
                  <div className="notice notice-error" style={{ marginBottom: "14px" }}>
                    <AlertCircle size={15} />
                    <span>{statusError}</span>
                  </div>
                )}

                {/* Application Details Summary */}
                <div
                  className="app-details-box"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, color: "var(--muted)" }}>
                      Application Details
                    </span>
                    <span className={`status-tag status-tag-${activeRegistration.status}`}>
                      {activeRegistration.status === "pending" && "Verification Pending"}
                      {activeRegistration.status === "approved" && "Approved"}
                      {activeRegistration.status === "rejected" && "Rejected"}
                    </span>
                  </div>

                  <div className="app-details-grid">
                    <div className="app-details-cell">
                      <span className="app-details-label">Full Name</span>
                      <strong className="app-details-val">{activeRegistration.full_name}</strong>
                    </div>

                    <div className="app-details-cell">
                      <span className="app-details-label">SRM Email</span>
                      <strong className="app-details-val" style={{ wordBreak: "break-all" }}>{activeRegistration.email}</strong>
                    </div>

                    <div className="app-details-cell">
                      <span className="app-details-label">Registration Number</span>
                      <strong className="app-details-val">
                        {activeRegistration.masked_registration_number || activeRegistration.registration_number}
                      </strong>
                    </div>

                    <div className="app-details-cell">
                      <span className="app-details-label">Submitted On</span>
                      <span className="app-details-val">{formatDate(activeRegistration.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {activeRegistration.status === "approved" ? (
                    <button
                      type="button"
                      className="button button-primary button-full"
                      onClick={() => {
                        setAuthMode("login");
                        setEmail(activeRegistration.email);
                      }}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      <span>Go to Login</span>
                      <ArrowRight size={15} />
                    </button>
                  ) : activeRegistration.status === "rejected" ? (
                    <div className="resubmit-actions-row">
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={handleStartResubmit}
                        style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                      >
                        <RotateCcw size={15} />
                        <span>Submit Another Application</span>
                      </button>
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={() => fetchApplicationStatus(savedToken, true)}
                        disabled={statusRefreshing}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                      >
                        <RefreshCw size={15} className={statusRefreshing ? "spin-icon" : ""} />
                        <span>{statusRefreshing ? "Refreshing..." : "Refresh Status"}</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="button button-primary button-full"
                      onClick={() => fetchApplicationStatus(savedToken, true)}
                      disabled={statusRefreshing}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      <RefreshCw size={15} className={statusRefreshing ? "spin-icon" : ""} />
                      <span>{statusRefreshing ? "Refreshing..." : "Refresh Status"}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : statusLoading ? (
              /* Loading Spinner when restoring token */
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
                <RefreshCw size={26} className="spin-icon" style={{ color: "var(--primary)", marginBottom: "10px" }} />
                <p style={{ margin: 0, fontSize: "14px" }}>Checking your application status...</p>
              </div>
            ) : (
              /* REGISTRATION FORM */
              <>
                <h2>Register for CampusRide</h2>
                <p className="auth-subtitle">
                  {isResubmitMode
                    ? "Correct your details and submit a new application."
                    : "Submit your SRM-AP student credentials for verification and access."}
                </p>

                {regError && (
                  <div className="notice notice-error" role="alert" style={{ marginBottom: "14px" }}>
                    <AlertCircle size={15} />
                    <span>{regError}</span>
                  </div>
                )}

                {existingAccountNotice && (
                  <div className="notice notice-warning" role="alert" style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <AlertCircle size={16} style={{ marginTop: "2px", flexShrink: 0 }} />
                      <div>
                        <div>{existingAccountNotice}</div>
                        <button
                          type="button"
                          className="button button-primary button-small"
                          onClick={() => {
                            setAuthMode("login");
                            setEmail(regEmail);
                          }}
                          style={{ marginTop: "10px" }}
                        >
                          Go to Login
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="auth-form">
                  <div className="field">
                    <label className="field-label">
                      <User size={15} /> Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder=""
                      disabled={regBusy}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label">
                      <Mail size={15} /> SRM University Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder=""
                      disabled={regBusy}
                    />
                    <small style={{ color: "var(--muted)", fontSize: "11px", marginTop: "3px", display: "block" }}>
                      Only official SRM community email addresses are accepted
                    </small>
                  </div>

                  <div className="field">
                    <label className="field-label">
                      <IdCard size={15} /> Registration Number
                    </label>
                    <input
                      type="text"
                      required
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                      placeholder=""
                      disabled={regBusy}
                    />
                  </div>

                  <button
                    type="submit"
                    className="button button-primary button-full auth-submit-btn"
                    disabled={regBusy}
                  >
                    {regBusy ? "Submitting..." : isResubmitMode ? "Resubmit Application" : "Register for an Account"}
                  </button>

                  <div className="auth-register-prompt">
                    <span className="auth-register-prompt-text">Already have an account?</span>
                    <button
                      type="button"
                      className="auth-register-link"
                      onClick={() => setAuthMode("login")}
                    >
                      Log In
                    </button>
                  </div>
                  {isResubmitMode && (
                    <div style={{ marginTop: "10px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsResubmitMode(false);
                          if (savedToken) {
                            fetchApplicationStatus(savedToken);
                          }
                        }}
                        style={{ color: "var(--muted)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", fontSize: "13px" }}
                      >
                        Cancel resubmission
                      </button>
                    </div>
                  )}

                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
