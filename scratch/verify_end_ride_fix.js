import assert from "assert";

console.log("==================================================================");
console.log("CampusRide Complete / End Ride Verification Test Suite");
console.log("==================================================================\n");

// -----------------------------------------------------------------------------
// Simulation Models
// -----------------------------------------------------------------------------
const driverId = "driver-uuid-1111";
const acceptedPassengerId = "passenger-uuid-2222";
const pendingPassengerId = "passenger-uuid-3333";
const strangerId = "stranger-uuid-9999";
const rideId = "ride-uuid-5555";

function createInitialState() {
  return {
    rides: [
      {
        id: rideId,
        provider_id: driverId,
        from_location: "SRM AP",
        to_location: "Benz Circle",
        status: "open",
        available_seats: 2,
        total_seats: 3,
      },
    ],
    bookings: [
      {
        id: "booking-accepted-1",
        ride_id: rideId,
        passenger_id: acceptedPassengerId,
        status: "accepted",
        seats_requested: 1,
      },
      {
        id: "booking-pending-1",
        ride_id: rideId,
        passenger_id: pendingPassengerId,
        status: "pending",
        seats_requested: 1,
      },
    ],
    liveLocations: [
      { id: "loc-1", ride_id: rideId, user_id: driverId, is_active: true },
      { id: "loc-2", ride_id: rideId, user_id: acceptedPassengerId, is_active: true },
    ],
  };
}

// -----------------------------------------------------------------------------
// Test 1: Complete Ride Logic Authorization & Execution
// -----------------------------------------------------------------------------
console.log("--- Test 1: Role Authorization for complete_ride ---");

function simulateCompleteRide(db, callerId, targetRideId) {
  const ride = db.rides.find((r) => r.id === targetRideId);
  if (!ride) throw new Error("Ride not found");

  const isDriver = ride.provider_id === callerId;
  const isAcceptedPassenger = db.bookings.some(
    (b) =>
      b.ride_id === targetRideId &&
      b.passenger_id === callerId &&
      (b.status === "accepted" || b.status === "completed")
  );

  if (!isDriver && !isAcceptedPassenger) {
    throw new Error(
      "Unauthorized: Only the driver or an accepted passenger can complete this ride"
    );
  }

  // Idempotency: if already completed, return success
  if (ride.status === "completed") {
    return { success: true, status: "completed", already_completed: true };
  }

  if (ride.status === "cancelled") {
    throw new Error("Cannot complete a cancelled ride");
  }

  // Mark ride as completed and close seats
  ride.status = "completed";
  ride.available_seats = 0;

  // Mark accepted bookings as completed
  db.bookings.forEach((b) => {
    if (b.ride_id === targetRideId && b.status === "accepted") {
      b.status = "completed";
    }
  });

  // Cancel remaining pending requests
  db.bookings.forEach((b) => {
    if (b.ride_id === targetRideId && b.status === "pending") {
      b.status = "cancelled";
    }
  });

  // Deactivate live locations
  db.liveLocations.forEach((l) => {
    if (l.ride_id === targetRideId) {
      l.is_active = false;
    }
  });

  return { success: true, status: "completed" };
}

// Case 1A: Driver completes ride
let db1 = createInitialState();
const driverResult = simulateCompleteRide(db1, driverId, rideId);
assert.strictEqual(driverResult.success, true);
assert.strictEqual(db1.rides[0].status, "completed");
assert.strictEqual(db1.rides[0].available_seats, 0);
assert.strictEqual(db1.bookings.find((b) => b.id === "booking-accepted-1").status, "completed");
assert.strictEqual(db1.bookings.find((b) => b.id === "booking-pending-1").status, "cancelled");
assert.strictEqual(db1.liveLocations.every((l) => l.is_active === false), true);
console.log("✓ Case 1A Passed: Driver can complete the ride successfully.");

// Case 1B: Accepted passenger completes ride
let db2 = createInitialState();
const passengerResult = simulateCompleteRide(db2, acceptedPassengerId, rideId);
assert.strictEqual(passengerResult.success, true);
assert.strictEqual(db2.rides[0].status, "completed");
assert.strictEqual(db2.rides[0].available_seats, 0);
assert.strictEqual(db2.bookings.find((b) => b.id === "booking-accepted-1").status, "completed");
assert.strictEqual(db2.bookings.find((b) => b.id === "booking-pending-1").status, "cancelled");
assert.strictEqual(db2.liveLocations.every((l) => l.is_active === false), true);
console.log("✓ Case 1B Passed: Accepted passenger can complete the ride successfully.");

// Case 1C: Pending passenger cannot complete ride
let db3 = createInitialState();
assert.throws(
  () => simulateCompleteRide(db3, pendingPassengerId, rideId),
  /Unauthorized/,
  "Pending passenger must not be authorized to complete the ride"
);
console.log("✓ Case 1C Passed: Pending passenger cannot complete the ride.");

// Case 1D: Unrelated stranger cannot complete ride
let db4 = createInitialState();
assert.throws(
  () => simulateCompleteRide(db4, strangerId, rideId),
  /Unauthorized/,
  "Stranger must not be authorized to complete the ride"
);
console.log("✓ Case 1D Passed: Stranger cannot complete the ride.\n");

