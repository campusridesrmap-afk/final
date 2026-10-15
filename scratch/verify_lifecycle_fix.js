import assert from "assert";

console.log("==================================================================");
console.log("CampusRide Ride-Completion Lifecycle Bug Fix Verification");
console.log("==================================================================\n");

// Simulation database
function createTestDB() {
  const driverId = "driver-A";
  const passengerBId = "passenger-B";
  const passengerCId = "passenger-C";
  const rideId = "ride-1";

  const db = {
    rides: [
      {
        id: rideId,
        provider_id: driverId,
        from_location: "SRM AP",
        to_location: "Vijayawada",
        departure_at: new Date(Date.now() + 3600000).toISOString(),
        status: "open",
        seats: 3,
        available_seats: 1, // 3 - 2 accepted = 1
        cost_per_seat: 50,
      },
    ],
    bookings: [
      {
        id: "booking-B",
        ride_id: rideId,
        passenger_id: passengerBId,
        seats_requested: 1,
        status: "accepted",
      },
      {
        id: "booking-C",
        ride_id: rideId,
        passenger_id: passengerCId,
        seats_requested: 1,
        status: "accepted",
      },
      {
        id: "booking-D-pending",
        ride_id: rideId,
        passenger_id: "passenger-D",
        seats_requested: 1,
        status: "pending",
      },
    ],
    profiles: {
      "driver-A": { id: "driver-A", full_name: "Provider A", mobile_number: "9876543210" },
      "passenger-B": { id: "passenger-B", full_name: "Passenger B", mobile_number: "9123456780" },
      "passenger-C": { id: "passenger-C", full_name: "Passenger C", mobile_number: "9988776655" },
      "passenger-D": { id: "passenger-D", full_name: "Passenger D", mobile_number: "9000000000" },
    },
  };
  return { db, driverId, passengerBId, passengerCId, rideId };
}

// Simulated RPC: complete_passenger_trip
function rpcCompletePassengerTrip(db, callerId, bookingId) {
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new Error("Booking not found");

  const ride = db.rides.find((r) => r.id === booking.ride_id);
  if (!ride) throw new Error("Associated ride not found");

  if (callerId !== booking.passenger_id && callerId !== ride.provider_id) {
    throw new Error("Unauthorized: Only the passenger or the ride driver can complete this trip");
  }

  if (booking.status === "completed") {
    return { success: true, status: "completed", already_completed: true };
  }

  if (booking.status !== "accepted") {
    throw new Error(`Only accepted bookings can be completed (current status: ${booking.status})`);
  }

  booking.status = "completed";
  booking.updated_at = new Date().toISOString();

  return { success: true, booking_id: bookingId, ride_id: booking.ride_id, status: "completed" };
}

// Simulated RPC: complete_ride
function rpcCompleteRide(db, callerId, rideId, p_force = false) {
  const ride = db.rides.find((r) => r.id === rideId);
  if (!ride) throw new Error("Ride not found");

  if (ride.provider_id !== callerId) {
    throw new Error("Unauthorized: Only the ride provider can complete the overall ride");
  }

  if (ride.status === "completed") {
    return { success: true, status: "completed", already_completed: true };
  }

  if (ride.status === "cancelled") {
    throw new Error("Cannot complete a cancelled ride");
  }

  const activeCount = db.bookings.filter((b) => b.ride_id === rideId && b.status === "accepted").length;

  if (activeCount > 0 && !p_force) {
    throw new Error(
      `Cannot complete ride: ${activeCount} active passenger trip(s) remain. Confirm ending the ride with active passengers or complete passenger trips first.`
    );
  }

  ride.status = "completed";
  ride.available_seats = 0;

  if (activeCount > 0) {
    db.bookings.forEach((b) => {
      if (b.ride_id === rideId && b.status === "accepted") {
        b.status = "completed";
      }
    });
  }

  db.bookings.forEach((b) => {
    if (b.ride_id === rideId && b.status === "pending") {
      b.status = "cancelled";
    }
  });

  return { success: true, status: "completed", completed_passengers_count: activeCount };
}

// Simulated Contact Authorization (matches get_trip_participant_contact SQL)
function getTripParticipantContact(db, callerId, rideId, targetUserId) {
  const ride = db.rides.find((r) => r.id === rideId);
  if (!ride || ride.status !== "open") return null;

  let isAuthorized = false;
  if (ride.provider_id === callerId) {
    isAuthorized = db.bookings.some(
      (b) => b.ride_id === rideId && b.passenger_id === targetUserId && b.status === "accepted"
    );
  } else if (ride.provider_id === targetUserId) {
    isAuthorized = db.bookings.some(
      (b) => b.ride_id === rideId && b.passenger_id === callerId && b.status === "accepted"
    );
  }

  if (!isAuthorized) return null;
  return db.profiles[targetUserId] || null;
}

