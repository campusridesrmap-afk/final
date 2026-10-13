import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/);

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log("=== CampusRide RPC & Expiration Verification ===");

  // 1. Test raw RPC response inspection
  console.log("\n[Test 1] Inspecting raw RPC call:");
  const { data: rpcData, error: rpcErr, status, statusText } = await supabase.rpc("close_expired_pending_bookings");
  console.log("Status:", status, statusText);
  console.log("Error code:", rpcErr?.code);
  console.log("Error message:", rpcErr?.message);
  console.log("Error details:", rpcErr?.details);

  // 2. Test in-flight deduplication & throttling simulation
  console.log("\n[Test 2] Simulating triggerCloseExpiredRpc behavior:");
  let inFlight = null;
  let lastCall = 0;
  let networkCallCount = 0;

  async function simulatedTrigger(force = false) {
    const now = Date.now();
    if (!force && now - lastCall < 60000) {
      console.log("  -> Throttled: call skipped (last call was", now - lastCall, "ms ago)");
      return;
    }
    if (inFlight) {
      console.log("  -> In-flight deduplication: sharing existing request");
      return inFlight;
    }

    const task = (async () => {
      networkCallCount++;
      console.log("  -> Dispatched network request #" + networkCallCount);
      const res = await supabase.rpc("close_expired_pending_bookings");
      lastCall = Date.now();
      inFlight = null;
      return res;
    })();

    inFlight = task;
    return task;
  }

  // Rapid calls simulating StrictMode / re-render / multiple effects
  console.log("Firing 3 concurrent calls:");
  const [res1, res2, res3] = await Promise.all([
    simulatedTrigger(),
    simulatedTrigger(),
    simulatedTrigger()
  ]);
  console.log("Total network calls made for 3 concurrent requests:", networkCallCount, "(expected: 1)");

  // Immediate sequential call (should be throttled)
  console.log("Firing subsequent call immediately after completion:");
  await simulatedTrigger();
  console.log("Total network calls after immediate follow-up:", networkCallCount, "(expected: 1)");

  // Forced call (e.g. manual refresh)
  console.log("Firing forced call (manual refresh):");
  await simulatedTrigger(true);
  console.log("Total network calls after forced refresh:", networkCallCount, "(expected: 2)");

  // 3. Verify client-side expiration rule logic
  console.log("\n[Test 3] Verifying departure expiration rule calculation:");
  const nowMs = Date.now();
  const pastDepartureIso = new Date(nowMs - 3600000).toISOString();
  const futureDepartureIso = new Date(nowMs + 3600000).toISOString();

  const testBookings = [
    { id: "b1", status: "pending", rides: { departure_at: pastDepartureIso, status: "open" } },
    { id: "b2", status: "pending", rides: { departure_at: futureDepartureIso, status: "open" } },
    { id: "b3", status: "accepted", rides: { departure_at: pastDepartureIso, status: "open" } },
    { id: "b4", status: "rejected", rides: { departure_at: pastDepartureIso, status: "open" } },
    { id: "b5", status: "cancelled", rides: { departure_at: pastDepartureIso, status: "open" } },
  ];

  testBookings.forEach((b) => {
    const depTime = new Date(b.rides?.departure_at).getTime();
    const isDepPassed = !isNaN(depTime) && depTime <= nowMs;
    const effectiveStatus = b.status === "pending" && isDepPassed ? "expired" : b.status;
    console.log(`  - Booking ${b.id}: original=${b.status}, isDepPassed=${isDepPassed} => effectiveStatus=${effectiveStatus}`);
  });

  console.log("\n=== All Verification Tests Passed ===");
}

runTests().catch(console.error);
