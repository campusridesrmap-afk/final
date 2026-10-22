import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Computes SHA-256 hex digest of a string with optional server salt
 */
async function sha256Hex(message: string, salt: string = ""): Promise<string> {
  const data = new TextEncoder().encode(message + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const gasWebAppUrl = Deno.env.get("APPS_SCRIPT_URL");
    const gasSecret = Deno.env.get("CAMPUSRIDE_SECRET");
    const serverSalt = Deno.env.get("OTP_SERVER_SALT") || "campusride_otp_security_salt_2026";

    if (!supabaseUrl || !supabaseServiceRoleKey || !gasWebAppUrl || !gasSecret) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing required secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json().catch(() => null);
    const action = body?.action;



    const rawEmail = body?.email;
    if (!rawEmail || typeof rawEmail !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanEmail = rawEmail.trim().toLowerCase();
    const srmEmailPattern = /^[a-zA-Z0-9._%+-]+@srmap\.edu\.in$/;
    if (!srmEmailPattern.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: "Only official SRM University-AP email addresses (@srmap.edu.in) are accepted." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION 1: SEND OTP
    // =========================================================================
    if (action === "send_otp") {
      const now = new Date();

      // Rate limit 1: Check 60-second cooldown on this email
      const { data: recentChallenges } = await adminClient
        .from("email_otp_challenges")
        .select("id, resend_available_at")
        .eq("normalized_email", cleanEmail)
        .gt("resend_available_at", now.toISOString())
        .limit(1);

      if (recentChallenges && recentChallenges.length > 0) {
        const availableAt = new Date(recentChallenges[0].resend_available_at);
        const cooldownRemaining = Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 1000));
        return new Response(
          JSON.stringify({
            error: `Please wait ${cooldownRemaining}s before requesting another verification code.`,
            cooldownRemaining,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Rate limit 2: Max 5 OTP requests per hour for a single email
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const { count: hourlyCount } = await adminClient
        .from("email_otp_challenges")
        .select("id", { count: "exact", head: true })
        .eq("normalized_email", cleanEmail)
        .gt("created_at", oneHourAgo.toISOString());

      if (hourlyCount && hourlyCount >= 5) {
        return new Response(
          JSON.stringify({
            error: "Too many verification requests for this email address. Please try again after 1 hour.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate cryptographically secure random 6-digit OTP (100000 - 999999)
      const randomBuf = new Uint32Array(1);
      crypto.getRandomValues(randomBuf);
      const otpCode = String(100000 + (randomBuf[0] % 900000));

      const otpHash = await sha256Hex(otpCode, serverSalt);
      const resendAvailableAt = new Date(now.getTime() + 60 * 1000); // 60s cooldown
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);    // 5 min expiry

      // Invalidate previous pending challenges for this email
      await adminClient
        .from("email_otp_challenges")
        .update({ status: "expired" })
        .eq("normalized_email", cleanEmail)
        .eq("status", "pending");

      // Insert new pending challenge
      const { data: insertedChallenge, error: insertError } = await adminClient
        .from("email_otp_challenges")
        .insert({
          normalized_email: cleanEmail,
          otp_hash: otpHash,
          status: "pending",
          resend_available_at: resendAvailableAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !insertedChallenge) {
        return new Response(
          JSON.stringify({ error: "Failed to initialize verification challenge. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Call Google Apps Script Web App over HTTPS to deliver OTP
      let gasRes: Response;
      let gasBody: any = null;
      let timedOut = false;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15000);

      try {
        gasRes = await fetch(gasWebAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: gasSecret,
            action: "send_otp",
            email: cleanEmail,
            otp: otpCode,
            otpCode: otpCode,
          }),
          redirect: "follow", // Essential: Google Apps Script Web Apps return a 302 redirect
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        gasBody = await gasRes.json().catch(() => null);
      } catch (networkErr: any) {
        clearTimeout(timeoutId);
        // On network or dispatch failure, expire the challenge so client does not wait on non-delivered code
        await adminClient
          .from("email_otp_challenges")
          .update({ status: "expired" })
          .eq("id", insertedChallenge.id);

        const isTimeout = timedOut || networkErr?.name === "AbortError";
        return new Response(
          JSON.stringify({
            error: isTimeout
              ? "Email delivery timed out. Please check your internet connection and try again."
              : "Unable to contact email dispatch service. Please try again in a few moments.",
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!gasRes.ok || !gasBody || gasBody.success !== true) {
        // Expire challenge on delivery error
        await adminClient
          .from("email_otp_challenges")
          .update({ status: "expired" })
          .eq("id", insertedChallenge.id);

        return new Response(
          JSON.stringify({
            error: gasBody?.error || "Failed to deliver verification code. Please verify your email and try again.",
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          cooldownSeconds: 60,
          expiresAt: expiresAt.toISOString(),
          message: "Verification code sent to your SRM email.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION 2: VERIFY OTP
    // =========================================================================
    if (action === "verify_otp") {
      const rawOtp = body?.otp;
      if (!rawOtp || typeof rawOtp !== "string") {
        return new Response(
          JSON.stringify({ error: "Please enter the 6-digit verification code." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanOtp = rawOtp.trim();
      if (!/^\d{6}$/.test(cleanOtp)) {
        return new Response(
          JSON.stringify({ error: "Invalid code format. The verification code must be exactly 6 digits." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date();

      // Retrieve active pending challenge
      const { data: challenge, error: challengeError } = await adminClient
        .from("email_otp_challenges")
        .select("id, otp_hash, attempts_count, max_attempts, expires_at, status")
        .eq("normalized_email", cleanEmail)
        .eq("status", "pending")
        .gt("expires_at", now.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (challengeError || !challenge) {
        return new Response(
          JSON.stringify({
            error: "No active verification challenge found or code has expired. Please request a new code.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check max attempts limit
      if (challenge.attempts_count >= challenge.max_attempts) {
        await adminClient
          .from("email_otp_challenges")
          .update({ status: "expired" })
          .eq("id", challenge.id);

        return new Response(
          JSON.stringify({
            error: "Maximum verification attempts exceeded. Please request a new verification code.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Increment attempt counter
      const newAttempts = challenge.attempts_count + 1;
      await adminClient
        .from("email_otp_challenges")
        .update({ attempts_count: newAttempts })
        .eq("id", challenge.id);

      // Verify OTP hash
      const submittedHash = await sha256Hex(cleanOtp, serverSalt);
      if (submittedHash !== challenge.otp_hash) {
        const remaining = Math.max(0, challenge.max_attempts - newAttempts);
        return new Response(
          JSON.stringify({
            error: remaining > 0
              ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
              : "Incorrect code. Maximum attempts reached. Please request a new code.",
            attemptsRemaining: remaining,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Successful verification: generate single-use verification token (64-char hex)
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const verificationToken = Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Hash token for database storage
      const tokenHash = await sha256Hex(verificationToken);

      // Transition challenge to 'verified' with 15-minute window to complete registration
      const registrationProofExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

      await adminClient
        .from("email_otp_challenges")
        .update({
          status: "verified",
          verified_at: now.toISOString(),
          verification_token_hash: tokenHash,
          expires_at: registrationProofExpiresAt.toISOString(),
        })
        .eq("id", challenge.id);

      return new Response(
        JSON.stringify({
          success: true,
          verificationToken,
          message: "Email verified successfully.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: '${action}'. Supported actions: 'send_otp', 'verify_otp'.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("CampusRide registration-email-otp error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
