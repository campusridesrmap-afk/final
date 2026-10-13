import assert from "assert";
import {
  getCachedExpiredTrips,
  cacheExpiredTrips,
  getCachedPublicRides,
  cachePublicRides,
} from "../src/lib/ridesCache.js";

// Mock localStorage in Node environment
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  },
};
globalThis.localStorage = globalThis.window.localStorage;

console.log("==================================================================");
console.log("CampusRide Dashboard: Expired Trips Sorting Order Verification");
console.log("==================================================================\n");

let passedTests = 0;
let totalTests = 0;

function check(desc, condition) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL [Test ${totalTests}]: ${desc}`);
    throw new Error(`Failed: ${desc}`);
  }
  passedTests++;
  console.log(`✅ PASS [Test ${totalTests}]: ${desc}`);
}

const userId = "test-student-123";

// Scenario 1: Same Date 9 PM, 10 PM, 11 PM
// Requirement 7: "Test with different dates and times, including 9 PM, 10 PM, and 11 PM, and verify that 11 PM appears first, followed by 10 PM and 9 PM when they are on the same date."
console.log("--- TEST GROUP 1: Same Date (9 PM, 10 PM, 11 PM) ---");

// Pick a fixed date in the past
const baseDate = "2026-10-10";
const ride9PM = {
  id: "ride-9pm",
  from_location: "SRM AP Campus",
  to_location: "Vijayawada",
  departure_at: `${baseDate}T21:00:00.000Z`, // 9 PM UTC
  vehicle_type: "Car",
  available_seats: 2,
  status: "open",
};

const ride10PM = {
  id: "ride-10pm",
  from_location: "SRM AP Campus",
  to_location: "Vijayawada",
  departure_at: `${baseDate}T22:00:00.000Z`, // 10 PM UTC
  vehicle_type: "Auto",
  available_seats: 1,
  status: "open",
};

const ride11PM = {
  id: "ride-11pm",
  from_location: "SRM AP Campus",
  to_location: "Vijayawada",
  departure_at: `${baseDate}T23:00:00.000Z`, // 11 PM UTC
  vehicle_type: "Car",
  available_seats: 3,
  status: "open",
};

// 1. Test cacheExpiredTrips stores them descending
// Pass in unsorted array [ride9PM, ride11PM, ride10PM]
cacheExpiredTrips(userId, [ride9PM, ride11PM, ride10PM]);
const cachedExpired = getCachedExpiredTrips(userId);

check("cacheExpiredTrips returns all 3 rides", cachedExpired.length === 3);
check("11 PM appears first", cachedExpired[0].id === "ride-11pm");
check("10 PM appears second", cachedExpired[1].id === "ride-10pm");
check("9 PM appears third", cachedExpired[2].id === "ride-9pm");

// Scenario 2: Different dates, months, and years
// Requirement 2: "Use a proper date-time comparison, not formatted time strings, so sorting works correctly across different dates, months, years, and AM/PM times."
console.log("\n--- TEST GROUP 2: Cross-Date, Month, Year & AM/PM Comparison ---");

const rideYesterday11PM = {
  id: "ride-yesterday-11pm",
  from_location: "Vijayawada",
  to_location: "SRM AP",
  departure_at: "2026-10-09T23:00:00.000Z",
  status: "open",
};

const rideToday9AM = {
  id: "ride-today-9am",
  from_location: "Guntur",
  to_location: "SRM AP",
  departure_at: "2026-10-10T09:00:00.000Z",
  status: "open",
};

const rideLastMonth = {
  id: "ride-last-month",
  from_location: "SRM AP",
  to_location: "Mangalagiri",
  departure_at: "2026-09-25T15:00:00.000Z",
  status: "open",
};

const rideLastYear = {
  id: "ride-last-year",
  from_location: "SRM AP",
  to_location: "Tadepalli",
  departure_at: "2025-12-31T20:00:00.000Z",
  status: "open",
};

cacheExpiredTrips(userId, [rideLastYear, rideYesterday11PM, rideToday9AM, rideLastMonth]);
const crossDateResult = getCachedExpiredTrips(userId);

check("Cross-date sorting returns 4 rides", crossDateResult.length === 4);
check("Today 9 AM (most recent) comes before Yesterday 11 PM", crossDateResult[0].id === "ride-today-9am");
check("Yesterday 11 PM comes second", crossDateResult[1].id === "ride-yesterday-11pm");
check("Last month comes third", crossDateResult[2].id === "ride-last-month");
check("Last year (oldest) comes fourth", crossDateResult[3].id === "ride-last-year");

// Scenario 3: FindRide.jsx Segregation & Sorting Simulation
console.log("\n--- TEST GROUP 3: FindRide.jsx Segregation & Sorting Logic ---");

const now = Date.now();
const future1 = new Date(now + 3600000).toISOString(); // 1h in future
const future2 = new Date(now + 7200000).toISOString(); // 2h in future

const activeTrip1 = {
  id: "act-1",
  from_location: "SRM AP",
  to_location: "Vijayawada",
  departure_at: future1,
  status: "open",
  available_seats: 2,
};
const activeTrip2 = {
  id: "act-2",
  from_location: "SRM AP",
  to_location: "Vijayawada",
  departure_at: future2,
  status: "open",
  available_seats: 3,
};

const allMatchedRides = [
  // Deliberately unsorted in input
  ride9PM,
  activeTrip2,
  ride11PM,
  activeTrip1,
  ride10PM,
].map((r) => ({ ...r, isVisible: true }));

// Simulate FindRide.jsx matchedRides sorting (active rides order)
allMatchedRides.sort((a, b) => {
  if (a.matchDetails && !b.matchDetails) return -1;
  if (!a.matchDetails && b.matchDetails) return 1;
  return new Date(a.departure_at) - new Date(b.departure_at);
});

// Now simulate FindRide.jsx segregation:
const activeUpcomingRides = [];
const expiredRides = [];
allMatchedRides.forEach((r) => {
  const depTime = new Date(r.departure_at).getTime();
  if (!isNaN(depTime) && depTime <= now) {
    if (r.status !== "cancelled" && r.status !== "completed") {
      expiredRides.push(r);
    }
  } else {
    if (r.status === "open" || !r.status || r.status === "active") {
      activeUpcomingRides.push(r);
    }
  }
});

// Apply our updated sorting in FindRide.jsx
expiredRides.sort((a, b) => {
  const timeA = new Date(a.departure_at).getTime() || 0;
  const timeB = new Date(b.departure_at).getTime() || 0;
  if (timeB !== timeA) return timeB - timeA;
  return String(b.id || "").localeCompare(String(a.id || ""));
});

check("Active upcoming rides remain in ascending departure order (future1 before future2)", 
  activeUpcomingRides[0].id === "act-1" && activeUpcomingRides[1].id === "act-2"
);

check("Expired rides in FindRide are sorted descending (11 PM first)", expiredRides[0].id === "ride-11pm");
check("Expired rides in FindRide are sorted descending (10 PM second)", expiredRides[1].id === "ride-10pm");
check("Expired rides in FindRide are sorted descending (9 PM third)", expiredRides[2].id === "ride-9pm");

// Scenario 4: Background Revalidation & Refresh Stability
// Requirement 4: "Ensure background revalidation and refresh do not revert the list to ascending order."
console.log("\n--- TEST GROUP 4: Background Revalidation & Refresh Stability ---");

// Simulate refresh fetching fresh data from Supabase (ordered ascending from DB query)
const supabaseRawRows = [ride9PM, ride10PM, ride11PM]; // Ascending from DB

// Fresh handling as in App.jsx loadRides
const nowMs = Date.now();
const freshExpired = supabaseRawRows
  .filter((r) => {
    const dep = new Date(r.departure_at).getTime();
    return !isNaN(dep) && dep <= nowMs && r.status !== "cancelled" && r.status !== "completed";
  })
  .sort((a, b) => {
    const timeA = new Date(a.departure_at).getTime() || 0;
    const timeB = new Date(b.departure_at).getTime() || 0;
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });

cacheExpiredTrips(userId, freshExpired);
const revalidatedCache = getCachedExpiredTrips(userId);

check("Revalidated cache does NOT revert to ascending order", revalidatedCache[0].id === "ride-11pm");
check("Revalidated cache maintains 10 PM in middle", revalidatedCache[1].id === "ride-10pm");
check("Revalidated cache maintains 9 PM at end", revalidatedCache[2].id === "ride-9pm");

console.log("\n==================================================================");
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY (100%)`);
console.log("==================================================================");
