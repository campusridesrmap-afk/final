import { useEffect, useState, useCallback, useRef } from "react";
import {
  Users,
  Check,
  X,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Calendar,
  Mail,
  IdCard,
  Send,
  Bell,
  BellRing,
  BellOff,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  isPushSupported,
  getNotificationPermission,
  subscribeAdminPush,
  unsubscribeAdminPush,
  hasActivePushSubscription,
  sendLocalTestNotification,
} from "../lib/pushNotifications";

export default function AdminRegistrations({ onRefreshHeaderBadge }) {
  const [filter, setFilter] = useState("pending"); // "pending" | "approved" | "rejected" | "all"
  const [searchQuery, setSearchQuery] = useState("");
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Push notifications state for administrator alerts
  const [pushStatus, setPushStatus] = useState("checking"); // "checking" | "granted" | "denied" | "default" | "unsupported"
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // Modal / Confirm state
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: "approve", // "approve" | "reject"
    registration: null,
    reason: "",
  });

  const onRefreshHeaderBadgeRef = useRef(onRefreshHeaderBadge);
  onRefreshHeaderBadgeRef.current = onRefreshHeaderBadge;

  // Initialize push notification subscription state on mount
  useEffect(() => {
    if (!isPushSupported()) {
      setPushStatus("unsupported");
      return;
    }
    const perm = getNotificationPermission();
    setPushStatus(perm);

    if (perm === "granted") {
      hasActivePushSubscription().then((active) => {
        setIsPushSubscribed(active);
        // Automatically sync subscription to database if browser permission is already active
        if (!active) {
          subscribeAdminPush(supabase).then((res) => {
            if (res?.success) setIsPushSubscribed(true);
          });
        }
      });
    }
  }, []);

  async function handleTogglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    setActionError("");
    setActionSuccess("");

    if (!isPushSupported()) {
      setActionError("Push notifications are not supported in this browser environment.");
      setPushBusy(false);
      return;
    }

    const currentPerm = getNotificationPermission();

    if (currentPerm === "denied") {
      setActionError(
        "Notifications are blocked in your browser or phone site settings. To receive phone alerts for new student requests, please enable notifications for CampusRide in your browser/device site settings."
      );
      setPushBusy(false);
      return;
    }

    if (isPushSubscribed) {
      await unsubscribeAdminPush(supabase);
      setIsPushSubscribed(false);
      setActionSuccess("Push notifications disabled for this device.");
      setPushBusy(false);
      return;
    }

    const res = await subscribeAdminPush(supabase);
    setPushStatus(getNotificationPermission());

    if (res.success) {
      setIsPushSubscribed(true);
      setActionSuccess(
        "Phone push alerts activated! You will receive instant notifications whenever a student submits a registration request."
      );
    } else if (res.reason === "permission_denied") {
      setActionError("Notification permission was not granted.");
    } else {
      setActionError(res.error || "Failed to enable push notifications.");
    }
    setPushBusy(false);
  }

  async function handleSendTestPush() {
    if (pushBusy) return;
    setPushBusy(true);
    setActionError("");
    setActionSuccess("");
    try {
      const shown = await sendLocalTestNotification();
      if (shown) {
        setActionSuccess("Test notification delivered to your device! Check your notification tray.");
      } else {
        const { data: testData, error: testErr } = await supabase.functions.invoke(
          "notify-admins-new-registration",
          { body: { test: true } }
        );
        if (!testErr && testData?.success) {
          setActionSuccess(
            `Test notification dispatched to ${testData.deliveredCount} registered administrator device(s).`
          );
        } else {
          setActionError("Could not deliver test notification. Ensure notifications are permitted on this device.");
        }
      }
    } catch (err) {
      setActionError("Test alert note: " + (err.message || "Failed to trigger test notification."));
    } finally {
      setPushBusy(false);
    }
  }

  const loadRegistrations = useCallback(async (statusFilter = filter) => {
    setLoading(true);
    setActionError("");
    try {
      const { data, error } = await supabase.rpc("admin_get_registrations", {
        p_status_filter: statusFilter,
      });

      if (error) {
        throw error;
      }

      let enrichedData = Array.isArray(data) ? data : [];

      // Additive check: fetch email tracking fields from registrations table if columns exist
      try {
        if (enrichedData.length > 0) {
          const regIds = enrichedData.map((r) => r.id);
          const { data: emailData } = await supabase
            .from("registrations")
            .select("id, welcome_email_status, welcome_email_sent_at, welcome_email_error")
            .in("id", regIds);

          if (Array.isArray(emailData) && emailData.length > 0) {
            const emailMap = new Map(emailData.map((e) => [e.id, e]));
            enrichedData = enrichedData.map((reg) => {
              const tracking = emailMap.get(reg.id);
              return {
                ...reg,
                welcome_email_status: tracking?.welcome_email_status || "not_sent",
                welcome_email_sent_at: tracking?.welcome_email_sent_at || null,
                welcome_email_error: tracking?.welcome_email_error || null,
              };
            });
          }
        }
      } catch (_colErr) {
        // Table columns may not yet be migrated in some environments; graceful fallback
      }

      setRegistrations(enrichedData);
      if (onRefreshHeaderBadgeRef.current) {
        onRefreshHeaderBadgeRef.current();
      }
    } catch (err) {
      console.error("Failed to load admin registrations:", err);
      setActionError(
        err.message || "Failed to load registrations. Ensure admin permissions are active."
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadRegistrations(filter);
  }, [filter, loadRegistrations]);

  function handleOpenApprove(reg) {
    setConfirmModal({
      isOpen: true,
      type: "approve",
      registration: reg,
      reason: "",
    });
  }

  function handleOpenReject(reg) {
    setConfirmModal({
      isOpen: true,
      type: "reject",
      registration: reg,
      reason: "",
    });
  }

  async function handleConfirmAction() {
    const { type, registration, reason } = confirmModal;
    if (!registration) return;

    setActionBusyId(registration.id);
    setActionError("");
    setActionSuccess("");

    try {
      if (type === "approve") {
        // 1. Transactional account creation in PostgreSQL
        const { data, error } = await supabase.rpc("admin_approve_registration", {
          p_registration_id: registration.id,
        });

        if (error) throw error;
        if (!data?.success) {
          throw new Error(data?.message || "Approval failed.");
        }

        // 2. Asynchronous email dispatch: ONLY after successful account creation and approval
        let emailNote = "";
        try {
          const { data: emailRes, error: emailErr } = await supabase.functions.invoke(
            "send-welcome-email",
            {
              body: { registrationId: registration.id },
            }
          );

          if (emailErr || !emailRes?.success) {
            const failMsg = emailErr?.message || emailRes?.error || "Delivery pending/failed";
            emailNote = ` (Welcome email not sent: ${failMsg}. You can retry sending below).`;
          } else if (emailRes?.emailSent) {
            emailNote = " Welcome email sent successfully.";
          }
        } catch (dispatchErr) {
          emailNote = " (Welcome email service unreachable; you can retry below).";
        }

        setActionSuccess(
          `Approved ${registration.full_name}. Student account created with registration number as initial password.${emailNote}`
        );
      } else if (type === "reject") {
        // Rejections NEVER trigger emails or account creation
        const { data, error } = await supabase.rpc("admin_reject_registration", {
          p_registration_id: registration.id,
          p_reason: reason.trim(),
        });

        if (error) throw error;
        if (!data?.success) {
          throw new Error(data?.message || "Rejection failed.");
        }

        setActionSuccess(`Rejected registration for ${registration.full_name}.`);
      }

      setConfirmModal({ isOpen: false, type: "approve", registration: null, reason: "" });
      await loadRegistrations(filter);
    } catch (err) {
      console.error("Admin action error:", err);
      setActionError(err.message || "Operation failed.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleRetryEmail(reg) {
    if (!reg || actionBusyId) return;
    if (reg.welcome_email_status === "sent") return;

    // Concurrency & duplicate risk guard: ambiguous timeout confirmation
    if (reg.welcome_email_error && reg.welcome_email_error.includes("Ambiguous delivery state")) {
      const proceed = window.confirm(
        `Warning: The previous attempt for ${reg.full_name} encountered a network timeout.\n` +
        `It is possible the student already received the email.\n\n` +
        `Are you sure you want to trigger a manual resend?`
      );
      if (!proceed) return;
    }

    setActionBusyId(reg.id);
    setActionError("");
    setActionSuccess("");

    try {
      const { data: emailRes, error: emailErr } = await supabase.functions.invoke(
        "send-welcome-email",
        {
          body: { registrationId: reg.id },
        }
      );

      if (emailErr || !emailRes?.success) {
        throw new Error(emailErr?.message || emailRes?.error || "Email dispatch failed.");
      }

      if (emailRes.reason === "already_sent") {
        setActionSuccess(`Welcome email was already sent previously to ${reg.full_name}.`);
      } else {
        setActionSuccess(`Welcome email successfully sent to ${reg.full_name} (${reg.email}).`);
      }

      await loadRegistrations(filter);
    } catch (err) {
      console.error("Manual email retry error:", err);
      setActionError(err.message || "Failed to dispatch welcome email.");
    } finally {
      setActionBusyId(null);
    }
  }

  const filteredRegistrations = registrations.filter((reg) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (reg.full_name && reg.full_name.toLowerCase().includes(q)) ||
      (reg.email && reg.email.toLowerCase().includes(q)) ||
      (reg.registration_number && reg.registration_number.toLowerCase().includes(q))
    );
  });

  return (
    <div className="admin-registrations-container" style={{ maxWidth: "1080px", margin: "0 auto", padding: "20px 16px" }}>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={22} style={{ color: "var(--primary)" }} />
            <h2 style={{ margin: 0, fontSize: "22px", color: "var(--ink)" }}>Student Registrations</h2>
          </div>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "14px" }}>
            Verify pending student account requests and provision CampusRide access.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {isPushSupported() && (
            <>
              {pushStatus === "granted" && isPushSubscribed ? (
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={handleSendTestPush}
                  disabled={pushBusy}
                  title="Send test push notification to verify this device"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--success, #16a34a)" }}
                >
                  <BellRing size={14} />
                  <span>Alerts: Active (Test)</span>
                </button>
              ) : pushStatus === "denied" ? (
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={handleTogglePush}
                  title="Notifications are blocked in browser/phone site settings. Click for guidance."
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--danger, #dc2626)" }}
                >
                  <BellOff size={14} />
                  <span>Alerts: Blocked</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-outline button-small"
                  onClick={handleTogglePush}
                  disabled={pushBusy}
                  title="Enable phone push notifications for new student registration requests"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Bell size={14} />
                  <span>{pushBusy ? "Enabling..." : "Enable Phone Alerts"}</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => loadRegistrations(filter)}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="notice notice-error" role="alert" style={{ marginBottom: "16px" }}>
          <AlertCircle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="notice notice-success" role="status" style={{ marginBottom: "16px" }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="admin-filter-bar">
        <div className="filter-pill-group">
          <button
            type="button"
            className={`filter-pill ${filter === "pending" ? "active" : ""}`}
            onClick={() => setFilter("pending")}
          >
            Pending {filter === "pending" && `(${filteredRegistrations.length})`}
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "approved" ? "active" : ""}`}
            onClick={() => setFilter("approved")}
          >
            Approved
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "rejected" ? "active" : ""}`}
            onClick={() => setFilter("rejected")}
          >
            Rejected
          </button>
          <button
            type="button"
            className={`filter-pill ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
        </div>

        <div className="admin-search-wrapper">
          <Search size={15} className="admin-search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by name, email, or reg no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Registrations List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
          <RefreshCw size={28} className="spin-icon" style={{ color: "var(--primary)", marginBottom: "12px" }} />
          <p>Loading registrations...</p>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="empty-state-card" style={{ textAlign: "center", padding: "48px 20px", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: "12px" }}>
          <Users size={36} style={{ color: "var(--muted)", marginBottom: "10px" }} />
          <h4 style={{ margin: "0 0 6px", color: "var(--ink)" }}>No registrations found</h4>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
            {filter === "pending"
              ? "All submitted student registrations have been reviewed!"
              : `No registrations found matching "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="admin-registrations-grid">
          {filteredRegistrations.map((reg) => {
            const isBusy = actionBusyId === reg.id;
            const isPending = reg.status === "pending";

            return (
              <div
                key={reg.id}
                className="registration-card"
              >
                <div className="reg-details-block">
                  <div className="reg-title-row">
                    <strong className="reg-student-name">{reg.full_name}</strong>
                    <span className={`status-tag status-tag-${reg.status}`}>
                      {reg.status === "pending" && "Pending"}
                      {reg.status === "approved" && "Approved"}
                      {reg.status === "rejected" && "Rejected"}
                    </span>

                    {/* Email delivery status badge for approved students */}
                    {reg.status === "approved" && (
                      <span
                        className="status-tag"
                        style={{
                          fontSize: "12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          background:
                            reg.welcome_email_status === "sent"
                              ? "#dcfce7"
                              : reg.welcome_email_status === "sending"
                              ? "#fef3c7"
                              : reg.welcome_email_status === "failed"
                              ? "#fee2e2"
                              : "#f1f5f9",
                          color:
                            reg.welcome_email_status === "sent"
                              ? "#15803d"
                              : reg.welcome_email_status === "sending"
                              ? "#b45309"
                              : reg.welcome_email_status === "failed"
                              ? "#b91c1c"
                              : "#475569",
                        }}
                      >
                        {reg.welcome_email_status === "sent" && <Check size={12} />}
                        {reg.welcome_email_status === "sending" && (
                          <RefreshCw size={12} className="spin-icon" />
                        )}
                        {reg.welcome_email_status === "failed" && <AlertCircle size={12} />}
                        <span>
                          {reg.welcome_email_status === "sent"
                            ? "Email Sent"
                            : reg.welcome_email_status === "sending"
                            ? "Sending Email..."
                            : reg.welcome_email_status === "failed"
                            ? "Email Failed"
                            : "Email Not Sent"}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="reg-meta-row">
                    <span className="reg-meta-item reg-email-item">
                      <Mail size={13} /> <span className="reg-email-text">{reg.email}</span>
                    </span>
                    <span className="reg-meta-item">
                      <IdCard size={13} /> <strong>{reg.registration_number}</strong>
                    </span>
                    <span className="reg-meta-item">
                      <Calendar size={13} />
                      {new Date(reg.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {reg.rejection_reason && (
                    <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--danger)", wordBreak: "break-word" }}>
                      Reason: {reg.rejection_reason}
                    </div>
                  )}

                  {reg.welcome_email_error && reg.status === "approved" && (
                    <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--danger)", wordBreak: "break-word" }}>
                      Email Notice: {reg.welcome_email_error}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {isPending && (
                  <div className="reg-card-actions">
                    <button
                      type="button"
                      className="button button-primary button-small reg-action-btn"
                      onClick={() => handleOpenApprove(reg)}
                      disabled={isBusy}
                      style={{ background: "#16a34a", borderColor: "#16a34a" }}
                    >
                      <Check size={14} />
                      <span>Approve</span>
                    </button>

                    <button
                      type="button"
                      className="button button-outline button-small reg-action-btn"
                      onClick={() => handleOpenReject(reg)}
                      disabled={isBusy}
                      style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                    >
                      <X size={14} />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

                {/* Manual retry/send welcome email for approved students */}
                {reg.status === "approved" && reg.welcome_email_status !== "sent" && (
                  <div className="reg-card-actions">
                    <button
                      type="button"
                      className="button button-outline button-small reg-action-btn"
                      onClick={() => handleRetryEmail(reg)}
                      disabled={isBusy || reg.welcome_email_status === "sending"}
                      title="Dispatch welcome email to student SRM address"
                    >
                      <Send size={13} className={isBusy ? "spin-icon" : ""} />
                      <span>
                        {reg.welcome_email_status === "failed"
                          ? "Retry Welcome Email"
                          : "Send Welcome Email"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-card admin-modal-card">
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", color: "var(--ink)" }}>
              {confirmModal.type === "approve" ? "Confirm Approval" : "Confirm Rejection"}
            </h3>

            <p style={{ fontSize: "14px", color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.45 }}>
              {confirmModal.type === "approve" ? (
                <>
                  Are you sure you want to approve <strong>{confirmModal.registration?.full_name}</strong> (
                  {confirmModal.registration?.registration_number})? This will create their student account and authorize them to log in.
                </>
              ) : (
                <>
                  Are you sure you want to reject <strong>{confirmModal.registration?.full_name}</strong>?
                </>
              )}
            </p>

            {confirmModal.type === "reject" && (
              <div className="field" style={{ marginBottom: "16px" }}>
                <label className="field-label" style={{ fontSize: "13px" }}>
                  Rejection Reason (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Invalid registration number or non-current student"
                  value={confirmModal.reason}
                  onChange={(e) => setConfirmModal((prev) => ({ ...prev, reason: e.target.value }))}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", boxSizing: "border-box" }}
                />
              </div>
            )}

            <div className="admin-modal-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setConfirmModal({ isOpen: false, type: "approve", registration: null, reason: "" })}
                disabled={Boolean(actionBusyId)}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`button ${confirmModal.type === "approve" ? "button-primary" : "button-danger"}`}
                onClick={handleConfirmAction}
                disabled={Boolean(actionBusyId)}
                style={confirmModal.type === "approve" ? { background: "#16a34a", borderColor: "#16a34a" } : { background: "#dc2626", color: "#fff" }}
              >
                {actionBusyId ? "Processing..." : confirmModal.type === "approve" ? "Confirm & Approve" : "Confirm & Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