// ==============================================================================
// TEST 1: Passenger B Completes Trip
// ==============================================================================
console.log("--- TEST 1: Passenger B Completes Trip ---");
{
  const { db, driverId, passengerBId, passengerCId, rideId } = createTestDB();

  // Initial State Checks
  assert.strictEqual(db.rides[0].status, "open", "Ride must be open initially");
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-B").status, "accepted");
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-C").status, "accepted");

  // Contact sharing active for both B and C with driver
  assert(getTripParticipantContact(db, passengerBId, rideId, driverId) !== null, "Passenger B can see driver contact");
  assert(getTripParticipantContact(db, passengerCId, rideId, driverId) !== null, "Passenger C can see driver contact");
  assert(getTripParticipantContact(db, driverId, rideId, passengerBId) !== null, "Driver can see Passenger B contact");
  assert(getTripParticipantContact(db, driverId, rideId, passengerCId) !== null, "Driver can see Passenger C contact");

  // Passenger B clicks "Complete Ride" (calls complete_passenger_trip)
  const res = rpcCompletePassengerTrip(db, passengerBId, "booking-B");
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, "completed");

  // 1. Verify ONLY Passenger B's booking status is completed
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-B").status, "completed", "Booking B must be completed");

  // 2. Verify Provider A's entire ride is NOT marked completed!
  assert.strictEqual(db.rides[0].status, "open", "Provider ride MUST remain open!");
  assert.strictEqual(db.rides[0].available_seats, 1, "Available seats must remain intact");

  // 3. Verify Passenger C remains accepted and active!
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-C").status, "accepted", "Passenger C MUST remain accepted!");

  // 4. Verify contact authorization: Passenger B's contact is closed, but Passenger C's contact is STILL active!
  assert.strictEqual(getTripParticipantContact(db, passengerBId, rideId, driverId), null, "Passenger B contact access closed");
  assert.strictEqual(getTripParticipantContact(db, driverId, rideId, passengerBId), null, "Driver access to B closed");
  assert(getTripParticipantContact(db, passengerCId, rideId, driverId) !== null, "Passenger C MUST still see driver contact");
  assert(getTripParticipantContact(db, driverId, rideId, passengerCId) !== null, "Driver MUST still see Passenger C contact");

  console.log("✔ Test 1 Passed: Passenger B completed trip; Provider ride & Passenger C remain open and active!");
}

// ==============================================================================
// TEST 2: Authorization Safeguards - Passenger CANNOT complete overall ride
// ==============================================================================
console.log("\n--- TEST 2: Authorization Safeguards ---");
{
  const { db, passengerBId, passengerCId, rideId } = createTestDB();

  // Passenger B tries to complete the overall ride
  assert.throws(
    () => rpcCompleteRide(db, passengerBId, rideId),
    /Unauthorized: Only the ride provider can complete the overall ride/,
    "Passenger B must NOT be allowed to call complete_ride"
  );

  // Passenger C tries to complete the overall ride
  assert.throws(
    () => rpcCompleteRide(db, passengerCId, rideId),
    /Unauthorized: Only the ride provider can complete the overall ride/,
    "Passenger C must NOT be allowed to call complete_ride"
  );

  // Stranger tries to complete passenger B's trip
  assert.throws(
    () => rpcCompletePassengerTrip(db, "stranger-999", "booking-B"),
    /Unauthorized: Only the passenger or the ride driver can complete this trip/,
    "Stranger must NOT be allowed to complete passenger trip"
  );

  console.log("✔ Test 2 Passed: Unauthorized calls properly rejected with security exceptions!");
}

// ==============================================================================
// TEST 3: Provider attempts to complete ride with active passengers
// ==============================================================================
console.log("\n--- TEST 3: Provider Completing Ride with Active Passengers ---");
{
  const { db, driverId, passengerBId, passengerCId, rideId } = createTestDB();

  // Passenger B completes trip
  rpcCompletePassengerTrip(db, passengerBId, "booking-B");

  // Passenger C is still active (status = 'accepted')
  // Provider attempts to end ride without p_force = true:
  assert.throws(
    () => rpcCompleteRide(db, driverId, rideId, false),
    /Cannot complete ride: 1 active passenger trip\(s\) remain/,
    "Must throw explicit warning if active passengers remain"
  );

  // Provider explicitly confirms with warning modal (p_force = true):
  const forceRes = rpcCompleteRide(db, driverId, rideId, true);
  assert.strictEqual(forceRes.success, true);
  assert.strictEqual(forceRes.completed_passengers_count, 1);
  assert.strictEqual(db.rides[0].status, "completed");
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-C").status, "completed");
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-D-pending").status, "cancelled");

  console.log("✔ Test 3 Passed: Safe explicit rule followed when completing ride with active passengers!");
}

// ==============================================================================
// TEST 4: Normal sequential completion (B completes, then C completes, then Driver ends)
// ==============================================================================
console.log("\n--- TEST 4: Normal Sequential Completion ---");
{
  const { db, driverId, passengerBId, passengerCId, rideId } = createTestDB();

  // Step 1: Passenger B completes trip
  rpcCompletePassengerTrip(db, passengerBId, "booking-B");
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-B").status, "completed");
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-C").status, "accepted");
  assert.strictEqual(db.rides[0].status, "open");

  // Step 2: Passenger C completes trip
  rpcCompletePassengerTrip(db, passengerCId, "booking-C");
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-C").status, "completed");
  assert.strictEqual(db.rides[0].status, "open", "Ride remains open until driver legitimately ends it");

  // Step 3: Driver ends ride (0 active passengers remain, so p_force=false succeeds)
  const endRes = rpcCompleteRide(db, driverId, rideId, false);
  assert.strictEqual(endRes.success, true);
  assert.strictEqual(db.rides[0].status, "completed");
  assert.strictEqual(db.rides[0].available_seats, 0);

  // Leftover pending requests cancelled
  assert.strictEqual(db.bookings.find((b) => b.id === "booking-D-pending").status, "cancelled");

  console.log("✔ Test 4 Passed: B completes -> C completes -> Driver completes ride smoothly!");
}

console.log("\n==================================================================");
console.log("ALL VERIFICATION TESTS PASSED SUCCESSFULLY (100%)");
console.log("==================================================================");
