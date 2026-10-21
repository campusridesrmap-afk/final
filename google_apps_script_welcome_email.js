// ============================================
// CAMPUSRIDE - WELCOME EMAIL & SPREADSHEET AUTOMATION
// Google Apps Script Single-File Web App
// ============================================

const CAMPUSRIDE_CONFIG = {
  senderName: "Team CampusRide",
  subject: "Welcome to CampusRide! Your Account Details & Next Steps",
  website: "https://campusridesrmap.vercel.app/",
  whatsapp: "https://whatsapp.com/channel/0029VbEEd8KA2pLDtuNQ840D",
  sheetName: "Approved Students"
};

// Seed student list for manual preview & testing only
const STUDENTS = [
  { name: "Naga Sai Saketh Akella", email: "saketh_akella@srmap.edu.in", regNo: "AP26110020279" },
  { name: "Surya S", email: "surya_s@srmap.edu.in", regNo: "AP26110090020" }
];

// ============================================
// AUTOMATED WEBHOOK ENDPOINT (CALLED BY SUPABASE)
// ============================================

/**
 * Handles incoming HTTP POST requests from the Supabase Edge Function
 * when an administrator approves a student registration.
 *
 * Workflow:
 * 1. Validate Secret & SRM AP Domain.
 * 2. Idempotency Check: If already recorded in Spreadsheet, skip duplicate email.
 * 3. Send Welcome Email via GmailApp.
 * 4. Record to Google Sheet only after email succeeds.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  // Serialize concurrent webhook calls (up to 10 seconds wait)
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

    // 1. Validate High-Entropy Shared Secret from Script Properties
    var expectedSecret = PropertiesService.getScriptProperties().getProperty("CAMPUSRIDE_SECRET");
    if (!expectedSecret || !payload.secret || payload.secret !== expectedSecret) {
      // Security: never log the attempted secret or payload
      return jsonResponse({ success: false, error: "Unauthorized: Invalid or missing secret" });
    }

    var student = payload.student;
    if (!student || typeof student !== "object") {
      return jsonResponse({ success: false, error: "Missing student object in payload" });
    }

    var name = (student.name || "").toString().trim();
    var email = (student.email || "").toString().trim().toLowerCase();
    // Accept regNo, regNumber, or tempPassword (which is the regNo in CampusRide)
    var regNo = (student.regNo || student.regNumber || student.tempPassword || "").toString().trim().toUpperCase();

    if (!name || !email || !regNo) {
      return jsonResponse({ success: false, error: "Missing required fields (name, email, regNo)" });
    }

    // 2. Strict Recipient Validation: Only @srmap.edu.in permitted
    var srmEmailPattern = /^[a-zA-Z0-9._%+-]+@srmap\.edu\.in$/i;
    if (!srmEmailPattern.test(email)) {
      return jsonResponse({ success: false, error: "Invalid recipient email domain. Only @srmap.edu.in is allowed." });
    }

    var studentData = {
      name: name,
      email: email,
      regNo: regNo
    };

    // 3. Duplicate Protection (Ambiguous Timeout & Retry Guard):
    // Check if student is ALREADY recorded in the Google Sheet from a previous run.
    var alreadyInSheet = false;
    try {
      alreadyInSheet = isStudentInSheet(studentData);
    } catch (preCheckErr) {
      Logger.log("Notice: Pre-check duplicate sheet inspection failed: " + preCheckErr.message);
    }

    if (alreadyInSheet) {
      Logger.log("Student " + studentData.email + " already recorded in sheet. Skipping duplicate email.");
      return jsonResponse({
        success: true,
        emailSent: false,
        sheetSynced: true,
        alreadyRecorded: true,
        message: "Student already recorded in spreadsheet. Duplicate email skipped.",
        recipient: studentData.email,
        sentAt: new Date().toISOString()
      });
    }

    // 4. Send Welcome Email
    var emailSent = false;
    var htmlContent = createWelcomeEmail(studentData);
    var plainTextContent =
      "Hi " + studentData.name + ",\n\n" +
      "Welcome to CampusRide - SRM AP's student ride-sharing community!\n\n" +
      "Username: " + studentData.email + "\n" +
      "Temporary Password: " + studentData.regNo + "\n\n" +
      "Website: " + CAMPUSRIDE_CONFIG.website + "\n" +
      "WhatsApp: " + CAMPUSRIDE_CONFIG.whatsapp + "\n\n" +
      "Best regards,\nTeam CampusRide";

    try {
      sendEmail(studentData.email, CAMPUSRIDE_CONFIG.subject, plainTextContent, htmlContent);
      emailSent = true;
      Logger.log("Automated welcome email successfully sent to: " + studentData.email);
    } catch (mailErr) {
      Logger.log("Email sending failed: " + mailErr.message);
      // If email delivery fails, do NOT record student to sheet
      return jsonResponse({
        success: false,
        emailSent: false,
        sheetSynced: false,
        error: "Failed to send welcome email: " + mailErr.message
      });
    }

    // 5. Append to Google Sheet (ONLY after email delivery succeeds)
    var sheetSynced = false;
    var sheetError = null;

    try {
      recordStudentInSheet(studentData);
      sheetSynced = true;
      Logger.log("Student successfully recorded in Google Sheet: " + studentData.regNo);
    } catch (sheetErr) {
      sheetError = sheetErr.message;
      Logger.log("Spreadsheet recording failed: " + sheetErr.message);
    }

    // Return status: success is true because the primary operation (email) succeeded
    // Supabase will record 'sent'. sheetSynced and sheetError clearly report sheet state.
    return jsonResponse({
      success: true,
      emailSent: emailSent,
      sheetSynced: sheetSynced,
      sheetError: sheetError,
      recipient: studentData.email,
      sentAt: new Date().toISOString()
    });

  } catch (err) {
    Logger.log("doPost execution error: " + err.message);
    return jsonResponse({ success: false, error: err.message || "Internal script error" });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Communicates response back to Supabase Edge Function.
 * Note: Google Apps Script Web Apps always return HTTP 200 via redirect.
 * Status is communicated through the JSON payload.
 */
function jsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================
// GOOGLE SPREADSHEET SYNC HELPERS
// ============================================

/**
 * Returns the target worksheet, auto-creating it and headers if missing.
 */
function getApprovedStudentsSheet() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("CAMPUSRIDE_SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error("CAMPUSRIDE_SPREADSHEET_ID is not configured in Script Properties.");
  }

  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var targetName = CAMPUSRIDE_CONFIG.sheetName || "Approved Students";
  var sheet = spreadsheet.getSheetByName(targetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(targetName);
  }

  // Initialize header row if sheet is brand new
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Name", "Registration No.", "Email"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Checks whether a student is already recorded in the spreadsheet by
 * matching normalized registration number or email.
 */
function isStudentInSheet(studentData) {
  var sheet = getApprovedStudentsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  // Read columns B (Reg No) and C (Email)
  var data = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
  var targetReg = (studentData.regNo || "").trim().toUpperCase();
  var targetEmail = (studentData.email || "").trim().toLowerCase();

  for (var i = 0; i < data.length; i++) {
    var rowReg = String(data[i][0] || "").trim().toUpperCase();
    var rowEmail = String(data[i][1] || "").trim().toLowerCase();

    if (rowReg === targetReg || rowEmail === targetEmail) {
      return true;
    }
  }

  return false;
}

/**
 * Appends student details to the sheet: Name | Registration No. | Email
 * Uses deduplication to avoid duplicate rows.
 */
function recordStudentInSheet(studentData) {
  var sheet = getApprovedStudentsSheet();

  // Deduplication check before append
  if (isStudentInSheet(studentData)) {
    Logger.log("Row already exists for: " + studentData.regNo);
    return;
  }

  sheet.appendRow([
    studentData.name,
    studentData.regNo,
    studentData.email
  ]);
}

// ============================================
// STEP 1: PREVIEW (NO EMAILS SENT)
// ============================================

function previewCampusRideEmails() {
  STUDENTS.forEach(function (student, index) {
    createWelcomeEmail(student);

    Logger.log("====================================");
    Logger.log("STUDENT " + (index + 1));
    Logger.log("Name: " + student.name);
    Logger.log("Email: " + student.email);
    Logger.log("Registration number: " + student.regNo);
    Logger.log("Email HTML generated successfully.");
  });

  Logger.log("Preview completed for " + STUDENTS.length + " students.");
}

// ============================================
// STEP 2: SEND ONE TEST EMAIL TO YOURSELF
// (goes to the Google account running the script)
// ============================================

function sendCampusRideTestEmail() {
  const testEmail = Session.getActiveUser().getEmail();
  const html = createWelcomeEmail(STUDENTS[0]);

  sendEmail(
    testEmail,
    "[TEST] " + CAMPUSRIDE_CONFIG.subject,
    "This is a CampusRide welcome email test.",
    html
  );

  Logger.log("Test email sent to " + testEmail);
}

// ============================================
// OPTIONAL: SEND ALL PREVIEWS TO YOURSELF
// ============================================

function sendAllPreviewsToMe() {
  const me = Session.getActiveUser().getEmail();

  STUDENTS.forEach(function (student) {
    sendEmail(
      me,
      "[PREVIEW: " + student.name + "] " + CAMPUSRIDE_CONFIG.subject,
      "Preview only.",
      createWelcomeEmail(student)
    );
  });

  Logger.log("Sent " + STUDENTS.length + " previews to " + me);
}

// ============================================
// STEP 3: LEGACY MANUAL BATCH SENDER
// Guarded to prevent accidental bulk execution.
// Production welcome emails are sent via doPost(e).
// ============================================

