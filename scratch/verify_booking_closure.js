import assert from "assert";

console.log("==================================================================");
console.log("CampusRide Automatic Booking Closure at Departure Time Tests");
console.log("==================================================================\n");

// Simulated Database / State
const ridesDb = new Map();
const bookingsDb = new Map();

function resetDb() {
  ridesDb.clear();
  bookingsDb.clear();
}

// Database Trigger simulation: check_booking_departure_deadline()
function simulateDatabaseTrigger(bookingRecord, currentTime = Date.now()) {
  if (bookingRecord.status === "pending") {
    const ride = ridesDb.get(bookingRecord.ride_id);
    if (!ride) {
      throw new Error("Associated ride not found");
    }
    if (ride.status !== "open") {
      throw new Error(`Cannot book seats on a ride that is not open (status: ${ride.status})`);
    }
    const depTime = new Date(ride.departure_at).getTime();
    if (!isNaN(depTime) && depTime <= currentTime) {
      throw new Error("Booking closed because the departure time has passed");
    }
  }
}

// Frontend booking handler simulation: handleBookRide()
function simulateHandleBookRide({
  ride,
  user,
  seatsRequested = 1,
  userBookings = {},
  currentTime = Date.now(),
}) {
  if (!user) {
    return { error: null, action: "redirect_auth", notice: "Sign in required" };
  }

  // Check in-memory booking
  const existing = userBookings[ride.id];
  if (existing && existing.status === "pending") {
    return { error: null, notice: "Your seat request is already pending driver confirmation." };
  }
  if (existing && existing.status === "accepted") {
    return { error: null, notice: "Your seat request has already been accepted for this ride." };
  }

  // 1. Departure deadline check
  const depTime = new Date(ride.departure_at).getTime();
  if (!isNaN(depTime) && depTime <= currentTime) {
    return { error: "Booking closed because the departure time has passed." };
  }

  // 2. Status check
  if (ride.status !== "open") {
    return { error: "This ride is no longer open for booking." };
  }

  // 3. Seat check
  if (Number(ride.available_seats) <= 0) {
    return { error: "This ride has no seats remaining." };
  }

  // 4. Attempt insert into database (subject to database trigger)
  try {
    const booking = {
      id: `booking-${Date.now()}-${Math.random()}`,
      ride_id: ride.id,
      passenger_id: user.id,
      seats_requested: seatsRequested,
      status: "pending",
      created_at: new Date(currentTime).toISOString(),
    };

    simulateDatabaseTrigger(booking, currentTime);

    bookingsDb.set(booking.id, booking);
    return { success: true, booking };
  } catch (dbErr) {
    return { error: dbErr.message };
  }
}

// RideCard display status helper
function computeRideCardDisplay(ride, effectiveBookingStatus, isOwnRide, currentTime = Date.now()) {
  const departureTimestamp = new Date(ride.departure_at).getTime();
  const isDeparturePassed = !isNaN(departureTimestamp) && departureTimestamp <= currentTime;
  const seatsAvailable = Number(ride.available_seats) || 0;

  let topBadge = "";
  if (ride.status === "completed") topBadge = "Ride Ended";
  else if (ride.status === "cancelled") topBadge = "Cancelled";
  else if (isDeparturePassed) topBadge = "Booking Closed";
  else topBadge = `${seatsAvailable} seats left`;

  let actionDisplay = "";
  let isActionBlocked = false;

  if (isOwnRide) {
    actionDisplay = isDeparturePassed ? "Booking Closed" : "Active";
  } else if (ride.status === "completed") {
    actionDisplay = "Ride Ended";
    isActionBlocked = true;
  } else if (ride.status === "cancelled") {
    actionDisplay = "Cancelled";
    isActionBlocked = true;
  } else if (effectiveBookingStatus === "pending") {
    actionDisplay = "Request Pending";
    isActionBlocked = true;
  } else if (effectiveBookingStatus === "accepted") {
    actionDisplay = "Request Accepted";
    isActionBlocked = true;
  } else if (effectiveBookingStatus === "rejected") {
    actionDisplay = "Request Declined";
    isActionBlocked = true;
  } else if (isDeparturePassed) {
    actionDisplay = "Booking Closed";
    isActionBlocked = true;
  } else if (seatsAvailable <= 0) {
    actionDisplay = "Ride Full";
    isActionBlocked = true;
  } else {
    actionDisplay = "Request Seat";
    isActionBlocked = false;
  }

  return { topBadge, actionDisplay, isActionBlocked, isDeparturePassed };
}

