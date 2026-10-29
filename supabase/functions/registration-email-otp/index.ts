// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import nodemailer from "npm:nodemailer@6.9.10";

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
    const gmailUser = Deno.env.get("GMAIL_USER") || "campusride.srmap@gmail.com";
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    const gasWebAppUrl = Deno.env.get("APPS_SCRIPT_URL");
    const gasSecret = Deno.env.get("CAMPUSRIDE_SECRET");
    const serverSalt = Deno.env.get("OTP_SERVER_SALT") || "campusride_otp_security_salt_2026";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing required Supabase credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!gmailAppPassword && (!gasWebAppUrl || !gasSecret)) {
      return new Response(
        JSON.stringify({ error: "No email dispatch service configured (Gmail App Password or Google Apps Script required)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json().catch(() => null);
    const action = body?.action;

    // Helper: Send HTML email via Gmail SMTP (or fallback to Google Apps Script)
    async function sendMailHelper(toEmail: string, subject: string, htmlContent: string): Promise<boolean> {
      if (gmailAppPassword) {
        try {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
              user: gmailUser,
              pass: gmailAppPassword.replace(/\s+/g, ""),
            },
          });
          await new Promise<void>((resolve, reject) => {
            transporter.sendMail(
              {
                from: `"CampusRide SRM" <${gmailUser}>`,
                to: toEmail,
                subject: subject,
                html: htmlContent,
              },
              (err: any) => {
                if (err) return reject(err);
                resolve();
              }
            );
          });
          return true;
        } catch (e: any) {
          console.error("sendMailHelper SMTP error:", e);
        }
      }
      if (gasWebAppUrl && gasSecret) {
        try {
          const res = await fetch(gasWebAppUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              secret: gasSecret,
              action: "send_custom_email",
              email: toEmail,
              subject: subject,
              html: htmlContent,
            }),
          });
          const resJson = await res.json().catch(() => null);
          return !!(res.ok && resJson?.success);
        } catch (e: any) {
          console.error("sendMailHelper GAS error:", e);
        }
      }
      return false;
    }

    // =========================================================================
    // ACTION: NOTIFY RIDE REQUESTED (Sent to Driver when someone requests a seat)
    // ONLY student's full name is included. NO registration number. NO mobile number.
    // =========================================================================
    if (action === "notify_ride_requested") {
      const { ride_id, passenger_name, seats_requested } = body || {};
      if (!ride_id) {
        return new Response(JSON.stringify({ error: "Missing ride_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch ride details
      const { data: ride, error: rideErr } = await adminClient
        .from("rides")
        .select("id, provider_id, from_location, to_location, departure_at, vehicle_type")
        .eq("id", ride_id)
        .single();

      if (rideErr || !ride) {
        return new Response(JSON.stringify({ error: "Ride not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch driver/provider's email from auth.users
      const { data: driverUser, error: driverUserErr } = await adminClient.auth.admin.getUserById(ride.provider_id);
      const driverEmail = driverUser?.user?.email;

      if (!driverEmail) {
        return new Response(JSON.stringify({ error: "Driver email not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch driver's full name from profiles
      const { data: driverProfile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("id", ride.provider_id)
        .single();

      const driverDisplayName = driverProfile?.full_name?.trim() || "Rider";
      const requesterDisplayName = (passenger_name && String(passenger_name).trim()) || "An SRM Student";
      const seatCount = Number(seats_requested) || 1;

      // Format departure time nicely
      let formattedTime = "Upcoming";
      try {
        const d = new Date(ride.departure_at);
        formattedTime = d.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        });
      } catch (_) {}

      const emailSubject = `Ride Request: ${requesterDisplayName} wants to join your ride`;
      const emailHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
            <tr>
              <td align="center">
                
                <!-- Simple Clean Card -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
                  
                  <!-- Top Blue Stripe -->
                  <tr>
                    <td style="height: 5px; background: #2563eb;"></td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 36px 32px 32px 32px;">
                      
                      <!-- Header -->
                      <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 1px;">
                        CampusRide SRM-AP
                      </p>
                      
                      <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                        New Ride Request
                      </h1>

                      <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                        Hi <strong>${driverDisplayName}</strong>, <strong>${requesterDisplayName}</strong> requested to join your upcoming ride.
                      </p>

                      <!-- Simple Clean Details Box -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f8fafc; border: 1px solid #edf2f7; border-radius: 12px; margin-bottom: 28px; padding: 18px 20px;">
                        <tr>
                          <td style="padding-bottom: 12px;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Route:</span><br>
                            <span style="font-size: 15px; color: #0f172a; font-weight: 600;">${ride.from_location} &rarr; ${ride.to_location}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-bottom: 12px;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Departure:</span><br>
                            <span style="font-size: 14px; color: #0f172a; font-weight: 600;">${formattedTime}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-bottom: 12px;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Passenger:</span><br>
                            <span style="font-size: 14px; color: #0f172a; font-weight: 600;">${requesterDisplayName}</span>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Seats Requested:</span><br>
                            <span style="font-size: 14px; color: #0f172a; font-weight: 600;">${seatCount} ${seatCount === 1 ? "seat" : "seats"}</span>
                          </td>
                        </tr>
                      </table>

                      <!-- Button -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                        <tr>
                          <td>
                            <a href="https://campusridesrmap.vercel.app/" target="_blank" style="display: block; text-align: center; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 600;">
                              Open CampusRide to Review
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                        For privacy, phone numbers are shared only after you accept the request.
                      </p>

                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 18px 32px; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                        CampusRide &bull; SRM University-AP Carpooling
                      </p>
                    </td>
                  </tr>

                </table>

              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const sent = await sendMailHelper(driverEmail, emailSubject, emailHtml);
      return new Response(JSON.stringify({ success: sent, recipient: driverEmail }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ACTION: NOTIFY RIDE ACCEPTED (Sent to Passenger when Driver accepts their request)
    // ONLY driver's full name is included. NO registration number. NO mobile number.
    // =========================================================================
    if (action === "notify_ride_accepted") {
      const { booking_id, driver_name } = body || {};
      if (!booking_id) {
        return new Response(JSON.stringify({ error: "Missing booking_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch booking record
      const { data: booking, error: bookingErr } = await adminClient
        .from("bookings")
        .select("id, passenger_id, ride_id, pickup_location, dropoff_location, seats_requested")
        .eq("id", booking_id)
        .single();

      if (bookingErr || !booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch passenger's email from auth.users
      const { data: passengerUser, error: passUserErr } = await adminClient.auth.admin.getUserById(booking.passenger_id);
      const passengerEmail = passengerUser?.user?.email;

      if (!passengerEmail) {
        return new Response(JSON.stringify({ error: "Passenger email not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch passenger profile
      const { data: passengerProfile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("id", booking.passenger_id)
        .single();

      // Fetch ride info
      const { data: ride } = await adminClient
        .from("rides")
        .select("from_location, to_location, departure_at, vehicle_type")
        .eq("id", booking.ride_id)
        .single();

      const passengerDisplayName = passengerProfile?.full_name?.trim() || "SRM Student";
      const driverDisplayName = (driver_name && String(driver_name).trim()) || "Your Driver";

      let formattedTime = "Scheduled Time";
      try {
        if (ride?.departure_at) {
          const d = new Date(ride.departure_at);
          formattedTime = d.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
          });
        }
      } catch (_) {}

      const pickup = booking.pickup_location || ride?.from_location || "SRM Campus";
      const dropoff = booking.dropoff_location || ride?.to_location || "Destination";

      const emailSubject = `Ride Confirmed by ${driverDisplayName}`;
      const emailHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
            <tr>
              <td align="center">
                
                <!-- Simple Clean Card -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
                  
                  <!-- Top Green Stripe -->
                  <tr>
                    <td style="height: 5px; background: #10b981;"></td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 36px 32px 32px 32px;">
                      
                      <!-- Header -->
                      <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 1px;">
                        CampusRide SRM-AP
                      </p>
                      
                      <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                        Ride Confirmed!
                      </h1>

                      <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                        Hi <strong>${passengerDisplayName}</strong>, great news! <strong>${driverDisplayName}</strong> accepted your ride request.
                      </p>

                      <!-- Simple Clean Details Box -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f8fafc; border: 1px solid #edf2f7; border-radius: 12px; margin-bottom: 28px; padding: 18px 20px;">
                        <tr>
                          <td style="padding-bottom: 12px;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Route:</span><br>
                            <span style="font-size: 15px; color: #0f172a; font-weight: 600;">${pickup} &rarr; ${dropoff}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-bottom: 12px;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Departure:</span><br>
                            <span style="font-size: 14px; color: #0f172a; font-weight: 600;">${formattedTime}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-bottom: 12px;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Vehicle:</span><br>
                            <span style="font-size: 14px; color: #0f172a; font-weight: 600;">${ride?.vehicle_type || "Vehicle"}</span>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <span style="font-size: 12px; color: #64748b; font-weight: 500;">Driver:</span><br>
                            <span style="font-size: 14px; color: #0f172a; font-weight: 600;">${driverDisplayName}</span>
                          </td>
                        </tr>
                      </table>

                      <!-- Button -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                        <tr>
                          <td>
                            <a href="https://campusridesrmap.vercel.app/" target="_blank" style="display: block; text-align: center; background: #10b981; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 600;">
                              View Ride Details
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                        You can now view each other's phone number on the <strong>My Trips</strong> tab inside CampusRide.
                      </p>

                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 18px 32px; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                        CampusRide &bull; SRM University-AP Carpooling
                      </p>
                    </td>
                  </tr>

                </table>

              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const sent = await sendMailHelper(passengerEmail, emailSubject, emailHtml);
      return new Response(JSON.stringify({ success: sent, recipient: passengerEmail }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // ACTION: NOTIFY MATCHING RIDE ALERTS (Called when a new ride is published)
    // Checks for students waiting for a ride on this route and emails them!
    // =========================================================================
    if (action === "notify_matching_ride_alerts") {
      const { ride_id, driver_name } = body || {};
      if (!ride_id) {
        return new Response(JSON.stringify({ error: "Missing ride_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch newly published ride
      const { data: ride, error: rideErr } = await adminClient
        .from("rides")
        .select("id, provider_id, from_location, to_location, departure_at, vehicle_type, available_seats, cost_per_seat")
        .eq("id", ride_id)
        .single();

      if (rideErr || !ride) {
        return new Response(JSON.stringify({ error: "Ride not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find all students with active ride alerts
      const { data: alerts, error: alertErr } = await adminClient
        .from("ride_alerts")
        .select("id, user_id, user_email, user_name, from_location, to_location")
        .eq("status", "active");

      if (alertErr || !alerts || alerts.length === 0) {
        return new Response(JSON.stringify({ success: true, count: 0, message: "No active alerts found" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Filter and deduplicate subscribers (exclude the driver who created this ride)
      const recipientMap = new Map();
      for (const a of alerts) {
        if (a.user_id && ride.provider_id && a.user_id === ride.provider_id) {
          continue; // Don't send notification to driver about their own ride
        }
        const emailKey = (a.user_email || "").trim().toLowerCase();
        if (emailKey && !recipientMap.has(emailKey)) {
          recipientMap.set(emailKey, a);
        }
      }

      const activeSubscribers = Array.from(recipientMap.values());

      if (activeSubscribers.length === 0) {
        return new Response(JSON.stringify({ success: true, count: 0, message: "No eligible subscribers" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let formattedTime = "Upcoming";
      try {
        if (ride.departure_at) {
          const d = new Date(ride.departure_at);
          formattedTime = d.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
          });
        }
      } catch (_) {}

      const driverDisp = (driver_name && String(driver_name).trim()) || "A Fellow Student";
      const seatsDisp = `${ride.available_seats || 1} seat${(ride.available_seats || 1) > 1 ? "s" : ""} left`;
      const costDisp = Number(ride.cost_per_seat) === 0 ? "Free" : `₹${ride.cost_per_seat} / seat`;

      let sentCount = 0;
      const alertedIds: string[] = [];

      for (const alert of activeSubscribers) {
        const studentName = alert.user_name || "SRM Student";
        const emailSubject = `🔔 New Ride Alert: ${ride.from_location} ➔ ${ride.to_location} - CampusRide`;
        const emailHtml = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
              <tr>
                <td align="center">
                  
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
                    
                    <!-- Top Accent Stripe -->
                    <tr>
                      <td style="height: 5px; background: linear-gradient(90deg, #2563eb, #3b82f6);"></td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                      <td style="padding: 36px 32px 32px 32px;">
                        
                        <!-- Header -->
                        <p style="margin: 0 0 16px 0; font-size: 13px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 1px;">
                          CampusRide Alert 🔔
                        </p>
                        
                        <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                          New Ride Just Offered!
                        </h1>

                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                          Hi <strong>${studentName}</strong>, great news! A new ride was just published for the route you were looking for.
                        </p>

                        <!-- Clean Ride Details Box -->
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f8fafc; border: 1px solid #edf2f7; border-radius: 12px; margin-bottom: 28px; padding: 18px 20px;">
                          <tr>
                            <td style="padding-bottom: 12px;">
                              <span style="font-size: 12px; color: #64748b; font-weight: 500;">Route:</span><br>
                              <span style="font-size: 15px; color: #0f172a; font-weight: 600;">${ride.from_location} &rarr; ${ride.to_location}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-bottom: 12px;">
                              <span style="font-size: 12px; color: #64748b; font-weight: 500;">Departure:</span><br>
                              <span style="font-size: 14px; color: #0f172a; font-weight: 600;">🗓 ${formattedTime}</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-bottom: 12px;">
                              <span style="font-size: 12px; color: #64748b; font-weight: 500;">Vehicle:</span><br>
                              <span style="font-size: 14px; color: #0f172a; font-weight: 600;">🚘 ${ride.vehicle_type || "Vehicle"} (${seatsDisp})</span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding-bottom: 12px;">
                              <span style="font-size: 12px; color: #64748b; font-weight: 500;">Offered by:</span><br>
                              <span style="font-size: 14px; color: #0f172a; font-weight: 600;">👤 ${driverDisp}</span>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <span style="font-size: 12px; color: #64748b; font-weight: 500;">Contribution:</span><br>
                              <span style="font-size: 14px; color: #0f172a; font-weight: 600;">💰 ${costDisp}</span>
                            </td>
                          </tr>
                        </table>

                        <!-- CTA Button -->
                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                          <tr>
                            <td>
                              <a href="https://campusridesrmap.vercel.app/" target="_blank" style="display: block; text-align: center; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 600;">
                                Book Seat Before It Fills Up &rarr;
                              </a>
                            </td>
                          </tr>
                        </table>

                        <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                          You received this email because you turned on ride alerts on CampusRide.
                        </p>

                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 18px 32px; text-align: center;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          CampusRide &bull; SRM University-AP Carpooling
                        </p>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>
            </table>
          </body>
          </html>
        `;

        const sent = await sendMailHelper(alert.user_email, emailSubject, emailHtml);
        if (sent) {
          sentCount++;
          alertedIds.push(alert.id);
        }
      }

      // Update notified_at timestamp while keeping alert active for upcoming rides
      if (alertedIds.length > 0) {
        await adminClient
          .from("ride_alerts")
          .update({ notified_at: new Date().toISOString() })
          .in("id", alertedIds);
      }

      return new Response(JSON.stringify({ success: true, count: sentCount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Email check for OTP actions
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

      // Deliver verification email
      let emailSent = false;
      let dispatchError = "";

      // METHOD 1: Direct Gmail SMTP with App Password (500 emails/day, official Google delivery)
      if (gmailAppPassword) {
        try {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
              user: gmailUser,
              pass: gmailAppPassword.replace(/\s+/g, ""), // Strip spaces from 16-letter App Password
            },
          });

          await new Promise<void>((resolve, reject) => {
            transporter.sendMail(
              {
                from: `"CampusRide SRM" <${gmailUser}>`,
                to: cleanEmail,
                subject: `CampusRide Verification Code: ${otpCode}`,
                html: `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  </head>
                  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 30px 12px;">
                      <tr>
                        <td align="center">
                          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
                            
                            <!-- Header Banner -->
                            <tr>
                              <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #2563eb 100%); padding: 32px 24px; text-align: center;">
                                <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 30px; padding: 6px 16px; margin-bottom: 10px;">
                                  <span style="color: #ffffff; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">🚗 CampusRide</span>
                                </div>
                                <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 0 0 6px 0; letter-spacing: -0.5px;">Email Verification</h1>
                                <p style="color: #cbd5e1; font-size: 13px; margin: 0; font-weight: 400;">SRM University-AP &bull; Carpooling Network</p>
                              </td>
                            </tr>

                            <!-- Card Body -->
                            <tr>
                              <td style="padding: 32px 28px 24px 28px;">
                                <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #0f172a;">Hello SRM Student,</p>
                                <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                                  Use the 6-digit verification code below to verify your official SRM University-AP email address and activate your CampusRide account:
                                </p>

                                <!-- Modern High-Contrast OTP Box -->
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 22px;">
                                  <tr>
                                    <td align="center" style="background: #f0f7ff; border: 2px solid #3b82f6; border-radius: 14px; padding: 22px 16px;">
                                      <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 1.5px;">Your One-Time Password</p>
                                      <div style="font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #1e3a8a; font-family: 'SF Pro Display', Consolas, Monaco, monospace; margin: 6px 0;">
                                        ${otpCode}
                                      </div>
                                      <div style="display: inline-block; background: #e0f2fe; color: #0369a1; border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 600; margin-top: 6px;">
                                        ⏱ Valid for 5 minutes only
                                      </div>
                                    </td>
                                  </tr>
                                </table>

                                <!-- Notice Box -->
                                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 8px; margin-bottom: 22px;">
                                  <tr>
                                    <td style="padding: 12px 14px;">
                                      <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #92400e;">
                                        <strong>🔒 Security Reminder:</strong> Never share this verification code or your SRM credentials with anyone. CampusRide team will never ask for your code.
                                      </p>
                                    </td>
                                  </tr>
                                </table>

                                <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                                  If you did not initiate this registration, you can safely disregard this email.
                                </p>
                              </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                              <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 20px 24px; text-align: center;">
                                <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #1e3a8a;">
                                  CampusRide SRM-AP
                                </p>
                                <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.4;">
                                  Share rides &bull; Split costs &bull; Commute smarter<br />
                                  SRM University-AP, Amaravati, Andhra Pradesh
                                </p>
                              </td>
                            </tr>

                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                  </html>
                `,
              },
              (err: any, info: any) => {
                if (err) {
                  return reject(err);
                }
                resolve();
              }
            );
          });

          emailSent = true;
        } catch (smtpErr: any) {
          console.error("Gmail SMTP dispatch error:", smtpErr);
          dispatchError = smtpErr?.message || "Gmail SMTP delivery failed";
        }
      }

      // METHOD 2: Fallback to Google Apps Script if SMTP is not configured or failed
      if (!emailSent && gasWebAppUrl && gasSecret) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
          const gasRes = await fetch(gasWebAppUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              secret: gasSecret,
              action: "send_otp",
              email: cleanEmail,
              otp: otpCode,
              otpCode: otpCode,
            }),
            redirect: "follow",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const gasBody = await gasRes.json().catch(() => null);
          if (gasRes.ok && gasBody && gasBody.success === true) {
            emailSent = true;
          } else {
            dispatchError = gasBody?.error || "Google Apps Script delivery failed";
          }
        } catch (gasErr: any) {
          clearTimeout(timeoutId);
          dispatchError = gasErr?.message || "Google Apps Script network error";
        }
      }

      if (!emailSent) {
        // Expire challenge on delivery failure so student can retry
        await adminClient
          .from("email_otp_challenges")
          .update({ status: "expired" })
          .eq("id", insertedChallenge.id);

        return new Response(
          JSON.stringify({
            error: dispatchError || "Failed to deliver verification code. Please check your email and try again.",
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
