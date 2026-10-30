import { useState, useRef, useEffect } from "react";
import { User, Phone, IdCard, CheckCircle2, ShieldCheck, X, KeyRound, Users, ChevronDown, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import PasswordSetupModal from "./PasswordSetupModal";

const GENDER_OPTIONS = [
  {
    value: "Male",
    label: "Male",
    colorClass: "gender-male",
    textColor: "#2563eb",
  },
  {
    value: "Female",
    label: "Female",
    colorClass: "gender-female",
    textColor: "#db2777",
  },
  {
    value: "Others",
    label: "Others",
    colorClass: "gender-others",
    textColor: "#64748b",
  },
];

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
  const [gender, setGender] = useState(
    initialProfile?.gender || user?.user_metadata?.gender || ""
  );
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const genderDropdownRef = useRef(null);

  const [mobileNumber, setMobileNumber] = useState(
    initialProfile?.mobile_number || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  // Dismiss dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (genderDropdownRef.current && !genderDropdownRef.current.contains(e.target)) {
        setGenderDropdownOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setGenderDropdownOpen(false);
    }
    if (genderDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [genderDropdownOpen]);

  // Sync profile details if hydrated asynchronously
  useEffect(() => {
    if (initialProfile?.gender && !gender) {
      setGender(initialProfile.gender);
    }
    if (initialProfile?.full_name && !fullName) {
      setFullName(initialProfile.full_name);
    }
    if (initialProfile?.registration_number && !regNo) {
      setRegNo(initialProfile.registration_number);
    }
    if (initialProfile?.mobile_number && !mobileNumber) {
      setMobileNumber(initialProfile.mobile_number);
    }
  }, [initialProfile]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) return;
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!gender) {
      setError("Please select your gender.");
      return;
    }

    let cleanPhone = mobileNumber.replace(/\D/g, "");
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.slice(1);
    }

    if (!cleanPhone) {
      setError("Please provide a contact number so co-riders can reach you.");
      return;
    }

    if (cleanPhone.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: user.id,
        full_name: fullName.trim(),
        registration_number: regNo.trim().toUpperCase(),
        mobile_number: cleanPhone,
        gender: gender,
        profile_completed: true,
      };

      // Also sync to auth user_metadata for immediate session persistence
      await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          gender: gender,
        },
      }).catch(() => {});

      let { error: upsertError } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      // If profiles table does not have 'gender' column yet (error code 42703), fallback to base payload
      if (upsertError && (upsertError.code === "42703" || upsertError.message?.includes("gender"))) {
        const fallbackPayload = {
          id: user.id,
          full_name: fullName.trim(),
          registration_number: regNo.trim().toUpperCase(),
          mobile_number: cleanPhone,
          profile_completed: true,
        };
        const res = await supabase.from("profiles").upsert(fallbackPayload, { onConflict: "id" });
        upsertError = res.error;
      }

      if (upsertError) throw upsertError;

      onSave(payload);
    } catch (err) {
      if (
        err?.message?.includes("profiles_registration_number_unique_idx") ||
        (err?.code === "23505" &&
          (err?.message?.includes("registration_number") ||
           err?.details?.includes("registration_number") ||
           err?.message?.includes("profiles_registration_number"))) ||
        err?.code === "23505"
      ) {
        setError(
          "This registration number already exists in another account. Please check your registration number and try again."
        );
      } else {
        setError(err.message || "Failed to save profile.");
      }
    } finally {
      setSaving(false);
    }
  }

  const isProfileComplete = Boolean(
    initialProfile?.profile_completed &&
    initialProfile?.full_name &&
    initialProfile?.full_name.trim() &&
    initialProfile?.mobile_number &&
    initialProfile?.mobile_number.trim() &&
    initialProfile?.gender &&
    initialProfile?.gender.trim()
  );

  const content = (
    <div className="profile-onboarding-card">
      <div className="onboarding-header">
        <div className="onboarding-icon-box">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h3>Your Campus Profile</h3>
          <p>
            Connect with verified SRM-AP students. Your phone number is only shared after a ride request is confirmed.
          </p>
        </div>
        {isModal && onClose && isProfileComplete && (
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

        {/* Gender Selection Field */}
        <div className="field" ref={genderDropdownRef} style={{ position: "relative" }}>
          <label className="field-label">
            <Users size={15} /> Gender <span style={{ color: "#dc2626" }}>*</span>
          </label>

          <button
            type="button"
            className={`gender-select-trigger ${genderDropdownOpen ? "open" : ""}`}
            onClick={() => setGenderDropdownOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={genderDropdownOpen}
          >
            {gender ? (
              <span className={`gender-selected-text ${gender.toLowerCase()}`}>
                <span className="gender-word">{gender}</span>
              </span>
            ) : (
              <span className="gender-placeholder">Select Gender</span>
            )}
            <ChevronDown
              size={16}
              className={`gender-chevron ${genderDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          {genderDropdownOpen && (
            <div className="gender-dropdown-menu" role="listbox">
              {GENDER_OPTIONS.map((opt) => {
                const isSelected = gender === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`gender-dropdown-option ${opt.colorClass} ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      setGender(opt.value);
                      setGenderDropdownOpen(false);
                      setError("");
                    }}
                  >
                    <strong className="gender-opt-label">{opt.label}</strong>
                    {isSelected && <Check size={16} className="gender-check" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="field">
          <label className="field-label">
            <Phone size={15} /> Mobile / WhatsApp Number <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            type="tel"
            required
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            placeholder="e.g. 9876543210"
          />
          <small className="field-help-text">
            Required for co-riders to contact and coordinate pickups.
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
      {isModal ? (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && isProfileComplete && onClose) {
              onClose();
            }
          }}
        >
          {content}
        </div>
      ) : (
        content
      )}
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
