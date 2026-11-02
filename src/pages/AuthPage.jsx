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
  Eye,
  EyeOff,
} from "lucide-react";
import { CAMPUS_RIDE_LOGO } from "../assets/logo";
import { supabase } from "../lib/supabase";

export default function AuthPage({
  onLogin,
  busy,
  errorMessage,
  onClearError,
}) {
  const [authMode, setAuthMode] = useState("login"); // "login" | "register" | "set_password"

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginNotice, setLoginNotice] = useState("");

  // Set Password form state (after successful registration)
  const [pendingRegData, setPendingRegData] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState("");
  const [setPasswordSuccess, setSetPasswordSuccess] = useState("");

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

  // Inline Application Status state (in-memory only, no localStorage caching)
  const [savedToken, setSavedToken] = useState("");
  const [activeRegistration, setActiveRegistration] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [justResubmitted, setJustResubmitted] = useState(false);

  // Clear any legacy registration status token from localStorage on mount
  useEffect(() => {
    try {
      localStorage.removeItem("campusride_registration_token");
    } catch (_) {}
  }, []);

  // OTP Verification state for student registration
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpNotice, setOtpNotice] = useState("");
  const [otpError, setOtpError] = useState("");

  // OTP Cooldown countdown timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  function handleEmailChange(e) {
    const newEmail = e.target.value;
    setRegEmail(newEmail);
    // Invalidate verification immediately if the email is modified after verification
    if (otpVerified && newEmail.trim().toLowerCase() !== verifiedEmail) {
      setOtpVerified(false);
      setVerificationToken("");
      setVerifiedEmail("");
      setOtpSent(false);
      setOtpCode("");
      setOtpNotice("");
      setOtpError("");
    }
  }

  async function handleSendOtp() {
    const cleanEmail = regEmail.trim().toLowerCase();
    setOtpError("");
    setOtpNotice("");

    if (!cleanEmail) {
      setOtpError("Please enter your SRM university email address.");
      return;
    }
    if (!cleanEmail.endsWith("@srmap.edu.in")) {
      setOtpError("Only official SRM University-AP email addresses (@srmap.edu.in) are accepted.");
      return;
    }
    if (otpCooldown > 0) return;

    setOtpSending(true);

    // After exactly 3 seconds, open the clean OTP box!
    const openTimer = setTimeout(() => {
      setOtpSent(true);
      setOtpSending(false);
    }, 3000);

    try {
      const { data, error } = await supabase.functions.invoke("registration-email-otp", {
        body: {
          action: "send_otp",
          email: cleanEmail,
        },
      });

      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === "function") {
            const errBody = await error.context.json();
            if (errBody?.error) msg = errBody.error;
          }
        } catch (_) {}
        throw new Error(msg || "Failed to contact verification service.");
      }
      if (!data?.success) {
        throw new Error(data?.error || "Could not send verification code.");
      }

      setOtpCooldown(data.cooldownSeconds || 60);
      setOtpCode("");
    } catch (err) {
      clearTimeout(openTimer);
      console.error("Send OTP error:", err);
      setOtpError(err.message || "Failed to send verification code. Please try again.");
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    const cleanEmail = regEmail.trim().toLowerCase();
    const cleanOtp = otpCode.trim();
    setOtpError("");
    setOtpNotice("");

    if (!cleanOtp) {
      setOtpError("Please enter the 6-digit code sent to your email.");
      return;
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      setOtpError("The verification code must be exactly 6 digits.");
      return;
    }

    setOtpVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("registration-email-otp", {
        body: {
          action: "verify_otp",
          email: cleanEmail,
          otp: cleanOtp,
        },
      });

      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === "function") {
            const errBody = await error.context.json();
            if (errBody?.error) msg = errBody.error;
          }
        } catch (_) {}
        throw new Error(msg || "Verification request failed.");
      }
      if (!data?.success || !data?.verificationToken) {
        throw new Error(data?.error || "Invalid verification code.");
      }

      setOtpVerified(true);
      setVerificationToken(data.verificationToken);
      setVerifiedEmail(cleanEmail);
      setOtpNotice("SRM email verified successfully!");
      setOtpError("");
    } catch (err) {
      console.error("Verify OTP error:", err);
      setOtpError(err.message || "Verification failed. Please check the code and try again.");
    } finally {
      setOtpVerifying(false);
    }
  }

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
    } catch (err) {
      setStatusError(err.message || "Unable to refresh application status.");
    } finally {
      setStatusLoading(false);
      setStatusRefreshing(false);
    }
  }, []);

  function handleLoginSubmit(e) {
    e.preventDefault();
    if (onClearError) onClearError();
    setLoginNotice("");
    onLogin({ email, password });
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setRegError("");
    setExistingAccountNotice("");
    setExistingAppNotice("");
    setLoginNotice("");

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

    let activeToken = verificationToken;

    // Verify OTP on registration submit if not yet verified
    if (!isResubmitMode) {
      if (!otpVerified || !activeToken || cleanEmail !== verifiedEmail) {
        const cleanOtp = otpCode.trim();
        if (!cleanOtp) {
          if (!otpSent) {
            setRegError("Please click 'Send Code' to receive a verification OTP on your SRM email.");
          } else {
            setRegError("Please enter the 6-digit verification code sent to your email.");
          }
          setRegBusy(false);
          return;
        }
        if (!/^\d{6}$/.test(cleanOtp)) {
          setRegError("The verification code must be exactly 6 digits.");
          setRegBusy(false);
          return;
        }

        setOtpVerifying(true);
        setOtpError("");
        try {
          const { data: otpData, error: otpErr } = await supabase.functions.invoke("registration-email-otp", {
            body: {
              action: "verify_otp",
              email: cleanEmail,
              otp: cleanOtp,
            },
          });

          if (otpErr) {
            let msg = otpErr.message;
            try {
              if (otpErr.context && typeof otpErr.context.json === "function") {
                const errBody = await otpErr.context.json();
                if (errBody?.error) msg = errBody.error;
              }
            } catch (_) {}
            throw new Error(msg || "Verification request failed.");
          }

          if (!otpData?.success || !otpData?.verificationToken) {
            throw new Error(otpData?.error || "Invalid verification code.");
          }

          activeToken = otpData.verificationToken;
          setOtpVerified(true);
          setVerificationToken(activeToken);
          setVerifiedEmail(cleanEmail);
          setOtpNotice("SRM email verified successfully!");
          setOtpError("");
        } catch (verifyErr) {
          console.error("Verify OTP on submit error:", verifyErr);
          const errorMsg = verifyErr.message || "Invalid verification code. Please check and try again.";
          setOtpError(errorMsg);
          setRegError(errorMsg);
          setOtpVerifying(false);
          setRegBusy(false);
          return;
        } finally {
          setOtpVerifying(false);
        }
      }
    }

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
        // Standard registration submission: requires verified single-use proof
        rpcResult = await supabase.rpc("submit_student_registration", {
          p_full_name: cleanName,
          p_email: cleanEmail,
          p_registration_number: cleanReg,
          p_verification_token: activeToken,
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
        // Check if user has NOT changed their password yet (password is still their SRM registration number)
        let isUnchangedPassword = false;
        try {
          sessionStorage.setItem("campusride_setting_password", "true");
          const { data: testSignIn, error: testSignInErr } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanReg,
          });

          if (!testSignInErr && testSignIn?.user) {
            isUnchangedPassword = true;
            // Password is still the registration number! User just verified OTP, so allow them to set their password now!
            setPendingRegData({
              fullName: cleanName || testSignIn.user?.user_metadata?.full_name,
              email: cleanEmail,
              regNumber: cleanReg,
              token: savedToken || null,
              userId: testSignIn.user.id,
            });

            setNewPassword("");
            setConfirmPassword("");
            setShowNewPassword(false);
            setShowConfirmPassword(false);
            setSetPasswordError("");
            setSetPasswordSuccess("");
            setAuthMode("set_password");
            return;
          } else {
            sessionStorage.removeItem("campusride_setting_password");
          }
        } catch (_) {
          try {
            sessionStorage.removeItem("campusride_setting_password");
          } catch (__) {}
        }

        if (!isUnchangedPassword) {
          setExistingAccountNotice(data.message || "You already have an active account with a set password. Please log in instead.");
        }
      } else if (data.code === "EXISTING_APPLICATION") {
        // Case B — Existing application detected
        const token = data.token;
        if (token) {
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
          setSavedToken(token);
          setJustSubmitted(false);
          setJustResubmitted(true);
          setIsResubmitMode(false);
          await fetchApplicationStatus(token);
        }
      } else if (data.code === "AUTO_APPROVED" || data.code === "CREATED" || data.success) {
        // Case D — Registration successful!
        // Immediately redirect user to "Set Your Password" page without asking to log in first!
        const token = data.token;
        if (token) {
          setSavedToken(token);
        }

        setPendingRegData({
          fullName: cleanName,
          email: cleanEmail,
          regNumber: cleanReg,
          token: token,
          userId: data.userId,
        });

        // Clear password setup form state
        setNewPassword("");
        setConfirmPassword("");
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setSetPasswordError("");
        setSetPasswordSuccess("");

        // Immediately transition to Set Your Password page
        setAuthMode("set_password");
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

  // Handle Set Your Password form submission
  async function handleSetPasswordSubmit(e) {
    e.preventDefault();
    setSetPasswordError("");
    setSetPasswordSuccess("");

    if (!pendingRegData?.email) {
      setSetPasswordError("Registration session expired. Please register again.");
      return;
    }

    if (newPassword.length < 6) {
      setSetPasswordError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSetPasswordError("Passwords do not match. Please re-enter.");
      return;
    }

    setSavingPassword(true);

    try {
      let passwordSaved = false;

      // 1. Primary: Use dedicated set_registration_password RPC (no login required)
      if (pendingRegData.token) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("set_registration_password", {
          p_email: pendingRegData.email,
          p_token: pendingRegData.token,
          p_password: newPassword,
        });

        if (!rpcErr && (rpcData?.success || rpcData === true)) {
          passwordSaved = true;
        }
      }

      // 2. Fallback: Authenticate with initial temporary credentials and update securely
      if (!passwordSaved) {
        try {
          sessionStorage.setItem("campusride_setting_password", "true");
        } catch (_) {}

        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: pendingRegData.email,
          password: pendingRegData.regNumber,
        });

        if (signInErr) throw signInErr;

        // Try set_user_password RPC
        let updatedViaUserRpc = false;
        const { data: userRpcData, error: userRpcErr } = await supabase.rpc("set_user_password", {
          new_password: newPassword,
        });

        if (!userRpcErr && (userRpcData?.success || userRpcData === true)) {
          updatedViaUserRpc = true;
        }

        if (!updatedViaUserRpc) {
          const { error: authUpdateErr } = await supabase.auth.updateUser({
            password: newPassword,
          });
          if (authUpdateErr) throw authUpdateErr;
        }

        // Clear must_change_password flag in profiles
        try {
          await supabase
            .from("profiles")
            .update({ must_change_password: false, updated_at: new Date().toISOString() })
            .eq("id", signInData.user.id);
        } catch (_) {}
      }

      // Clear password setting guard now that password is saved
      try {
        sessionStorage.removeItem("campusride_setting_password");
      } catch (_) {}

      setSetPasswordSuccess("Password saved successfully! Logging you in...");

      const targetEmail = pendingRegData.email;
      const targetPassword = newPassword;

      // Automatically log in the student directly into CampusRide!
      setTimeout(() => {
        setAuthMode("login");
        setEmail(targetEmail);
        setPassword(targetPassword);
        setPendingRegData(null);
        if (onLogin) {
          onLogin({ email: targetEmail, password: targetPassword });
        }
      }, 600);
    } catch (err) {
      console.error("Set password error:", err);
      setSetPasswordError(err.message || "Failed to save password. Please try again.");
      try {
        sessionStorage.removeItem("campusride_setting_password");
      } catch (_) {}
    } finally {
      setSavingPassword(false);
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
    setOtpSent(false);
    setOtpVerified(false);
    setVerificationToken("");
    setVerifiedEmail("");
    setOtpCode("");
    setOtpNotice("");
    setOtpError("");
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
        {/* Modern Segmented Navigation Tabs */}
        <div className="auth-segmented-nav">
          <button
            type="button"
            className={`auth-segment-pill ${authMode === "login" ? "active" : ""}`}
            onClick={() => {
              setAuthMode("login");
              if (onClearError) onClearError();
            }}
          >
            <Lock size={14} />
            <span>Log In</span>
          </button>
          <button
            type="button"
            className={`auth-segment-pill ${authMode === "register" || authMode === "set_password" ? "active" : ""}`}
            onClick={() => {
              if (authMode !== "set_password") {
                setAuthMode("register");
                setRegError("");
                setExistingAccountNotice("");
                setExistingAppNotice("");
              }
            }}
          >
            <Sparkles size={14} />
            <span>{authMode === "set_password" ? "Set Password" : "Register"}</span>
          </button>
        </div>

        {/* ===================== LOG IN MODE ===================== */}
        {authMode === "login" ? (
          <>
            <h2>Log In</h2>
            <p className="auth-subtitle">
              Enter your email and password to access your CampusRide account.
            </p>

            {loginNotice && (
              <div className="notice notice-success" role="status" style={{ marginBottom: "16px" }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0, color: "#166534" }} />
                <span>{loginNotice}</span>
              </div>
            )}

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
        ) : authMode === "set_password" ? (
          /* ===================== SET PASSWORD MODE ===================== */
          <div className="set-password-view" style={{ animation: "fadeIn 0.2s ease" }}>
            {/* 2-Step Registration Progress Indicator */}
            <div className="reg-step-tracker">
              <span className="reg-step-badge done">
                <span className="reg-step-circle">✓</span> Details & OTP
              </span>
              <span className="reg-step-arrow">→</span>
              <span className="reg-step-badge active">
                <span className="reg-step-circle">2</span> Set Password
              </span>
            </div>

            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(59, 130, 246, 0.2))",
                  color: "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 12px",
                }}
              >
                <KeyRound size={26} />
              </div>
              <h2 style={{ margin: "0 0 6px", fontSize: "22px" }}>Set Your Password</h2>
              <p className="auth-subtitle" style={{ margin: 0 }}>
                Choose a secure password. You'll be logged in automatically.
              </p>
            </div>

            {/* Account Info Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px 14px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                marginBottom: "18px",
                fontSize: "12.5px",
                color: "var(--ink)",
              }}
            >
              <CheckCircle2 size={15} style={{ color: "#16a34a", flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{pendingRegData?.fullName || regFullName}</span>
              <span style={{ color: "var(--muted)" }}>•</span>
              <span style={{ color: "var(--muted)", wordBreak: "break-all" }}>{pendingRegData?.email || regEmail}</span>
            </div>

            {setPasswordError && (
              <div className="notice notice-error" role="alert" style={{ marginBottom: "16px" }}>
                <AlertCircle size={15} />
                <span>{setPasswordError}</span>
              </div>
            )}

            {setPasswordSuccess && (
              <div className="notice notice-success" role="status" style={{ marginBottom: "16px" }}>
                <CheckCircle2 size={15} />
                <span>{setPasswordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSetPasswordSubmit} className="auth-form">
              <div className="field">
                <label className="field-label">
                  <Lock size={15} /> New Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 6 characters)"
                    disabled={savingPassword}
                    autoFocus
                    style={{ paddingRight: "42px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((p) => !p)}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <small style={{ color: "var(--muted)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                  Password must be at least 6 characters long.
                </small>
              </div>

              <div className="field">
                <label className="field-label">
                  <Lock size={15} /> Confirm Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    disabled={savingPassword}
                    style={{ paddingRight: "42px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <small style={{ color: "#dc2626", fontSize: "11px", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <AlertCircle size={12} /> Passwords do not match
                  </small>
                )}
                {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
                  <small style={{ color: "#16a34a", fontSize: "11px", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <CheckCircle2 size={12} /> Passwords match
                  </small>
                )}
              </div>

              <button
                type="submit"
                className="button button-primary button-full auth-submit-btn"
                disabled={savingPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                style={{ marginTop: "10px" }}
              >
                {savingPassword ? "Saving & Logging In..." : "Save Password & Log In"}
              </button>

              <div style={{ marginTop: "14px", textAlign: "center" }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      sessionStorage.removeItem("campusride_setting_password");
                      await supabase.auth.signOut();
                    } catch (_) {}
                    setAuthMode("login");
                    setPendingRegData(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    fontSize: "12.5px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Cancel and go to Login
                </button>
              </div>
            </form>
          </div>
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
                      <h3 style={{ margin: "0 0 6px", fontSize: "18px", color: "#166534", fontWeight: 700 }}>
                        Application Approved & Account Active!
                      </h3>
                      <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#15803d", lineHeight: 1.5 }}>
                        Your SRM email has been verified and your account is now active.
                      </p>

                      <div
                        style={{
                          background: "#ffffff",
                          border: "1px solid #86efac",
                          borderRadius: "10px",
                          padding: "14px 16px",
                          marginBottom: "12px",
                        }}
                      >
                        <p style={{ margin: 0, fontSize: "13px", color: "#166534", lineHeight: 1.5 }}>
                          Please use your registered SRM email and account password to log in to CampusRide.
                        </p>
                      </div>

                      <p style={{ margin: "10px 0 0", fontSize: "13px", color: "#15803d", fontWeight: 600 }}>
                        💙 Welcome to CampusRide — Your campus. Your ride. Your community.
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

                {/* Application Details Summary (Hidden on registration success screen) */}
                {activeRegistration.status !== "approved" && (
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
                )}

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
                {!isResubmitMode && (
                  <div className="reg-step-tracker">
                    <span className="reg-step-badge active">
                      <span className="reg-step-circle">1</span> Details & OTP
                    </span>
                    <span className="reg-step-arrow">→</span>
                    <span className="reg-step-badge">
                      <span className="reg-step-circle">2</span> Set Password
                    </span>
                  </div>
                )}

                <div className="reg-header">
                  <div className="reg-trust-pill">
                    <ShieldCheck size={13} />
                    Verified SRM-AP Community
                  </div>
                  <h2>{isResubmitMode ? "Update Application" : "Create Student Account"}</h2>
                  <p>
                    {isResubmitMode
                      ? "Correct your details and submit a new application."
                      : "Join CampusRide with your official SRM student credentials."}
                  </p>
                </div>

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
                      placeholder="e.g. Rahul Sharma"
                      disabled={regBusy}
                    />
                  </div>

                  <div className="field">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label className="field-label" style={{ marginBottom: 0 }}>
                        <Mail size={15} /> SRM Email Address
                      </label>
                      {!isResubmitMode && otpVerified && regEmail.trim().toLowerCase() === verifiedEmail && (
                        <span className="reg-verified-pill">
                          <CheckCircle2 size={13} /> Verified
                        </span>
                      )}
                    </div>

                    <div className="reg-email-input-group">
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={handleEmailChange}
                        placeholder="your_name@srmap.edu.in"
                        disabled={regBusy || (otpVerified && !isResubmitMode)}
                        style={{ flex: 1 }}
                      />
                      {!isResubmitMode && (
                        otpVerified ? (
                          <button
                            type="button"
                            className="reg-otp-btn"
                            onClick={() => {
                              setOtpVerified(false);
                              setVerificationToken("");
                              setVerifiedEmail("");
                            }}
                            title="Edit email address"
                          >
                            Change
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="reg-otp-btn"
                            onClick={handleSendOtp}
                            disabled={otpSending || otpCooldown > 0 || regBusy || !regEmail.trim().toLowerCase().endsWith("@srmap.edu.in")}
                          >
                            {otpSending ? (
                              <>
                                <RefreshCw size={13} className="spin-icon" /> Sending...
                              </>
                            ) : otpCooldown > 0 ? (
                              `Resend (${otpCooldown}s)`
                            ) : otpSent ? (
                              "Resend Code"
                            ) : (
                              "Send Code"
                            )}
                          </button>
                        )
                      )}
                    </div>
                    <small style={{ color: "var(--muted)", fontSize: "11.5px", marginTop: "5px", display: "block" }}>
                      Only official @srmap.edu.in student emails are accepted.
                    </small>

                    {/* Error message before OTP input box is shown */}
                    {!isResubmitMode && !otpSent && otpError && (
                      <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <AlertCircle size={13} style={{ flexShrink: 0 }} />
                        <span>{otpError}</span>
                      </div>
                    )}

                    {/* Redesigned Sleek OTP verification card */}
                    {!isResubmitMode && otpSent && !otpVerified && (
                      <div className="reg-otp-card">
                        <div className="reg-otp-header">
                          <span className="reg-otp-header-title">
                            <Sparkles size={14} style={{ color: "var(--blue, #2563eb)" }} />
                            Enter 6-Digit OTP Code
                          </span>
                          <span className="reg-otp-header-expiry">
                            <Clock size={11} style={{ marginRight: "3px", verticalAlign: "middle" }} />
                            Valid 5m
                          </span>
                        </div>

                        <div className="reg-otp-input-row">
                          <input
                            type="text"
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                            placeholder="······"
                            className="reg-otp-digits-input"
                            disabled={otpVerifying || regBusy}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="button button-primary reg-otp-verify-action-btn"
                            onClick={handleVerifyOtp}
                            disabled={otpVerifying || otpCode.trim().length !== 6 || regBusy}
                          >
                            {otpVerifying ? "Verifying..." : "Verify Code"}
                          </button>
                        </div>

                        {otpError && (
                          <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <AlertCircle size={13} style={{ flexShrink: 0 }} />
                            <span>{otpError}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="field">
                    <label className="field-label">
                      <IdCard size={15} /> SRM Registration Number
                    </label>
                    <input
                      type="text"
                      required
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. AP21110010xxx"
                      disabled={regBusy}
                    />
                    <small style={{ color: "var(--muted)", fontSize: "11.5px", marginTop: "4px", display: "block" }}>
                      Must match your SRM-AP Student ID card.
                    </small>
                  </div>

                  <button
                    type="submit"
                    className="button button-primary button-full auth-submit-btn"
                    disabled={regBusy || otpVerifying}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "18px" }}
                  >
                    {regBusy ? (
                      <>
                        <RefreshCw size={15} className="spin-icon" />
                        <span>Registering...</span>
                      </>
                    ) : isResubmitMode ? (
                      "Resubmit Application"
                    ) : (
                      <>
                        <span>Continue to Set Password</span>
                        <ArrowRight size={15} />
                      </>
                    )}
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
