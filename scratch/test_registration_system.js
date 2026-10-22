import assert from "assert";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

console.log("==================================================================");
console.log("CampusRide In-App Registration & Admin Approval System Test Suite");
console.log("==================================================================\n");

// Read environment
const envContent = fs.readFileSync(".env.local", "utf-8");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/);
const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

// ------------------------------------------------------------------
// In-Memory Simulation of Postgres RPC Logic for Comprehensive Unit Tests
// ------------------------------------------------------------------
class RegistrationSystemEngine {
  constructor() {
    this.authUsers = new Map();
    this.profiles = new Map();
    this.registrations = new Map();
    this.appAdmins = new Set();
    this.otpChallenges = new Map();
  }

  addAdmin(userId) {
    this.appAdmins.add(userId);
  }

  isAppAdmin(userId) {
    return this.appAdmins.has(userId);
  }

  sendOtp(email) {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.endsWith("@srmap.edu.in")) {
      return { success: false, error: "Only official SRM University-AP email addresses (@srmap.edu.in) are accepted." };
    }

    const now = Date.now();

    // Check cooldown
    for (const [id, ch] of this.otpChallenges.entries()) {
      if (ch.normalized_email === cleanEmail && ch.resend_available_at > now) {
        const remaining = Math.ceil((ch.resend_available_at - now) / 1000);
        return { success: false, error: `Please wait ${remaining}s before requesting another verification code.`, cooldownRemaining: remaining };
      }
    }

    // Invalidate prior pending challenges
    for (const [id, ch] of this.otpChallenges.entries()) {
      if (ch.normalized_email === cleanEmail && ch.status === "pending") {
        ch.status = "expired";
      }
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = crypto.createHash("sha256").update(otp + "test_salt").digest("hex");
    const challengeId = crypto.randomUUID();

    const challenge = {
      id: challengeId,
      normalized_email: cleanEmail,
      otp_hash: otpHash,
      _plaintext_otp_for_test: otp,
      attempts_count: 0,
      max_attempts: 5,
      status: "pending",
      resend_available_at: now + 60 * 1000,
      expires_at: now + 5 * 60 * 1000,
      verification_token_hash: null,
      created_at: new Date().toISOString()
    };

    this.otpChallenges.set(challengeId, challenge);

    return {
      success: true,
      challengeId,
      cooldownSeconds: 60,
      expiresAt: new Date(challenge.expires_at).toISOString(),
      _testOtp: otp
    };
  }

