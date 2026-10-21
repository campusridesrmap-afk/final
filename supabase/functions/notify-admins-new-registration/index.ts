import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import webpush from "npm:web-push@3.6.7";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const vapidPublicKey =
      Deno.env.get("VAPID_PUBLIC_KEY") ||
      "BOMvCHtVQqhgRdLB2_uUdrMXhwi1L0UzP2kjZlybO_W7IboURX8lce2b47k4p-GKUUJlxMW-wKEtOAASGKlQNY0";
    const vapidPrivateKey =
      Deno.env.get("VAPID_PRIVATE_KEY") ||
      "xxcFACKV-IRHcOhhbOWjMs3OLcJfgHhoGTllo0A8j5k";
    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") || "mailto:admin@srmap.edu.in";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server missing Supabase service configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Configure Web Push VAPID credentials
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Privileged service client for authorization & push subscription retrieval
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json().catch(() => ({}));
    const registrationId = body?.registrationId;
    const isTest = Boolean(body?.test);

    // 1. Handle Test Push Notification Request
    if (isTest) {
      // Fetch all active verified administrator subscriptions
      const { data: subs, error: subsError } = await adminClient
        .from("admin_push_subscriptions")
        .select("id, endpoint, p256dh, auth, user_id");

      if (subsError) {
        return new Response(JSON.stringify({ error: subsError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const activeSubs = Array.isArray(subs) ? subs : [];
      let delivered = 0;

      const payload = JSON.stringify({
        title: "CampusRide – New Request",
        body: "A new student registration request needs your review. (Test Alert)",
        icon: "/cr.jpeg",
        badge: "/cr.jpeg",
        url: "/#registrations",
        tag: "campusride-test-alert",
      });

      for (const sub of activeSubs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          delivered++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await adminClient.from("admin_push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, test: true, deliveredCount: delivered, totalSubscribers: activeSubs.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validate Registration ID
    if (!registrationId || typeof registrationId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid registrationId parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Duplicate Prevention / Idempotency Check
    // Check if notification has already been dispatched for this registration
    const { data: existingNotif } = await adminClient
      .from("admin_registration_notifications")
      .select("registration_id, notified_at, delivered_count")
      .eq("registration_id", registrationId)
      .maybeSingle();

    if (existingNotif) {
      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          message: "Notification already dispatched for this registration request",
          notifiedAt: existingNotif.notified_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verify Registration Existence and Status
    const { data: reg, error: regError } = await adminClient
      .from("registrations")
      .select("id, full_name, email, registration_number, status")
      .eq("id", registrationId)
      .single();

    if (regError || !reg) {
      return new Response(
        JSON.stringify({ error: "Registration record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (reg.status !== "pending") {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: `Registration status is '${reg.status}', not 'pending'. Skipping notification.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Fetch Verified Administrator Push Subscriptions
    // Strictly filter by users confirmed in public.app_admins
    const { data: subscriptions, error: fetchSubsError } = await adminClient
      .from("admin_push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id");

    if (fetchSubsError) {
      return new Response(
        JSON.stringify({ error: `Failed to query push subscriptions: ${fetchSubsError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminSubs = Array.isArray(subscriptions) ? subscriptions : [];

    // Filter to ensure user is still in app_admins table (defense in depth)
    const validAdminSubs: typeof adminSubs = [];
    for (const sub of adminSubs) {
      const { data: isAdmin } = await adminClient.rpc("is_app_admin", {
        p_user_id: sub.user_id,
      });
      if (isAdmin === true) {
        validAdminSubs.push(sub);
      }
    }

    // 6. Build Push Notification Payload
    const notificationPayload = JSON.stringify({
      title: "CampusRide – New Request",
      body: "A new student registration request needs your review.",
      icon: "/cr.jpeg",
      badge: "/cr.jpeg",
      url: "/#registrations",
      registrationId: reg.id,
      studentName: reg.full_name,
      registrationNumber: reg.registration_number,
      tag: `campusride-reg-${reg.id}`,
    });

    let deliveredCount = 0;
    const expiredSubIds: string[] = [];

    // 7. Dispatch Push Notifications to Administrators
    await Promise.allSettled(
      validAdminSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            notificationPayload
          );
          deliveredCount++;
        } catch (err: any) {
          console.warn(`CampusRide Push Error for sub ${sub.id}:`, err?.message || err);
          // If endpoint is 404 (Not Found) or 410 (Gone), the subscription has expired or was revoked
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            expiredSubIds.push(sub.id);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (expiredSubIds.length > 0) {
      await adminClient.from("admin_push_subscriptions").delete().in("id", expiredSubIds);
    }

    // 8. Record in admin_registration_notifications table for idempotency
    await adminClient.from("admin_registration_notifications").insert({
      registration_id: reg.id,
      delivered_count: deliveredCount,
      status: "delivered",
      notified_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        deliveredCount,
        totalSubscribers: validAdminSubs.length,
        registrationId: reg.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("CampusRide: notify-admins-new-registration unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal notification error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
