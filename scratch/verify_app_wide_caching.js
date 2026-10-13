import assert from "assert";

// Mock localStorage and window
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
    clear: () => {
      Object.keys(storage).forEach((k) => delete storage[k]);
    },
  },
};
globalThis.localStorage = globalThis.window.localStorage;

import {
  getCachedUserTrips,
  cacheUserTrips,
  clearUserTripsCache,
  sanitizeCachedRide,
  sanitizeCachedBooking,
} from "../src/lib/tripsCache.js";

import {
  getCachedPublicRides,
  cachePublicRides,
  sanitizePublicRide,
} from "../src/lib/ridesCache.js";

import {
  getCachedUserProfile,
  cacheUserProfile,
  mergeProfileWithCache,
} from "../src/lib/profileCache.js";

import {
  getCachedUserBookings,
  cacheUserBookings,
  clearUserBookingsCache,
} from "../src/lib/bookingsCache.js";

import { isImageCached, preloadImage } from "../src/lib/imageCache.js";

console.log("==================================================================");
console.log("CampusRide App-Wide Smart Caching and Smooth Updates Verification");
console.log("==================================================================\n");

// --- TEST 1: User Trips Caching and Instant Hydration ---
console.log("--- Test 1: User Trips Caching and Instant Hydration ---");
const userA = "student-uuid-user-a";
const userB = "student-uuid-user-b";

const mockOfferedRides = [
  {
    id: "ride-101",
    provider_id: userA,
    from_location: "SRM AP Campus",
    to_location: "Vijayawada Junction",
    departure_at: new Date(Date.now() + 3600000).toISOString(),
    vehicle_type: "Car",
    available_seats: 3,
    total_seats: 4,
    cost_per_seat: 40,
    status: "open",
  },
];

const mockIncomingBookings = [
  {
    id: "booking-201",
    ride_id: "ride-101",
    passenger_id: "passenger-999",
    seats_requested: 2,
    status: "pending",
    passenger_name: "Rahul Verma",
    // Sensitive detail that must NOT be persisted in localStorage
    passenger_profile: { mobile_number: "9876543210", registration_number: "AP21110010001" },
  },
];

const mockMyBookings = [
  {
    id: "booking-301",
    ride_id: "ride-505",
    passenger_id: userA,
    seats_requested: 1,
    status: "accepted",
    driver_name: "Priya Sharma",
    rides: {
      id: "ride-505",
      from_location: "Guntur",
      to_location: "SRM AP Campus",
      departure_at: new Date(Date.now() + 7200000).toISOString(),
      vehicle_type: "Car",
    },
    // Sensitive driver phone number that must NOT be persisted in localStorage
    driver_profile: { mobile_number: "9123456780", registration_number: "AP21110010999" },
  },
];

// Save trips for User A
cacheUserTrips(userA, {
  myRides: mockOfferedRides,
  incomingBookings: mockIncomingBookings,
  myBookings: mockMyBookings,
});

// Hydrate trips for User A
const hydratedA = getCachedUserTrips(userA);
assert.strictEqual(hydratedA.myRides.length, 1, "User A should have 1 cached offered ride");
assert.strictEqual(hydratedA.incomingBookings.length, 1, "User A should have 1 cached incoming request");
assert.strictEqual(hydratedA.myBookings.length, 1, "User A should have 1 cached outgoing booking");
console.log("✓ Test 1 Passed: User trips hydrate synchronously on first render.");

// --- TEST 2: Privacy Verification (Exclusion of Sensitive Contact Data) ---
console.log("\n--- Test 2: Privacy Verification in Trips Cache ---");
const rawStoredA = JSON.parse(storage[`campusride_user_trips_${userA}`]);
assert.strictEqual(rawStoredA.incomingBookings[0].passenger_profile, null, "Sensitive passenger profile must be null in cache");
assert.strictEqual(rawStoredA.myBookings[0].driver_profile, null, "Sensitive driver profile must be null in cache");
assert.ok(!JSON.stringify(rawStoredA).includes("9876543210"), "Phone number must never be persisted in localStorage");
assert.ok(!JSON.stringify(rawStoredA).includes("9123456780"), "Driver phone number must never be persisted in localStorage");
console.log("✓ Test 2 Passed: Sensitive phone numbers and registration numbers are excluded from persistent storage.");

