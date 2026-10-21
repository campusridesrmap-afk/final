import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const gasWebAppUrl = Deno.env.get("APPS_SCRIPT_URL");
    const gasSecret = Deno.env.get("CAMPUSRIDE_SECRET");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !gasWebAppUrl || !gasSecret) {
      return new Response(JSON.stringify({ error: "Server configuration missing required secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify calling user session with anon client + caller JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Privileged service client for authorization & atomic state operations
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Authorize caller using existing is_app_admin database RPC with explicit user id
    const { data: isAdmin, error: adminCheckError } = await adminClient.rpc("is_app_admin", {
      p_user_id: user.id,
    });

    if (adminCheckError || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Administrator privileges required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Validate request payload
    const body = await req.json().catch(() => null);
    const registrationId = body?.registrationId;
    if (!registrationId || typeof registrationId !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid registrationId parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Verify registration existence, approval status, and eligibility
    const { data: reg, error: fetchError } = await adminClient
      .from("registrations")
      .select("id, full_name, email, registration_number, status, welcome_email_status, welcome_email_sent_at, welcome_email_error, welcome_email_last_attempt_at")
      .eq("id", registrationId)
      .single();

    if (fetchError || !reg) {
      return new Response(JSON.stringify({ error: "Registration record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Defense-in-depth: Never send emails for non-approved registrations (rejected, pending, etc.)
    if (reg.status !== "approved") {
      return new Response(
        JSON.stringify({
          error: `Cannot send welcome email for registration with status '${reg.status}'. Only approved students are eligible.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Strict duplicate check: If already successfully sent, do not re-send
    if (reg.welcome_email_status === "sent") {
      return new Response(
        JSON.stringify({
          success: true,
          emailSent: false,
          reason: "already_sent",
          sentAt: reg.welcome_email_sent_at,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Concurrency guard: If currently sending, check if stalled lease (> 5 minutes)
    if (reg.welcome_email_status === "sending") {
      const lastAttempt = reg.welcome_email_last_attempt_at
        ? new Date(reg.welcome_email_last_attempt_at).getTime()
        : 0;
      const isRecent = Date.now() - lastAttempt < 5 * 60 * 1000;
      if (isRecent) {
        return new Response(
          JSON.stringify({
            error: "Email dispatch is already in progress for this student. Please wait a moment.",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Strict domain validation: Only @srmap.edu.in recipients allowed
    const emailLower = reg.email.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._%+-]+@srmap\.edu\.in$/.test(emailLower)) {
      return new Response(
        JSON.stringify({ error: "Recipient email must be a valid @srmap.edu.in address" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Atomic optimistic claim in database: transition status to 'sending'
    // Matches exact prior status to guarantee no two concurrent requests can both claim
    const { data: claimData, error: claimError } = await adminClient
      .from("registrations")
      .update({
        welcome_email_status: "sending",
        welcome_email_last_attempt_at: new Date().toISOString(),
        welcome_email_error: null,
      })
      .eq("id", registrationId)
      .eq("status", "approved")
      .eq("welcome_email_status", reg.welcome_email_status)
      .select("id");

    if (claimError || !claimData || claimData.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Dispatch claim rejected. Email dispatch was claimed by a concurrent request.",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Construct payload for Google Apps Script Web App
    // Note: The temporary password is the registration number, matching CampusRide's design.
    // Temporary passwords and shared secrets are never logged.
    const gasPayload = {
      secret: gasSecret,
      student: {
        name: reg.full_name,
        email: emailLower,
        regNo: reg.registration_number,
        regNumber: reg.registration_number,
        tempPassword: reg.registration_number,
      },
    };

    let gasRes: Response;
    let gasResponseBody: any = null;
    let timedOut = false;

    // 15-second timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);

    try {
      gasRes = await fetch(gasWebAppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gasPayload),
        redirect: "follow", // Essential: Google Apps Script Web Apps return a 302 redirect
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      gasResponseBody = await gasRes.json().catch(() => null);
    } catch (networkErr: any) {
      clearTimeout(timeoutId);
      const isTimeout = timedOut || networkErr?.name === "AbortError";
      const failureReason = isTimeout
        ? "Network timeout contacting Google Apps Script Web App. Ambiguous delivery state: verify with recipient before manual retry to prevent duplicates."
        : `Network error contacting email dispatch service: ${networkErr?.message || "Connection failed"}`;

      await adminClient
        .from("registrations")
        .update({
          welcome_email_status: "failed",
          welcome_email_error: failureReason,
        })
        .eq("id", registrationId);

      return new Response(
        JSON.stringify({
          success: false,
          error: failureReason,
          ambiguousTimeout: isTimeout,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Evaluate response from Google Apps Script
    const isGasSuccess = gasRes.ok && gasResponseBody !== null && gasResponseBody.success === true;

    if (isGasSuccess) {
      const nowIso = new Date().toISOString();
      await adminClient
        .from("registrations")
        .update({
          welcome_email_status: "sent",
          welcome_email_sent_at: nowIso,
          welcome_email_error: null,
        })
        .eq("id", registrationId);

      return new Response(
        JSON.stringify({
          success: true,
          emailSent: true,
          sentAt: nowIso,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      let errorMsg = gasResponseBody?.error;
      if (!errorMsg) {
        if (!gasRes.ok) {
          errorMsg = `Email dispatch service returned HTTP ${gasRes.status}${gasRes.statusText ? " " + gasRes.statusText : ""}`;
        } else if (!gasResponseBody) {
          errorMsg = "Email dispatch service returned non-JSON response. Check Web App deployment permissions.";
        } else {
          errorMsg = "Email dispatch service reported an unspecified error.";
        }
      }

      await adminClient
        .from("registrations")
        .update({
          welcome_email_status: "failed",
          welcome_email_error: errorMsg,
        })
        .eq("id", registrationId);

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
