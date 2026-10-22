// ==============================================================================
// CAMPUSRIDE - SECURE EMAIL OTP VERIFICATION WEB APP
// SRM University-AP Carpooling Platform
// Google Apps Script Web App
// ==============================================================================

const CAMPUSRIDE_CONFIG = {
  senderName: "CampusRide SRM AP",
  website: "https://campusridesrmap.vercel.app/",
};

/**
 * Handles incoming HTTP POST requests from Supabase Edge Functions.
 * Exclusively provides secure email OTP delivery for student registration verification.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(10000);
  if (!acquired) {
    return jsonResponse({ success: false, error: "Server busy. Could not acquire script lock." });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "Missing POST request body" });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: "Malformed JSON body" });
    }

    // 1. Validate Shared Secret from Script Properties
    var expectedSecret = PropertiesService.getScriptProperties().getProperty("CAMPUSRIDE_SECRET");
    if (!expectedSecret || !payload.secret || payload.secret !== expectedSecret) {
      return jsonResponse({ success: false, error: "Unauthorized: Invalid or missing secret" });
    }

    // 2. Action: Send Registration Verification OTP
    if (payload.action === "send_otp") {
      var otpEmail = (payload.email || "").toString().trim().toLowerCase();
      var otpCode = (payload.otp || payload.otpCode || "").toString().trim();

      if (!otpEmail || !otpCode) {
        return jsonResponse({ success: false, error: "Missing required fields (email, otp)" });
      }

      var srmEmailPattern = /^[a-zA-Z0-9._%+-]+@srmap\.edu\.in$/i;
      if (!srmEmailPattern.test(otpEmail)) {
        return jsonResponse({ success: false, error: "Invalid recipient email domain. Only @srmap.edu.in is allowed." });
      }

      if (!/^\d{6}$/.test(otpCode)) {
        return jsonResponse({ success: false, error: "Invalid OTP format. Must be a 6-digit code." });
      }

      var otpSubject = "CampusRide Verification Code: " + otpCode;
      var otpPlainText =
        "Your CampusRide verification code is: " + otpCode + "\n\n" +
        "This code will expire in 5 minutes.\n" +
        "Please enter this code on the registration page to verify your SRM University-AP email address.\n\n" +
        "Security Notice:\n" +
        "Do not share this code with anyone. CampusRide team members will never ask for your verification code.\n\n" +
        "Best regards,\nTeam CampusRide\n" + CAMPUSRIDE_CONFIG.website;

      var otpHtml = createOtpEmail(otpCode);

      try {
        sendEmail(otpEmail, otpSubject, otpPlainText, otpHtml);
        Logger.log("Verification OTP email successfully sent to: " + otpEmail);
        return jsonResponse({
          success: true,
          emailSent: true,
          recipient: otpEmail,
          sentAt: new Date().toISOString(),
        });
      } catch (otpMailErr) {
        Logger.log("OTP email sending failed: " + otpMailErr.message);
        return jsonResponse({
          success: false,
          emailSent: false,
          error: "Failed to send OTP email: " + otpMailErr.message,
        });
      }
    }

    return jsonResponse({ success: false, error: "Unsupported action: " + payload.action });
  } catch (err) {
    Logger.log("doPost execution error: " + err.message);
    return jsonResponse({ success: false, error: err.message || "Internal script error" });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Returns formatted JSON response.
 */
function jsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Email sending helper using GmailApp.
 */
function sendEmail(to, subject, plainText, html) {
  GmailApp.sendEmail(to, subject, plainText, {
    htmlBody: html,
    name: CAMPUSRIDE_CONFIG.senderName,
  });
}

/**
 * HTML escaping helper.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Branded SRM University-AP verification code HTML email template.
 */
function createOtpEmail(otpCode) {
  const code = escapeHtml(otpCode);
  const website = CAMPUSRIDE_CONFIG.website;

  return `
    <meta charset="UTF-8">
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#263238;line-height:1.7;">
      <div style="text-align:center;padding:20px 0 10px;">
        <h2 style="color:#174A83;margin:0 0 6px;">CampusRide &bull; Email Verification</h2>
        <p style="margin:0;color:#64748b;font-size:14px;">SRM University-AP Carpooling Platform</p>
      </div>

      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px 28px;margin:16px 0;">
        <p style="margin-top:0;font-size:15px;">Hello,</p>
        <p style="font-size:15px;color:#334155;">
          Use the 6-digit verification code below to verify your SRM University-AP student email address for CampusRide registration:
        </p>

        <div style="background:#EAF3FF;border:1px dashed #93c5fd;border-radius:10px;padding:18px;margin:20px 0;text-align:center;">
          <span style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#174A83;font-family:'Courier New',Courier,monospace;">${code}</span>
        </div>

        <p style="font-size:13px;color:#64748b;margin:14px 0 0;">
          &#9201; <b>This code is valid for 5 minutes.</b> If you did not request this verification, you can safely ignore this email.
        </p>

        <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0;" />

        <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:12px 14px;">
          <p style="margin:0;font-size:12px;color:#92400e;">
            &#128274; <b>Security reminder:</b> Never share this verification code with anyone. CampusRide administrators and moderators will never ask for your code.
          </p>
        </div>
      </div>

      <div style="text-align:center;font-size:12px;color:#94a3b8;padding:12px 0;">
        <p style="margin:0 0 4px;"><a href="${website}" style="color:#174A83;text-decoration:none;">CampusRide SRM AP</a> &bull; Share rides. Split costs. Commute smarter.</p>
        <p style="margin:0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}
