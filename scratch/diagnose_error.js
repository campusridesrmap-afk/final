import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/);

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQueries() {
  console.log("Testing Supabase connection...");

  // 1. Test loadRides query
  console.log("\n1. Testing loadRides query:");
  const nowIso = new Date().toISOString();
  console.log("Current ISO:", nowIso);

  const { data: allRides, error: allRidesErr } = await supabase
    .from("rides")
    .select("id, from_location, to_location, departure_at, status, available_seats");

  console.log("All rides in DB (count):", allRides?.length, "Error:", allRidesErr?.message);
  if (allRides && allRides.length > 0) {
    allRides.forEach((r) => {
      console.log(`  - Ride ${r.id}: ${r.from_location} -> ${r.to_location}, status: ${r.status}, seats: ${r.available_seats}, departure_at: ${r.departure_at}`);
    });
  }

  const { data: upcomingRides, error: upErr } = await supabase
    .from("rides")
    .select("*")
    .eq("status", "open")
    .gt("departure_at", nowIso)
    .gt("available_seats", 0);
  console.log("Upcoming open rides (.gt):", upcomingRides?.length, "Error:", upErr?.message);

  // 2. Test close_expired_pending_bookings RPC
  console.log("\n2. Testing close_expired_pending_bookings RPC:");
  const { data: rpcData, error: rpcErr } = await supabase.rpc("close_expired_pending_bookings");
  console.log("RPC result:", rpcData, "RPC error:", rpcErr?.message);

  // 3. Test bookings query
  console.log("\n3. Testing bookings query:");
  const { data: bookingsData, error: bookErr } = await supabase
    .from("bookings")
    .select("*, rides(*)");
  console.log("Bookings result:", bookingsData?.length, "Error:", bookErr?.message);
}

testQueries().catch(console.error);