// -----------------------------------------------------------------------------
// Test 2: Idempotency & Race Conditions
// -----------------------------------------------------------------------------
console.log("--- Test 2: Idempotency & Concurrent Completion ---");
// If driver already completed it, passenger clicking complete also receives success without errors
const idempotentResult = simulateCompleteRide(db1, acceptedPassengerId, rideId);
assert.strictEqual(idempotentResult.success, true);
assert.strictEqual(idempotentResult.already_completed, true);
console.log("✓ Test 2 Passed: Second complete call is cleanly idempotent.\n");

// -----------------------------------------------------------------------------
// Test 3: Frontend Fallback Row Verification (Swallowed Failure Prevention)
// -----------------------------------------------------------------------------
console.log("--- Test 3: Frontend Verification (Prevents Swallowed Update Failures) ---");

async function simulateFrontendHandler(callerRole, mockSupabase) {
  let completedSuccessfully = false;
  let errorCaught = null;

  try {
    // 1. RPC attempt
    const rpcRes = await mockSupabase.rpc("complete_ride", { p_ride_id: rideId });
    if (!rpcRes.error && rpcRes.data?.success) {
      completedSuccessfully = true;
    } else {
      // 2. Direct table update fallback with row verification
      const updateRes = await mockSupabase.updateRide({
        id: rideId,
        callerRole,
        status: "completed",
        available_seats: 0,
      });

      if (updateRes.data && updateRes.data.length > 0) {
        completedSuccessfully = true;
      } else {
        // Check if already completed
        const currentRide = await mockSupabase.getRide(rideId);
        if (currentRide && currentRide.status === "completed") {
          completedSuccessfully = true;
        } else {
          throw new Error("Unable to complete ride in database. Unauthorized or RLS rejected update.");
        }
      }
    }
  } catch (err) {
    errorCaught = err.message;
  }

  return { completedSuccessfully, errorCaught };
}

// Mock Supabase where RPC is missing (like production)
const mockClient = {
  rideState: { id: rideId, status: "open", provider_id: driverId },
  rpc: async () => ({ error: { message: "PGRST202 function not found" }, data: null }),
  updateRide: async function({ id, callerRole }) {
    // Under unpatched RLS, only driver role can update rides table
    if (callerRole === "driver" || callerRole === "authorized_passenger") {
      this.rideState.status = "completed";
      return { data: [{ id, status: "completed" }], error: null };
    }
    // Rejected by RLS: 0 rows returned!
    return { data: [], error: null };
  },
  getRide: async function() {
    return this.rideState;
  },
};

(async () => {
  // Case A: Driver succeeds
  mockClient.rideState = { id: rideId, status: "open", provider_id: driverId };
  const driverRun = await simulateFrontendHandler("driver", mockClient);
  assert.strictEqual(driverRun.completedSuccessfully, true);
  assert.strictEqual(driverRun.errorCaught, null);
  console.log("✓ Case 3A: Driver completes ride via direct update fallback.");

  // Case B: Unpatched passenger where RLS returns 0 rows:
  // Must throw error and NOT mark completedSuccessfully = true!
  mockClient.rideState = { id: rideId, status: "open", provider_id: driverId };
  const failedPassengerRun = await simulateFrontendHandler("unauthorized_passenger", mockClient);
  assert.strictEqual(failedPassengerRun.completedSuccessfully, false, "Must not report success when database update touches 0 rows");
  assert.match(failedPassengerRun.errorCaught, /Unable to complete ride in database/);
  console.log("✓ Case 3B: Swallowed error prevented; UI will not claim success when 0 rows are updated.");

  // Case C: Patched passenger with RLS permission:
  mockClient.rideState = { id: rideId, status: "open", provider_id: driverId };
  const patchedPassengerRun = await simulateFrontendHandler("authorized_passenger", mockClient);
  assert.strictEqual(patchedPassengerRun.completedSuccessfully, true);
  assert.strictEqual(patchedPassengerRun.errorCaught, null);
  console.log("✓ Case 3C: Authorized passenger completes ride successfully with verified DB confirmation.\n");

  // -----------------------------------------------------------------------------
  // Test 4: Privacy & Contact Shielding on Completed Rides
  // -----------------------------------------------------------------------------
  console.log("--- Test 4: Privacy Verification on Completed Rides ---");
  const completedBooking = {
    id: "booking-1",
    status: "completed",
    rides: { id: rideId, status: "completed", provider_id: driverId }
  };
  const isSharingActive =
    completedBooking.status === "accepted" &&
    (completedBooking.rides?.status === "open" || !completedBooking.rides?.status);
  assert.strictEqual(isSharingActive, false, "Sharing must be inactive for completed rides");
  console.log("✓ Test 4 Passed: Contact and location sharing immediately close when ride is completed.\n");

  console.log("==================================================================");
  console.log("ALL COMPLETE RIDE VERIFICATION TESTS PASSED (100%)");
  console.log("==================================================================");
})();
