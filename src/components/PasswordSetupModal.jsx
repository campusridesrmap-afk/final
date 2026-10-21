import { useState } from "react";
import { Lock, KeyRound, ShieldCheck, CheckCircle2, AlertCircle, Eye, EyeOff, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function PasswordSetupModal({
  mode = "first_login", // "first_login" | "change_password"
  onSuccess,
  onClose,
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");

  const isFirstLogin = mode === "first_login";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessNotice("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);

    try {
      // 1. Primary: Use secure PostgreSQL RPC function.
      // Updates auth.users password directly via crypt() in the database.
      // Advantage: Does NOT trigger Supabase GoTrue's mailer/SMTP, avoiding unnecessary confirmation emails
      // and conserving email quota while keeping strict authentication and validation.
      let updatedViaRpc = false;
      const { data: rpcData, error: rpcErr } = await supabase.rpc("set_user_password", {
        new_password: password,
      });

      if (!rpcErr && (rpcData?.success || rpcData === true)) {
        updatedViaRpc = true;
      } else if (rpcErr) {
        // If the function returned a validation or authentication exception, throw it directly
        // rather than falling back to updateUser (which triggers email dispatches)
        if (
          rpcErr.code === "P0001" ||
          rpcErr.message?.includes("authenticated") ||
          rpcErr.message?.includes("characters")
        ) {
          throw new Error(rpcErr.message || "Failed to update password.");
        }
        // Fallback to auth.updateUser below if RPC is missing
      }

      // 2. Fallback only if RPC function does not exist in the database
      if (!updatedViaRpc) {
        const { error: authError } = await supabase.auth.updateUser({
          password: password,
        });

        if (authError) throw authError;

        // Clear must_change_password flag
        try {
          const { error: compRpcErr } = await supabase.rpc("complete_password_change");
          if (compRpcErr) {
            const userRes = await supabase.auth.getUser();
            if (userRes.data?.user?.id) {
              await supabase
                .from("profiles")
                .update({ must_change_password: false, updated_at: new Date().toISOString() })
                .eq("id", userRes.data.user.id);
            }
          }
        } catch (_profileErr) {
          // Flag clearing failure handled gracefully
        }
      }

      setSuccessNotice("Password updated successfully!");

      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 900);
    } catch (err) {
      console.error("Password update error:", err);
      setError(err.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const title = isFirstLogin
    ? "Set Your Personal Password"
    : "Change Your Password";

  const description = isFirstLogin
    ? "Welcome to CampusRide! Your account was pre-registered by SRM-AP administration. Please set a secure personal password to activate your account."
    : "Update your account password. Choose a strong password with at least 6 characters.";

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="profile-onboarding-card password-setup-card">
        <div className="onboarding-header">
          <div className="onboarding-icon-box">
            {isFirstLogin ? <KeyRound size={26} /> : <ShieldCheck size={26} />}
          </div>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          {!isFirstLogin && onClose && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {error && (
          <div className="notice notice-error" role="alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {successNotice && (
          <div className="notice notice-success" role="status">
            <CheckCircle2 size={15} />
            <span>{successNotice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="onboarding-form">
          <div className="field">
            <label className="field-label">
              <Lock size={15} /> New Password
            </label>
            <div className="password-input-wrapper" style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password (min. 6 chars)"
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                  display: "grid",
                  placeItems: "center",
                  padding: "4px",
                }}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field-label">
              <Lock size={15} /> Confirm New Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="onboarding-actions" style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
            {!isFirstLogin && onClose && (
              <button
                type="button"
                className="button button-outline"
                style={{ flex: 1 }}
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="button button-primary"
              style={{ flex: 1 }}
              disabled={loading}
            >
              {loading ? "Saving Password..." : isFirstLogin ? "Activate & Continue" : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
