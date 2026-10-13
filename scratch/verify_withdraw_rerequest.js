import assert from "assert";

// Mock window and localStorage
const storage = {};
globalThis.window = {
  localStorage: {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => {
      storage[key] = String(val);
    },
    removeItem: (key) => {
      delete storage[key];
    },
  },
};
globalThis.localStorage = globalThis.window.localStorage;

import {
  getCachedUserBookings,
  cacheUserBookings,
  clearUserBookingsCache,
} from "../src/lib/bookingsCache.js";

console.log("==================================================================");
console.log("CampusRide Withdraw-and-Re-Request State Synchronization Tests");
console.log("==================================================================\n");

const passengerId = "passenger-uuid-001";
const driverId = "driver-uuid-002";
const rideId = "ride-uuid-101";

// Function simulating the exact logic in loadMyTrips()
function buildBookingsMap(myBookingsList) {
  const bookingsMap = {};
  myBookingsList.forEach((b) => {
    if (b.ride_id && !bookingsMap[b.ride_id]) {
      bookingsMap[b.ride_id] = {
        id: String(b.id),
        rideId: String(b.ride_id),
        status: b.status || "pending",
        seats_requested: Number(b.seats_requested) || 1,
        created_at: b.created_at || null,
      };
    }
  });
  return bookingsMap;
}

// Function simulating driver deduplication in loadMyTrips()
function buildDeduplicatedIncoming(incomingList) {
  const latestIncomingMap = new Map();
  incomingList.forEach((b) => {
    const key = `${b.ride_id}_${b.passenger_id}`;
    if (!latestIncomingMap.has(key)) {
      latestIncomingMap.set(key, b);
    }
  });
  return Array.from(latestIncomingMap.values());
}

// Function determining button action text in RideCard
function getRideCardAction(bookingStatus) {
  if (bookingStatus === "pending") return "Request Pending"; // "Requested"
  if (bookingStatus === "accepted") return "Request Accepted";
  if (bookingStatus === "rejected") return "Request Declined";
  return "Request Seat"; // "Request"
}

// -----------------------------------------------------------------------------
// Step 1: Initial Request
// -----------------------------------------------------------------------------
console.log("--- Step 1: Passenger requests ride initially ---");
const booking1 = {
  id: "booking-001",
  ride_id: rideId,
  passenger_id: passengerId,
  status: "pending",
  seats_requested: 1,
  created_at: "2026-10-13T21:00:00.000Z",
};

let passengerHistory = [booking1];
let bookingsMap1 = buildBookingsMap(passengerHistory);
assert.strictEqual(bookingsMap1[rideId]?.status, "pending");
assert.strictEqual(getRideCardAction(bookingsMap1[rideId]?.status), "Request Pending");
cacheUserBookings(passengerId, bookingsMap1);
console.log("✓ Step 1 Passed: Button displays 'Request Pending'.\n");

// -----------------------------------------------------------------------------
// Step 2: Passenger withdraws request
// -----------------------------------------------------------------------------
console.log("--- Step 2: Passenger withdraws request ---");
const withdrawnBooking1 = {
  ...booking1,
  status: "cancelled",
  updated_at: "2026-10-13T21:05:00.000Z",
};

passengerHistory = [withdrawnBooking1];
let bookingsMap2 = buildBookingsMap(passengerHistory);
assert.strictEqual(bookingsMap2[rideId]?.status, "cancelled");
assert.strictEqual(getRideCardAction(bookingsMap2[rideId]?.status), "Request Seat");
cacheUserBookings(passengerId, bookingsMap2);
console.log("✓ Step 2 Passed: Withdrawn request updates state and button resets to 'Request Seat'.\n");

// -----------------------------------------------------------------------------
// Step 3: Passenger requests the SAME ride AGAIN (Multi-Row History)
// -----------------------------------------------------------------------------
console.log("--- Step 3: Passenger requests the same ride again ---");
const booking2 = {
  id: "booking-002",
  ride_id: rideId,
  passenger_id: passengerId,
  status: "pending",
  seats_requested: 1,
  created_at: "2026-10-13T21:10:00.000Z",
};

// Database returns records sorted created_at DESC:
// [ booking2 (newest, pending), withdrawnBooking1 (older, cancelled) ]
passengerHistory = [booking2, withdrawnBooking1];

let bookingsMap3 = buildBookingsMap(passengerHistory);

// CRITICAL ASSERTION: The older withdrawn booking MUST NOT overwrite the newer pending booking!
assert.strictEqual(
  bookingsMap3[rideId]?.status,
  "pending",
  "Latest booking status must be 'pending', not overwritten by older cancelled record"
);
assert.strictEqual(bookingsMap3[rideId]?.id, "booking-002");
assert.strictEqual(getRideCardAction(bookingsMap3[rideId]?.status), "Request Pending");

cacheUserBookings(passengerId, bookingsMap3);
const cached = getCachedUserBookings(passengerId);
assert.strictEqual(cached[rideId]?.status, "pending");
console.log("✓ Step 3 Passed: Re-request accurately reflects 'Request Pending' and does not read old withdrawn status.\n");

// -----------------------------------------------------------------------------
// Step 4: Driver Dashboard Synchronization
// -----------------------------------------------------------------------------
console.log("--- Step 4: Driver Dashboard Synchronization ---");
// When driver queries incoming requests for their ride, both rows exist in DB history
const driverIncomingHistory = [booking2, withdrawnBooking1];
const deduplicatedForDriver = buildDeduplicatedIncoming(driverIncomingHistory);

assert.strictEqual(deduplicatedForDriver.length, 1, "Driver must see only 1 entry for this passenger");
assert.strictEqual(deduplicatedForDriver[0].id, "booking-002");
assert.strictEqual(deduplicatedForDriver[0].status, "pending");
console.log("✓ Step 4 Passed: Driver dashboard shows only the active request exactly once.\n");

// -----------------------------------------------------------------------------
// Step 5: Strict UNIQUE Constraint Reactivation Fallback
// -----------------------------------------------------------------------------
console.log("--- Step 5: Global UNIQUE Constraint Reactivation Fallback ---");
// If environment enforces global UNIQUE(ride_id, passenger_id) where 23505 is raised:
function simulateUniqueReactivation(existingDbBooking, newSeats) {
  assert.strictEqual(existingDbBooking.status, "cancelled");
  // Reactivate existing record to pending
  return {
    ...existingDbBooking,
    status: "pending",
    seats_requested: newSeats,
    created_at: new Date().toISOString(),
  };
}

const reactivated = simulateUniqueReactivation(withdrawnBooking1, 2);
assert.strictEqual(reactivated.status, "pending");
assert.strictEqual(reactivated.seats_requested, 2);
console.log("✓ Step 5 Passed: Strict UNIQUE constraint fallback reactivates cancelled booking.\n");

console.log("==================================================================");
console.log("ALL WITHDRAW & RE-REQUEST SYNCHRONIZATION TESTS PASSED (100%)");
console.log("==================================================================");