// --- TEST 3: Strict Account Isolation ---
console.log("\n--- Test 3: Account Isolation on Sign In / Switch Account ---");
const hydratedB = getCachedUserTrips(userB);
assert.strictEqual(hydratedB.myRides.length, 0, "User B must not see User A's offered rides");
assert.strictEqual(hydratedB.incomingBookings.length, 0, "User B must not see User A's incoming requests");
assert.strictEqual(hydratedB.myBookings.length, 0, "User B must not see User A's bookings");

// Hydrate guest (null user)
const hydratedGuest = getCachedUserTrips(null);
assert.strictEqual(hydratedGuest.myRides.length, 0, "Guest must have empty trips");
console.log("✓ Test 3 Passed: Caches are partitioned strictly by user ID without cross-account leakage.");

// --- TEST 4: Logout Cache Invalidation ---
console.log("\n--- Test 4: Cache Invalidation on Logout ---");
clearUserTripsCache(userA);
clearUserBookingsCache(userA);
const postLogoutTrips = getCachedUserTrips(userA);
const postLogoutBookings = getCachedUserBookings(userA);
assert.strictEqual(postLogoutTrips.myRides.length, 0, "Post-logout trips cache must be empty");
assert.strictEqual(Object.keys(postLogoutBookings).length, 0, "Post-logout bookings cache must be empty");
console.log("✓ Test 4 Passed: Logout cleanly wipes user-scoped persistent caches.");

// --- TEST 5: Public Rides Departure Deadline Enforcement in Cache ---
console.log("\n--- Test 5: Departure Deadline Enforcement in Public Rides Cache ---");
const futureRide = {
  id: "ride-future",
  from_location: "Campus",
  to_location: "Vijayawada",
  departure_at: new Date(Date.now() + 1800000).toISOString(), // 30 mins in future
  available_seats: 2,
  status: "open",
};
const expiredRide = {
  id: "ride-past",
  from_location: "Campus",
  to_location: "Guntur",
  departure_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  available_seats: 3,
  status: "open",
};

cachePublicRides([futureRide, expiredRide]);
const publicCache = getCachedPublicRides();
assert.strictEqual(publicCache.length, 1, "Cached public rides must filter out expired rides");
assert.strictEqual(publicCache[0].id, "ride-future", "Only active future ride should be returned");
console.log("✓ Test 5 Passed: Expired rides are never returned as active bookable rides from cache.");

// --- TEST 6: Profile Cache & Identity Protection ---
console.log("\n--- Test 6: Profile Cache & Identity Protection ---");
cacheUserProfile(userA, {
  id: userA,
  full_name: "Chandu Mutcherla",
  registration_number: "AP21110010045",
  mobile_number: "9988776655",
  profile_completed: true,
});

const profileA = getCachedUserProfile(userA);
assert.strictEqual(profileA.full_name, "Chandu Mutcherla", "Profile full_name restored correctly");
assert.strictEqual(profileA.registration_number, "AP21110010045", "Reg number restored correctly");

// Invalid identity should never overwrite valid cache
const invalidResult = mergeProfileWithCache(userA, { full_name: "SRM Student" });
assert.strictEqual(invalidResult.full_name, "Chandu Mutcherla", "Temporary fallback 'SRM Student' must not overwrite valid cached name");
console.log("✓ Test 6 Passed: Profile cache preserves valid student identity and rejects placeholder overrides.");

// --- TEST 7: Image Cache & Smooth Loading ---
console.log("\n--- Test 7: Image Cache & In-Memory Preload Tracking ---");
assert.strictEqual(isImageCached("data:image/webp;base64,mock"), true, "Data URIs are immediately recognized as cached");
assert.strictEqual(isImageCached("https://example.com/photo.jpg"), false, "Uncached external URL correctly recognized as not cached");
console.log("✓ Test 7 Passed: Image cache correctly tracks cached vs uncached asset states.");

console.log("\n==================================================================");
console.log("ALL APP-WIDE CACHING & SMOOTH DATA UPDATE TESTS PASSED (100%)");
console.log("==================================================================");
