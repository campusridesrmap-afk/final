import { useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle, X, Loader2, Flag } from "lucide-react";

export default function RideActionConfirmModal({
  isOpen,
  type = "complete", // "complete" | "cancel_sharing" | "withdraw_request" | "cancel_booking"
  onConfirm,
  onClose,
  busy = false,
  error = "",
}) {
  const goBackBtnRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the safe "Go Back" button by default
      goBackBtnRef.current?.focus();

      const handleKeyDown = (e) => {
        if (e.key === "Escape" && !busy) {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  let title = "Complete this ride?";
  let message =
    "Are you sure you want to end this ride? Once you confirm, the ride will be marked as completed for both you and the other participants. Contact details and protected location information will no longer be available. This action cannot be undone.";
  let confirmText = "Yes, Complete Ride";
  let isDanger = false;
  let iconBg = "rgba(16, 185, 129, 0.12)";
  let iconColor = "#059669";
  let icon = <CheckCircle2 size={24} color={iconColor} />;

  if (type === "complete") {
    title = "Complete this ride?";
    message =
      "Are you sure you want to end this ride? Once you confirm, the ride will be marked as completed for both you and the other participants. Contact details and protected location information will no longer be available. This action cannot be undone.";
    confirmText = "Yes, Complete Ride";
    isDanger = false;
    iconBg = "rgba(16, 185, 129, 0.12)";
    iconColor = "#059669";
    icon = <CheckCircle2 size={24} color={iconColor} />;
  } else if (type === "cancel_sharing") {
    title = "Cancel this ride sharing?";
    message =
      "Are you sure you want to cancel this ride? Cancelling will make the ride unavailable for new requests and affect existing participants. All pending and accepted co-riders will be informed that the ride is cancelled. Contact details and live location sharing will be closed immediately. This action cannot be undone.";
    confirmText = "Yes, Cancel Sharing";
    isDanger = true;
    iconBg = "rgba(225, 29, 72, 0.12)";
    iconColor = "#e11d48";
    icon = <AlertTriangle size={24} color={iconColor} />;
  } else if (type === "withdraw_request") {
    title = "Withdraw seat request?";
    message =
      "Are you sure you want to withdraw your pending seat request for this ride? Once withdrawn, your request will be cancelled.";
    confirmText = "Yes, Withdraw Request";
    isDanger = true;
    iconBg = "rgba(217, 119, 6, 0.12)";
    iconColor = "#d97706";
    icon = <AlertTriangle size={24} color={iconColor} />;
  } else if (type === "cancel_booking") {
    title = "Cancel confirmed booking?";
    message =
      "Are you sure you want to cancel your confirmed seat on this ride? Your reserved seats will be released back to the vehicle sharer, and contact and location sharing will be closed immediately. This action cannot be undone.";
    confirmText = "Yes, Cancel Booking";
    isDanger = true;
    iconBg = "rgba(225, 29, 72, 0.12)";
    iconColor = "#e11d48";
    icon = <AlertTriangle size={24} color={iconColor} />;
  }

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1200 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="ride-action-modal-card">
        <div className="onboarding-header">
          <div
            className="onboarding-icon-box"
            style={{ background: iconBg }}
          >
            {icon}
          </div>
          <div>
            <h3 id="confirm-modal-title">{title}</h3>
            <p>{message}</p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="notice notice-error" role="alert" style={{ marginBottom: "16px" }}>
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        <div className="ride-action-modal-actions">
          <button
            ref={goBackBtnRef}
            type="button"
            className="button button-outline"
            onClick={onClose}
            disabled={busy}
          >
            Go Back
          </button>
          <button
            type="button"
            className={`button ${isDanger ? "button-danger" : "button-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            <span>{busy ? "Processing..." : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