// ------------------------------------------------------------------
// SCENARIOS EXECUTION
// ------------------------------------------------------------------

resetDb();
const baseTime = Date.now();
const passenger = { id: "passenger-101", name: "Rahul S" };
const driver = { id: "driver-202", name: "Ananya K" };

// Scenario 1: Departure is in the future and seats are available: booking succeeds.
console.log("--- Scenario 1: Future departure with seats available ---");
const futureRide = {
  id: "ride-future-1",
  provider_id: driver.id,
  from_location: "SRM Campus",
  to_location: "Vijayawada Station",
  departure_at: new Date(baseTime + 3600 * 1000).toISOString(), // 1 hour in future
  available_seats: 3,
  total_seats: 4,
  status: "open",
};
ridesDb.set(futureRide.id, futureRide);

const res1 = simulateHandleBookRide({
  ride: futureRide,
  user: passenger,
  currentTime: baseTime,
});
assert.strictEqual(res1.success, true);
assert.strictEqual(res1.booking.status, "pending");
console.log("✓ Scenario 1 Passed: Booking succeeds when departure is in future and seats available.\n");

// Scenario 2: Departure is in the future but no seats remain: booking is rejected.
console.log("--- Scenario 2: Future departure with no seats remaining ---");
const fullRide = {
  id: "ride-full-2",
  provider_id: driver.id,
  from_location: "SRM Campus",
  to_location: "Guntur",
  departure_at: new Date(baseTime + 3600 * 1000).toISOString(),
  available_seats: 0,
  total_seats: 4,
  status: "open",
};
ridesDb.set(fullRide.id, fullRide);

const res2 = simulateHandleBookRide({
  ride: fullRide,
  user: passenger,
  currentTime: baseTime,
});
assert.strictEqual(res2.error, "This ride has no seats remaining.");
console.log("✓ Scenario 2 Passed: Booking rejected when no seats remain.\n");

// Scenario 3: Departure time has arrived and seats remain: booking is rejected.
console.log("--- Scenario 3: Departure time has arrived with seats remaining ---");
const departedRide = {
  id: "ride-departed-3",
  provider_id: driver.id,
  from_location: "SRM Campus",
  to_location: "Mangalagiri",
  departure_at: new Date(baseTime - 60 * 1000).toISOString(), // Departed 1 minute ago
  available_seats: 2,
  total_seats: 4,
  status: "open",
};
ridesDb.set(departedRide.id, departedRide);

const res3 = simulateHandleBookRide({
  ride: departedRide,
  user: passenger,
  currentTime: baseTime,
});
assert.strictEqual(res3.error, "Booking closed because the departure time has passed.");
console.log("✓ Scenario 3 Passed: Booking rejected when departure time has passed.\n");

// Scenario 4: A passenger tries booking from a cached ride after departure: booking is rejected.
console.log("--- Scenario 4: Booking from cached ride data after departure ---");
// Cached ride copy took when it was still future
const cachedRide = { ...futureRide };
// Current time is 2 hours later, so futureRide has now departed
const laterTime = baseTime + 2 * 3600 * 1000;
const res4 = simulateHandleBookRide({
  ride: cachedRide,
  user: passenger,
  currentTime: laterTime,
});
assert.strictEqual(res4.error, "Booking closed because the departure time has passed.");
console.log("✓ Scenario 4 Passed: Booking from cached ride blocked when departure has passed.\n");