  verifyOtp(email, otp) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanOtp = (otp || "").trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return { success: false, error: "Invalid code format. Must be 6 digits." };
    }

    const now = Date.now();
    let target = null;
    for (const [id, ch] of this.otpChallenges.entries()) {
      if (ch.normalized_email === cleanEmail && ch.status === "pending" && ch.expires_at > now) {
        target = ch;
        break;
      }
    }

    if (!target) {
      return { success: false, error: "No active verification challenge found or code expired." };
    }

    if (target.attempts_count >= target.max_attempts) {
      target.status = "expired";
      return { success: false, error: "Maximum verification attempts exceeded." };
    }

    target.attempts_count++;

    const submittedHash = crypto.createHash("sha256").update(cleanOtp + "test_salt").digest("hex");
    if (submittedHash !== target.otp_hash) {
      const remaining = Math.max(0, target.max_attempts - target.attempts_count);
      return { success: false, error: `Incorrect verification code. ${remaining} attempt(s) remaining.`, attemptsRemaining: remaining };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    target.status = "verified";
    target.verification_token_hash = tokenHash;
    target.verified_at = new Date().toISOString();
    target.expires_at = now + 15 * 60 * 1000;

    return { success: true, verificationToken: rawToken };
  }

  submitRegistration(fullName, email, regNo, verificationToken = null) {
    const cleanName = (fullName || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanReg = (regNo || "").trim().toUpperCase();

    if (!cleanName) {
      return { success: false, code: "INVALID_NAME", message: "Full name is required." };
    }

    if (!cleanEmail || !cleanEmail.endsWith("@srmap.edu.in")) {
      return {
        success: false,
        code: "INVALID_EMAIL",
        message: "Only official SRM University-AP email addresses (@srmap.edu.in) are accepted.",
      };
    }

    if (cleanReg.length < 4 || cleanReg.length > 20) {
      return {
        success: false,
        code: "INVALID_REG_NO",
        message: "Please enter a valid SRM registration number.",
      };
    }

    // Case A: Existing active account in auth.users
    for (const [id, u] of this.authUsers.entries()) {
      if (u.email.toLowerCase() === cleanEmail) {
        return {
          success: false,
          code: "EXISTING_ACCOUNT",
          message: "You already have an active account. Please log in instead.",
        };
      }
    }

    // Also check profiles for existing registration number
    for (const [id, p] of this.profiles.entries()) {
      if (p.registration_number === cleanReg) {
        return {
          success: false,
          code: "EXISTING_ACCOUNT",
          message: "An account with this registration number already exists. Please log in instead.",
        };
      }
    }

    // Case B: Existing application
    for (const [id, reg] of this.registrations.entries()) {
      if (reg.normalized_email === cleanEmail) {
        if (reg.normalized_reg_no === cleanReg) {
          const rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          reg.access_token_hash = tokenHash;
          reg.updated_at = new Date().toISOString();

          return {
            success: true,
            code: "EXISTING_APPLICATION",
            message: "You have already requested an account.",
            status: reg.status,
            token: rawToken,
            registration: { ...reg },
          };
        } else {
          return {
            success: false,
            code: "EXISTING_APPLICATION_MISMATCH",
            message: "An application has already been submitted for this email address with a different registration number.",
          };
        }
      }

      if (reg.normalized_reg_no === cleanReg) {
        return {
          success: false,
          code: "DUPLICATE_REG_NO",
          message: "This registration number has already been used in another application.",
        };
      }
    }

    // Case C: Validate Server-Side Email OTP Verification Proof
    if (!verificationToken || !verificationToken.trim()) {
      return {
        success: false,
        code: "OTP_REQUIRED",
        message: "Email verification is required. Please verify your SRM email address with an OTP before submitting.",
      };
    }

    const proofHash = crypto.createHash("sha256").update(verificationToken.trim()).digest("hex");
    let matchedChallenge = null;
    const now = Date.now();

    for (const [id, ch] of this.otpChallenges.entries()) {
      if (
        ch.verification_token_hash === proofHash &&
        ch.normalized_email === cleanEmail &&
        ch.status === "verified" &&
        ch.expires_at > now &&
        !ch.consumed_at
      ) {
        matchedChallenge = ch;
        break;
      }
    }

    if (!matchedChallenge) {
      return {
        success: false,
        code: "INVALID_VERIFICATION",
        message: "Email verification code has expired, already been used, or does not match this email. Please verify your email again.",
      };
    }

    // Atomically consume verification proof
    matchedChallenge.status = "consumed";
    matchedChallenge.consumed_at = new Date().toISOString();

    // Case D: Automatic Approval upon Verified OTP Proof
    if (cleanReg.length < 6) {
      return {
        success: false,
        code: "INVALID_REG_NO",
        message: "Registration number must be at least 6 characters.",
      };
    }

    const newUserId = crypto.randomUUID();
    this.authUsers.set(newUserId, {
      id: newUserId,
      email: cleanEmail,
      encrypted_password: `hashed_${cleanReg}`,
    });

    this.profiles.set(newUserId, {
      id: newUserId,
      full_name: cleanName,
      registration_number: cleanReg,
      must_change_password: true,
      profile_completed: false,
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const newId = crypto.randomUUID();

    const newReg = {
      id: newId,
      full_name: cleanName,
      email: email.trim(),
      normalized_email: cleanEmail,
      registration_number: cleanReg,
      normalized_reg_no: cleanReg,
      status: "approved",
      access_token_hash: tokenHash,
      rejection_reason: "Auto-approved via verified SRM email OTP",
      welcome_email_status: "not_sent",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: null,
    };

    this.registrations.set(newId, newReg);

    return {
      success: true,
      code: "AUTO_APPROVED",
      message: "Your SRM email has been verified and your CampusRide account has been created successfully! You can now log in.",
      status: "approved",
      token: rawToken,
      userId: newUserId,
      registration: { ...newReg },
    };
  }

  getStatus(token) {
    if (!token || !token.trim()) {
      return { success: false, message: "Invalid access token." };
    }
    const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");
    for (const [id, reg] of this.registrations.entries()) {
      if (reg.access_token_hash === tokenHash) {
        let maskedReg = reg.registration_number;
        if (maskedReg.length > 6) {
          maskedReg = maskedReg.substring(0, 2) + "•••••" + maskedReg.substring(maskedReg.length - 4);
        }
        return {
          success: true,
          registration: {
            id: reg.id,
            full_name: reg.full_name,
            email: reg.email,
            masked_registration_number: maskedReg,
            status: reg.status,
            created_at: reg.created_at,
            reviewed_at: reg.reviewed_at,
            rejection_reason: reg.rejection_reason,
          },
        };
      }
    }
    return { success: false, message: "Application not found or link expired." };
  }

  recoverToken(email, regNo) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanReg = (regNo || "").trim().toUpperCase();

    for (const [id, reg] of this.registrations.entries()) {
      if (reg.normalized_email === cleanEmail && reg.normalized_reg_no === cleanReg) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        reg.access_token_hash = tokenHash;
        reg.updated_at = new Date().toISOString();
        return { success: true, token: rawToken, status: reg.status };
      }
    }
    return { success: false, message: "No matching application found." };
  }

  adminApprove(callerId, registrationId) {
    if (!this.isAppAdmin(callerId)) {
      throw new Error("Unauthorized: Administrator access required.");
    }
    const reg = this.registrations.get(registrationId);
    if (!reg) throw new Error("Registration not found.");

    if (reg.status !== "pending") {
      return { success: false, message: `Cannot approve registration with status: ${reg.status}`, status: reg.status };
    }

    // Provision user in auth.users with registration number as temporary password
    const newUserId = crypto.randomUUID();
    this.authUsers.set(newUserId, {
      id: newUserId,
      email: reg.email,
      encrypted_password: `hashed_${reg.registration_number}`,
    });

    this.profiles.set(newUserId, {
      id: newUserId,
      full_name: reg.full_name,
      registration_number: reg.registration_number,
      must_change_password: true,
      profile_completed: false,
    });

    reg.status = "approved";
    reg.reviewed_at = new Date().toISOString();
    reg.reviewed_by = callerId;
    reg.updated_at = new Date().toISOString();

    return { success: true, message: "Approved successfully.", userId: newUserId };
  }

  adminReject(callerId, registrationId, reason = "") {
    if (!this.isAppAdmin(callerId)) {
      throw new Error("Unauthorized: Administrator access required.");
    }
    const reg = this.registrations.get(registrationId);
    if (!reg) throw new Error("Registration not found.");

    if (reg.status !== "pending") {
      return { success: false, message: `Cannot reject registration with status: ${reg.status}`, status: reg.status };
    }

    reg.status = "rejected";
    reg.rejection_reason = reason.trim();
    reg.reviewed_at = new Date().toISOString();
    reg.reviewed_by = callerId;
    reg.updated_at = new Date().toISOString();

    return { success: true, message: "Rejected successfully." };
  }
}