function sendCampusRideWelcomeEmails() {
  // Safety guard: Prevents accidental triggers from script editor run button
  const MANUAL_RUN_CONFIRMED = false;
  if (!MANUAL_RUN_CONFIRMED) {
    Logger.log("Safety guard active: sendCampusRideWelcomeEmails() was blocked.");
    Logger.log("Live student approvals automatically use doPost(e). To run this batch manually, set MANUAL_RUN_CONFIRMED = true.");
    return;
  }

  let sent = 0;
  let failed = 0;

  STUDENTS.forEach(function (student) {
    try {
      if (
        !student.name ||
        !student.email ||
        !student.regNo ||
        !student.email.endsWith("@srmap.edu.in")
      ) {
        throw new Error("Missing or invalid student details.");
      }

      const html = createWelcomeEmail(student);

      const plainText =
        "Hi " + student.name + ",\n\n" +
        "Welcome to CampusRide - SRM AP's student ride-sharing community!\n\n" +
        "Username: " + student.email + "\n" +
        "Temporary Password: " + student.regNo + "\n\n" +
        "Website: " + CAMPUSRIDE_CONFIG.website + "\n" +
        "WhatsApp: " + CAMPUSRIDE_CONFIG.whatsapp + "\n\n" +
        "Best regards,\nTeam CampusRide";

      sendEmail(student.email, CAMPUSRIDE_CONFIG.subject, plainText, html);

      sent++;
      Logger.log("SENT: " + student.email);
    } catch (error) {
      failed++;
      Logger.log("FAILED: " + student.email + " | " + error.message);
    }
  });

  Logger.log("====================================");
  Logger.log("CampusRide email run finished.");
  Logger.log("Sent: " + sent);
  Logger.log("Failed: " + failed);
  Logger.log("Total: " + STUDENTS.length);
  Logger.log("====================================");
}

// ============================================
// SEND HELPER
// ============================================

function sendEmail(to, subject, plainText, html) {
  GmailApp.sendEmail(to, subject, plainText, {
    htmlBody: html,
    name: CAMPUSRIDE_CONFIG.senderName
  });
}

// ============================================
// EMAIL TEMPLATE
// ============================================

function createWelcomeEmail(student) {
  const name = escapeHtml(student.name);
  const email = escapeHtml(student.email);
  const password = escapeHtml(student.regNo);

  const website = CAMPUSRIDE_CONFIG.website;
  const whatsapp = CAMPUSRIDE_CONFIG.whatsapp;

  return `
    <meta charset="UTF-8">
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#263238;line-height:1.7;">

      <h2 style="color:#174A83;">Welcome to CampusRide! &#128757;</h2>

      <p>Hi ${name},</p>

      <p>Welcome to CampusRide &mdash; SRM AP's student ride-sharing community! &#128153;</p>

      <p>Thank you for registering and being one of our early users! We're excited to have you on board.</p>

      <h3 style="color:#174A83;">&#128272; Your Login Details</h3>

      <div style="background:#EAF3FF;padding:16px;border-radius:8px;">
        <p><b>Username:</b> ${email}</p>
        <p><b>Temporary Password:</b> ${password}</p>
        <p><b>Website:</b> <a href="${website}">Open CampusRide</a></p>
      </div>

      <p>
        Please log in using your assigned credentials and change your temporary
        password if prompted. Never share your password with anyone.
      </p>

      <h3 style="color:#174A83;">&#128757; What Can You Do with CampusRide?</h3>

      <ul>
        <li><b>Offer a Ride:</b> Share available seats in your vehicle.</li>
        <li><b>Request a Ride:</b> Find and request seats from fellow students.</li>
        <li><b>Share Travel Costs:</b> Make commuting more convenient and affordable.</li>
      </ul>

      <h3 style="color:#174A83;">&#128226; Join Our WhatsApp Channel!</h3>

      <p>Stay updated with CampusRide announcements, news, and future developments.</p>

      <p><a href="${whatsapp}">&#128073; Join the CampusRide WhatsApp Channel</a></p>

      <h3 style="color:#174A83;">&#128153; Help Us Grow!</h3>

      <p>
        Know friends at SRM AP who might find CampusRide useful? Share our website
        and WhatsApp channel with them and invite them to join our growing community!
      </p>

      <p>&#127760; <a href="${website}">CampusRide Website</a></p>

      <p>
        Thank you for being part of our journey from the beginning.
        Let's make student commuting smarter, together!
      </p>

      <p>
        Best regards,<br>
        <b>Team CampusRide</b><br>
        <i>Share rides. Split costs. Commute smarter. &#128757;&#128153;</i>
      </p>

    </div>
  `;
}

// ============================================
// HTML ESCAPING HELPER
// ============================================

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