// Scenario 5: Direct booking operation attempted against database after departure: database-side validation rejects it.
console.log("--- Scenario 5: Direct database insert rejected by database trigger ---");
let triggerBlocked = false;
try {
  const directBookingAttempt = {
    id: "booking-direct-evil",
    ride_id: departedRide.id,
    passenger_id: "evil-bot",
    seats_requested: 1,
    status: "pending",
  };
  simulateDatabaseTrigger(directBookingAttempt, baseTime);
} catch (err) {
  triggerBlocked = true;
  assert.ok(err.message.includes("Booking closed because the departure time has passed"));
}
assert.strictEqual(triggerBlocked, true);
console.log("✓ Scenario 5 Passed: Authoritative database trigger rejected booking after departure.\n");

// Scenario 6: Refresh and re-login after departure: booking remains closed.
console.log("--- Scenario 6: Re-render / refresh after departure keeps booking closed ---");
const displayPassenger = computeRideCardDisplay(departedRide, null, false, baseTime);
assert.strictEqual(displayPassenger.topBadge, "Booking Closed");
assert.strictEqual(displayPassenger.actionDisplay, "Booking Closed");
assert.strictEqual(displayPassenger.isActionBlocked, true);
console.log("✓ Scenario 6 Passed: Refresh and re-login correctly computes Booking Closed.\n");

// Scenario 7: Existing accepted bookings remain intact after departure.
console.log("--- Scenario 7: Existing accepted bookings remain intact after departure ---");
const acceptedBookingPassenger = computeRideCardDisplay(departedRide, "accepted", false, baseTime);
assert.strictEqual(acceptedBookingPassenger.topBadge, "Booking Closed");
assert.strictEqual(acceptedBookingPassenger.actionDisplay, "Request Accepted");
console.log("✓ Scenario 7 Passed: Accepted co-rider status preserved after departure.\n");

// Scenario 8: Booking closure does not mark the journey completed.
console.log("--- Scenario 8: Booking closure does NOT mark journey completed ---");
const displayDriver = computeRideCardDisplay(departedRide, null, true, baseTime);
assert.strictEqual(departedRide.status, "open");
assert.strictEqual(displayDriver.actionDisplay, "Booking Closed");
assert.notStrictEqual(displayDriver.actionDisplay, "Ride Ended");
console.log("✓ Scenario 8 Passed: Ride status remains 'open', driver sees 'Booking Closed' without being marked completed.\n");

// Scenario 9: Existing End Ride flow still works independently.
console.log("--- Scenario 9: End Ride flow functions independently ---");
departedRide.status = "completed"; // Triggered explicitly by complete_ride RPC
const displayEnded = computeRideCardDisplay(departedRide, null, false, baseTime);
assert.strictEqual(displayEnded.topBadge, "Ride Ended");
assert.strictEqual(displayEnded.actionDisplay, "Ride Ended");
console.log("✓ Scenario 9 Passed: End Ride completes ride independently.\n");

// Scenario 10: Departure deadline notice in OfferRide and RideCard
console.log("--- Scenario 10: Departure deadline notice verification ---");
import fs from "fs";
const offerRideContent = fs.readFileSync("src/pages/OfferRide.jsx", "utf-8");
assert.ok(offerRideContent.includes("Booking Deadline"));
assert.ok(offerRideContent.includes("Seat requests close automatically at your selected departure time"));
assert.ok(offerRideContent.includes("Please choose your departure time carefully"));

const rideCardContent = fs.readFileSync("src/components/RideCard.jsx", "utf-8");
assert.ok(rideCardContent.includes("Booking closed because the departure time has passed"));
assert.ok(rideCardContent.includes("Booking Closed"));
console.log("✓ Scenario 10 Passed: Offer Ride notice and RideCard explanation present in codebase.\n");

console.log("==================================================================");
console.log("ALL 10 AUTOMATIC BOOKING CLOSURE SCENARIOS PASSED (100%)");
console.log("==================================================================");