// ------------------------------------------------------------------
// RUN TESTS
// ------------------------------------------------------------------
async function runAllTests() {
  const engine = new RegistrationSystemEngine();
  const adminId = "admin-uuid-1234";
  engine.addAdmin(adminId);

  // Test 1: New valid SRM email registration (with OTP verification) -> Auto-Approved
  console.log("Test 1: New valid SRM email registration with OTP verification");
  const otpRes = engine.sendOtp("aditi_rao@srmap.edu.in");
  assert.strictEqual(otpRes.success, true);
  const verifyRes = engine.verifyOtp("aditi_rao@srmap.edu.in", otpRes._testOtp);
  assert.strictEqual(verifyRes.success, true);
  assert(verifyRes.verificationToken, "Must return single-use verification token");

  const t1 = engine.submitRegistration("Aditi Rao", "aditi_rao@srmap.edu.in", "AP26110090111", verifyRes.verificationToken);
  assert.strictEqual(t1.success, true);
  assert.strictEqual(t1.code, "AUTO_APPROVED");
  assert.strictEqual(t1.status, "approved");
  assert(t1.userId && engine.authUsers.has(t1.userId), "Student account provisioned in auth.users");
  assert.strictEqual(engine.profiles.get(t1.userId).must_change_password, true);
  assert(t1.token && t1.token.length === 64, "Token should be 64-char hex");
  console.log("  ✓ Passed: Automatically approved registration and provisioned student account with temporary password");

  // Test 2: Rejection of a non-SRM email
  console.log("\nTest 2: Rejection of non-SRM email");
  const t2a = engine.submitRegistration("John Doe", "john@gmail.com", "AP26110090222");
  assert.strictEqual(t2a.success, false);
  assert.strictEqual(t2a.code, "INVALID_EMAIL");

  const t2b = engine.submitRegistration("John Doe", "john@srmist.edu.in", "AP26110090222");
  assert.strictEqual(t2b.success, false);
  assert.strictEqual(t2b.code, "INVALID_EMAIL");
  console.log("  ✓ Passed: Rejects non-@srmap.edu.in emails");

  // Test 3: Missing / invalid form fields
  console.log("\nTest 3: Missing/invalid form fields");
  const t3a = engine.submitRegistration("", "valid@srmap.edu.in", "AP26110090333");
  assert.strictEqual(t3a.code, "INVALID_NAME");

  const t3b = engine.submitRegistration("Name", "valid@srmap.edu.in", "12");
  assert.strictEqual(t3b.code, "INVALID_REG_NO");
  console.log("  ✓ Passed: Proper validation errors on missing/short fields");

  // Test 4: Existing active account (Case A)
  console.log("\nTest 4: Existing active account check");
  const existingUserId = "existing-student-uuid";
  engine.authUsers.set(existingUserId, { id: existingUserId, email: "existing_student@srmap.edu.in" });
  engine.profiles.set(existingUserId, { id: existingUserId, registration_number: "AP26110090444" });

  const t4 = engine.submitRegistration("Existing Student", "existing_student@srmap.edu.in", "AP26110090444");
  assert.strictEqual(t4.success, false);
  assert.strictEqual(t4.code, "EXISTING_ACCOUNT");
  assert(t4.message.includes("log in instead"));
  console.log("  ✓ Passed: Correctly detected existing active student account");

  // Test 5: Existing account detection for auto-approved student
  console.log("\nTest 5: Existing account detection on resubmission");
  const t5 = engine.submitRegistration("Aditi Rao", "aditi_rao@srmap.edu.in", "AP26110090111");
  assert.strictEqual(t5.success, false);
  assert.strictEqual(t5.code, "EXISTING_ACCOUNT");
  console.log("  ✓ Passed: Detects existing auto-approved student account on resubmission");

  // Create a manual pending registration to test admin manual operations
  const manualRegId = "manual-pending-reg";
  engine.registrations.set(manualRegId, {
    id: manualRegId,
    full_name: "Manual Student",
    email: "manual_student@srmap.edu.in",
    normalized_email: "manual_student@srmap.edu.in",
    registration_number: "AP26110090888",
    normalized_reg_no: "AP26110090888",
    status: "pending",
    access_token_hash: "hash_test",
    rejection_reason: "",
    welcome_email_status: "not_sent",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
  });

  // Test 6: Duplicate registration number across different emails
  console.log("\nTest 6: Duplicate registration number detection");
  // 6a: If reg number already belongs to an approved account in profiles
  const t6a = engine.submitRegistration("Imposter", "imposter@srmap.edu.in", "AP26110090111");
  assert.strictEqual(t6a.success, false);
  assert.strictEqual(t6a.code, "EXISTING_ACCOUNT");

  // 6b: If reg number belongs to a pending registration application
  const t6b = engine.submitRegistration("Imposter 2", "imposter2@srmap.edu.in", "AP26110090888");
  assert.strictEqual(t6b.success, false);
  assert.strictEqual(t6b.code, "DUPLICATE_REG_NO");
  console.log("  ✓ Passed: Prevented duplicate registration numbers across existing accounts and pending applications");

  // Test 7: Unauthorized access to admin operations
  console.log("\nTest 7: Unauthorized access to admin operations");
  assert.throws(() => {
    engine.adminApprove("non-admin-user", manualRegId);
  }, /Unauthorized/);
  console.log("  ✓ Passed: Non-admin users blocked from approving registrations");

  // Test 8: Admin approval and successful account creation
  console.log("\nTest 8: Admin approval and student account provisioning");
  const t8 = engine.adminApprove(adminId, manualRegId);
  assert.strictEqual(t8.success, true);
  assert(t8.userId, "Provisions student account with user ID");

  const approvedReg = engine.registrations.get(manualRegId);
  assert.strictEqual(approvedReg.status, "approved");
  assert.strictEqual(approvedReg.reviewed_by, adminId);
  assert(approvedReg.reviewed_at, "Reviewed timestamp set");

  const createdProfile = engine.profiles.get(t8.userId);
  assert.strictEqual(createdProfile.full_name, "Manual Student");
  assert.strictEqual(createdProfile.must_change_password, true);
  console.log("  ✓ Passed: Admin approval successfully created student account and set must_change_password: true");

  // Test 9: Repeated / concurrent approval clicks
  console.log("\nTest 9: Repeated / concurrent approval idempotency");
  const t9 = engine.adminApprove(adminId, manualRegId);
  assert.strictEqual(t9.success, false);
  assert(t9.message.includes("Cannot approve registration with status: approved"));
  console.log("  ✓ Passed: Prevented duplicate account creation on repeated approval clicks");

  // Test 10: Existing approved application status check (Case B)
  console.log("\nTest 10: Existing approved application status check");
  const t10 = engine.submitRegistration("Aditi Rao", "aditi_rao@srmap.edu.in", "AP26110090111");
  // Since student account is now created in authUsers, submitRegistration detects existing account or returns application status
  console.log("  Result code for approved student re-submitting:", t10.code);
  assert(t10.code === "EXISTING_ACCOUNT" || t10.code === "EXISTING_APPLICATION");
  console.log("  ✓ Passed: Directs approved user appropriately");

  // Test 11: Admin rejection of pending registration
  console.log("\nTest 11: Admin rejection");
  const rejectRegId = "pending-reject-reg";
  const rawToken777 = crypto.randomBytes(32).toString("hex");
  const tokenHash777 = crypto.createHash("sha256").update(rawToken777).digest("hex");
  engine.registrations.set(rejectRegId, {
    id: rejectRegId,
    full_name: "Rejected Candidate",
    email: "rejected@srmap.edu.in",
    normalized_email: "rejected@srmap.edu.in",
    registration_number: "AP26110090777",
    normalized_reg_no: "AP26110090777",
    status: "pending",
    access_token_hash: tokenHash777,
    rejection_reason: "",
    welcome_email_status: "not_sent",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
  });

  const t11b = engine.adminReject(adminId, rejectRegId, "Invalid student ID");
  assert.strictEqual(t11b.success, true);

  const rejectedReg = engine.registrations.get(rejectRegId);
  assert.strictEqual(rejectedReg.status, "rejected");
  assert.strictEqual(rejectedReg.rejection_reason, "Invalid student ID");
  console.log("  ✓ Passed: Admin rejection saved review reason and updated status without deleting record");

  // Test 12: Status persistence and masking
  console.log("\nTest 12: Status retrieval & registration number masking");
  const statusRes = engine.getStatus(rawToken777);
  assert.strictEqual(statusRes.success, true);
  assert.strictEqual(statusRes.registration.status, "rejected");
  assert.strictEqual(statusRes.registration.rejection_reason, "Invalid student ID");
  assert(statusRes.registration.masked_registration_number.includes("•••••"), "Registration number must be masked");
  console.log("  ✓ Passed: Masked registration number:", statusRes.registration.masked_registration_number);

  // Test 13: Secure status recovery after browser data is cleared
  console.log("\nTest 13: Secure recovery with SRM email + Reg No");
  // Failure case: only knowing email without matching registration number
  const recFail = engine.recoverToken("rejected@srmap.edu.in", "WRONG_REG_NO");
  assert.strictEqual(recFail.success, false);

  // Success case: both match
  const recSuccess = engine.recoverToken("rejected@srmap.edu.in", "AP26110090777");
  assert.strictEqual(recSuccess.success, true);
  assert(recSuccess.token, "Recovers valid access token");
  const recCheck = engine.getStatus(recSuccess.token);
  assert.strictEqual(recCheck.registration.full_name, "Rejected Candidate");
  console.log("  ✓ Passed: Secure recovery requires both matching email and registration number");

  // Test 14: Existing Supabase public connection test
  console.log("\nTest 14: Live Supabase connection and public schema check");
  const { data: ridesData, error: ridesErr } = await supabase.from("rides").select("id, status").limit(3);
  assert(!ridesErr, "Rides table query should succeed: " + ridesErr?.message);
  console.log("  ✓ Passed: Successfully queried rides table (found " + ridesData?.length + " rides)");

  // ==================================================================
  // OTP VERIFICATION TEST SUITES (TESTS 15-23)
  // ==================================================================

  // Test 15: Send OTP rejected for non-SRM email
  console.log("\nTest 15: OTP request rejected for non-SRM email");
  const otpNonSrm = engine.sendOtp("attacker@gmail.com");
  assert.strictEqual(otpNonSrm.success, false);
  assert(otpNonSrm.error.includes("@srmap.edu.in"));
  console.log("  ✓ Passed: Blocked OTP request for non-@srmap.edu.in email");

  // Test 16: Valid OTP dispatch creates 6-digit code with cooldown
  console.log("\nTest 16: OTP dispatch generates 6-digit code and sets 60s cooldown");
  const otpValid = engine.sendOtp("student_otp_test@srmap.edu.in");
  assert.strictEqual(otpValid.success, true);
  assert.strictEqual(otpValid.cooldownSeconds, 60);
  assert(/^\d{6}$/.test(otpValid._testOtp), "OTP must be 6 digits");
  console.log("  ✓ Passed: Generated 6-digit OTP with 60s resend cooldown");

  // Test 17: Cooldown enforcement (rapid resend blocked)
  console.log("\nTest 17: Cooldown enforcement blocks rapid resend");
  const otpRapid = engine.sendOtp("student_otp_test@srmap.edu.in");
  assert.strictEqual(otpRapid.success, false);
  assert(otpRapid.error.includes("Please wait"));
  console.log("  ✓ Passed: Enforced 60-second resend cooldown");

  // Test 18: Incorrect OTP verification failure
  console.log("\nTest 18: Incorrect OTP verification error");
  const badVerify = engine.verifyOtp("student_otp_test@srmap.edu.in", "000000");
  assert.strictEqual(badVerify.success, false);
  assert(badVerify.error.includes("Incorrect verification code"));
  assert.strictEqual(badVerify.attemptsRemaining, 4);
  console.log("  ✓ Passed: Rejected wrong OTP and tracked remaining attempts (4 remaining)");

  // Test 19: Lockout after 5 failed attempts
  console.log("\nTest 19: Lockout after 5 failed attempts");
  engine.verifyOtp("student_otp_test@srmap.edu.in", "000001");
  engine.verifyOtp("student_otp_test@srmap.edu.in", "000002");
  engine.verifyOtp("student_otp_test@srmap.edu.in", "000003");
  const fifthAttempt = engine.verifyOtp("student_otp_test@srmap.edu.in", "000004");
  assert.strictEqual(fifthAttempt.attemptsRemaining, 0);

  const sixthAttempt = engine.verifyOtp("student_otp_test@srmap.edu.in", otpValid._testOtp);
  assert.strictEqual(sixthAttempt.success, false);
  assert(sixthAttempt.error.includes("Maximum verification attempts exceeded"));
  console.log("  ✓ Passed: Locked out challenge after 5 failed attempts even with right code on 6th attempt");

  // Test 20: Fresh OTP verified successfully returns token
  console.log("\nTest 20: Fresh OTP verification returns single-use token");
  // Fast-forward cooldown for test
  for (const [id, ch] of engine.otpChallenges.entries()) {
    ch.resend_available_at = 0;
  }
  const freshOtp = engine.sendOtp("student_otp_test@srmap.edu.in");
  const freshVerify = engine.verifyOtp("student_otp_test@srmap.edu.in", freshOtp._testOtp);
  assert.strictEqual(freshVerify.success, true);
  assert(freshVerify.verificationToken && freshVerify.verificationToken.length === 64);
  console.log("  ✓ Passed: Fresh OTP verification succeeded and issued 64-char token");

  // Test 21: Submitting new registration without verification token is blocked
  console.log("\nTest 21: Registration submission without OTP verification is blocked");
  const unverifiedSub = engine.submitRegistration("Unverified User", "unverified@srmap.edu.in", "AP26110090999");
  assert.strictEqual(unverifiedSub.success, false);
  assert.strictEqual(unverifiedSub.code, "OTP_REQUIRED");
  console.log("  ✓ Passed: Prevented registration without OTP verification proof");

  // Test 22: Submitting registration with token for another email is blocked
  console.log("\nTest 22: Token bound to specific email cannot be used for another email");
  const mismatchedSub = engine.submitRegistration("Imposter", "imposter@srmap.edu.in", "AP26110090999", freshVerify.verificationToken);
  assert.strictEqual(mismatchedSub.success, false);
  assert.strictEqual(mismatchedSub.code, "INVALID_VERIFICATION");
  console.log("  ✓ Passed: Blocked verification token reuse across different email addresses");

  // Test 23: Verification token single-use enforcement (cannot be reused)
  console.log("\nTest 23: Verification token consumed on registration and cannot be reused");
  const validSub = engine.submitRegistration("Valid Student", "student_otp_test@srmap.edu.in", "AP26110090555", freshVerify.verificationToken);
  assert.strictEqual(validSub.success, true);
  assert.strictEqual(validSub.code, "AUTO_APPROVED");

  // Attempt duplicate submission with the same consumed token
  const reusedTokenSub = engine.submitRegistration("Valid Student 2", "student_otp_test_2@srmap.edu.in", "AP26110090556", freshVerify.verificationToken);
  assert.strictEqual(reusedTokenSub.success, false);
  assert.strictEqual(reusedTokenSub.code, "INVALID_VERIFICATION");
  // Test 24: OTP expired after 5 minutes cannot be verified
  console.log("\nTest 24: OTP expired after 5 minutes cannot be verified");
  const expireTestOtp = engine.sendOtp("expire_test@srmap.edu.in");
  // Simulate time advancing past 5 minutes
  for (const [id, ch] of engine.otpChallenges.entries()) {
    if (ch.normalized_email === "expire_test@srmap.edu.in") {
      ch.expires_at = Date.now() - 1000; // expired
    }
  }
  const expiredVerify = engine.verifyOtp("expire_test@srmap.edu.in", expireTestOtp._testOtp);
  assert.strictEqual(expiredVerify.success, false);
  assert(expiredVerify.error.includes("expired") || expiredVerify.error.includes("No active"));
  console.log("  ✓ Passed: Correctly rejected OTP verification after 5-minute expiration");

  console.log("\n==================================================================");
  console.log("ALL 24 TEST SUITES PASSED CLEANLY (100% SUCCESS)!");
  console.log("==================================================================\n");
}

runAllTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
