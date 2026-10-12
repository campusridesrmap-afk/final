import { useState } from "react";
import { User, Phone, IdCard, CheckCircle2, ShieldCheck, X, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import PasswordSetupModal from "./PasswordSetupModal";

export default function ProfileOnboarding({
  user,
  initialProfile,
  onSave,
  onClose,
  isModal = false,
}) {
  const [fullName, setFullName] = useState(
    initialProfile?.full_name || user?.user_metadata?.full_name || ""
  );
  const [regNo, setRegNo] = useState(initialProfile?.registration_number || "");
  const [mobileNumber, setMobileNumber] = useState(
    initialProfile?.mobile_number || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) return;
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!mobileNumber.trim()) {
      setError("Please provide a contact number so co-riders can reach you.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: user.id,
        full_name: fullName.trim(),
        registration_number: regNo.trim().toUpperCase(),
        mobile_number: mobileNumber.trim(),
        profile_completed: true,
      };

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (upsertError) throw upsertError;

      onSave(payload);
    } catch (err) {
      setError(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <div className="profile-onboarding-card">
      <div className="onboarding-header">
        <div className="onboarding-icon-box">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h3>Complete Your Campus Profile</h3>
          <p>
            Connect with verified SRM-AP students. Your phone number is only shared
            after a ride request is confirmed.
          </p>
        </div>
        {isModal && onClose && (
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <form onSubmit={handleSubmit} className="onboarding-form">
        <div className="field">
          <label className="field-label">
            <User size={15} /> Full Name
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Rahul Sharma"
          />
        </div>

        <div className="field">
          <label className="field-label">
            <IdCard size={15} /> SRM AP Registration No.
          </label>
          <input
            type="text"
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder="e.g. AP21110010xxx"
          />
        </div>

        <div className="field">
          <label className="field-label">
            <Phone size={15} /> Mobile / WhatsApp Number
          </label>
          <input
            type="tel"
            required
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            placeholder="e.g. 9876543210"
          />
          <small className="field-help-text">
            For ride coordination & pickup calls.
          </small>
        </div>

        {passwordNotice && (
          <div className="notice notice-success" style={{ marginTop: "12px" }}>
            <CheckCircle2 size={15} />
            <span>{passwordNotice}</span>
          </div>
        )}

        <div className="onboarding-actions" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="submit"
            className="button button-primary button-full"
            disabled={saving}
          >
            {saving ? "Saving Profile..." : "Save Profile Details"}
          </button>

          <button
            type="button"
            className="button button-outline button-full"
            onClick={() => setShowChangePassword(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            <KeyRound size={15} />
            <span>Change Account Password</span>
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      {isModal ? <div className="modal-overlay">{content}</div> : content}
      {showChangePassword && (
        <PasswordSetupModal
          mode="change_password"
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setShowChangePassword(false);
            setPasswordNotice("Password updated successfully!");
          }}
        />
      )}
    </>
  );
}
