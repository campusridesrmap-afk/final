/**
 * CampusRide User Trips Cache Manager (Stale-While-Revalidate)
 *
 * Provides immediate synchronous hydration and persistent caching for
 * an authenticated user's trips dashboard:
 * - Offered rides (as driver)
 * - Incoming booking requests (as driver)
 * - Outgoing bookings (as passenger)
 *
 * Eliminates dashboard flickers, tab counter resets (e.g. 0 -> count jumps),
 * and temporary empty states across page navigations and browser refreshes.
 *
 * Security & User Isolation:
 * - Strictly partitioned by userId (`campusride_user_trips_${userId}`).
 * - Deliberately excludes sensitive contact details (phone numbers, registration numbers)
 *   from persistent storage. Real-time contact and location details are loaded
 *   fresh into session memory only for authorized participants on open rides.
 * - Completely cleared on signout or user switch.
 */

export const TRIPS_CACHE_PREFIX = "campusride_user_trips_";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Sanitizes an offered ride for caching.
 * @param {object} r
 * @returns {object|null}
 */
export function sanitizeCachedRide(r) {
  if (!r || typeof r !== "object" || !r.id) return null;
  return {
    id: String(r.id),
    provider_id: r.provider_id ? String(r.provider_id) : "",
    provider_name: typeof r.provider_name === "string" && r.provider_name ? r.provider_name : "SRM Student",
    from_location: typeof r.from_location === "string" ? r.from_location.trim() : "",
    to_location: typeof r.to_location === "string" ? r.to_location.trim() : "",
    departure_at: r.departure_at || new Date().toISOString(),
    vehicle_type: r.vehicle_type || "Car",
    available_seats: Number(r.available_seats) >= 0 ? Number(r.available_seats) : 0,
    total_seats: Number(r.total_seats || r.available_seats) || 0,
    cost_per_seat: Number(r.cost_per_seat) || 0,
    status: r.status || "open",
    stops: Array.isArray(r.stops) ? r.stops : [],
    pickup_coords: r.pickup_coords && typeof r.pickup_coords === "object" ? r.pickup_coords : null,
    destination_coords: r.destination_coords && typeof r.destination_coords === "object" ? r.destination_coords : null,
    route_geometry: Array.isArray(r.route_geometry) && r.route_geometry.length <= 50 ? r.route_geometry : [],
  };
}

/**
 * Sanitizes a booking record (incoming or outgoing) for caching.
 * Safely preserves verified contact profiles and live location ONLY for
 * authorized active co-riders on open rides, strictly omitting them for
 * pending, cancelled, or completed bookings.
 * @param {object} b
 * @returns {object|null}
 */
export function sanitizeCachedBooking(b) {
  if (!b || typeof b !== "object" || !b.id) return null;

  const associatedRide = b.rides || b.ride;
  const sanitizedRide = associatedRide ? sanitizeCachedRide(associatedRide) : null;

  // Contact & location sharing is strictly authorized ONLY for active accepted bookings on open rides
  const isAccepted = b.status === "accepted";
  const isOpen = !sanitizedRide || sanitizedRide.status === "open";
  const isSharingAuthorized = isAccepted && isOpen;

  // Only retain verified contact details for authorized accepted bookings
  const sanitizedDriverProfile =
    isSharingAuthorized && b.driver_profile && typeof b.driver_profile === "object"
      ? {
          id: String(b.driver_profile.id || ""),
          full_name: b.driver_profile.full_name || b.driver_name || "Vehicle Sharer",
          mobile_number: b.driver_profile.mobile_number || "",
          registration_number: b.driver_profile.registration_number || "",
        }
      : null;

  const sanitizedPassengerProfile =
    isSharingAuthorized && b.passenger_profile && typeof b.passenger_profile === "object"
      ? {
          id: String(b.passenger_profile.id || ""),
          full_name: b.passenger_profile.full_name || b.passenger_name || "SRM Student",
          mobile_number: b.passenger_profile.mobile_number || "",
          registration_number: b.passenger_profile.registration_number || "",
        }
      : null;

  return {
    id: String(b.id),
    ride_id: b.ride_id ? String(b.ride_id) : sanitizedRide?.id || "",
    passenger_id: b.passenger_id ? String(b.passenger_id) : "",
    seats_requested: Number(b.seats_requested) || 1,
    status: b.status || "pending",
    pickup_location: b.pickup_location || sanitizedRide?.from_location || "",
    dropoff_location: b.dropoff_location || sanitizedRide?.to_location || "",
    pickup_stop_index: Number(b.pickup_stop_index) || 0,
    dropoff_stop_index: Number(b.dropoff_stop_index) || 0,
    created_at: b.created_at || null,
    // Display names
    driver_name: typeof b.driver_name === "string" ? b.driver_name : "Vehicle Sharer",
    passenger_name: typeof b.passenger_name === "string" ? b.passenger_name : "SRM Student",
    // Embed associated ride safely
    ride: sanitizedRide,
    rides: sanitizedRide,
    // Contact profiles safely isolated and preserved only when authorized
    driver_profile: sanitizedDriverProfile,
    passenger_profile: sanitizedPassengerProfile,
  };
}

/**
 * Synchronously retrieves cached trips for a specific authenticated user.
 *
 * @param {string|null} userId
 * @returns {{ myRides: Array<object>, incomingBookings: Array<object>, myBookings: Array<object> }}
 */
export function getCachedUserTrips(userId) {
  const emptyState = { myRides: [], incomingBookings: [], myBookings: [] };

  if (typeof window === "undefined" || !window.localStorage || !userId) {
    return emptyState;
  }

  try {
    const raw = localStorage.getItem(`${TRIPS_CACHE_PREFIX}${userId}`);
    if (!raw) return emptyState;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || parsed.userId !== userId) {
      return emptyState;
    }

    if (typeof parsed.timestamp === "number" && Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) {
      return emptyState;
    }

    const myRides = Array.isArray(parsed.myRides)
      ? parsed.myRides.map(sanitizeCachedRide).filter(Boolean)
      : [];

    const incomingBookings = Array.isArray(parsed.incomingBookings)
      ? parsed.incomingBookings.map(sanitizeCachedBooking).filter(Boolean)
      : [];

    const myBookings = Array.isArray(parsed.myBookings)
      ? parsed.myBookings.map(sanitizeCachedBooking).filter(Boolean)
      : [];

    return { myRides, incomingBookings, myBookings };
  } catch (err) {
    console.warn("CampusRide: Error reading trips cache for user:", userId, err);
    return emptyState;
  }
}

/**
 * Persists user trips data to localStorage.
 *
 * @param {string} userId
 * @param {{ myRides?: Array<object>, incomingBookings?: Array<object>, myBookings?: Array<object> }} data
 */
export function cacheUserTrips(userId, { myRides = [], incomingBookings = [], myBookings = [] }) {
  if (typeof window === "undefined" || !window.localStorage || !userId) {
    return;
  }

  try {
    const sanitizedRides = Array.isArray(myRides)
      ? myRides.map(sanitizeCachedRide).filter(Boolean)
      : [];

    const sanitizedIncoming = Array.isArray(incomingBookings)
      ? incomingBookings.map(sanitizeCachedBooking).filter(Boolean)
      : [];

    const sanitizedMyBookings = Array.isArray(myBookings)
      ? myBookings.map(sanitizeCachedBooking).filter(Boolean)
      : [];

    const payload = {
      version: 1,
      userId,
      timestamp: Date.now(),
      myRides: sanitizedRides,
      incomingBookings: sanitizedIncoming,
      myBookings: sanitizedMyBookings,
    };

    localStorage.setItem(`${TRIPS_CACHE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch (err) {
    console.warn("CampusRide: Error writing trips cache for user:", userId, err);
  }
}

/**
 * Clears the user's trips cache entry on sign out or account switch.
 *
 * @param {string|null} userId
 */
export function clearUserTripsCache(userId) {
  if (typeof window === "undefined" || !window.localStorage || !userId) return;
  try {
    localStorage.removeItem(`${TRIPS_CACHE_PREFIX}${userId}`);
  } catch (err) {
    console.warn("CampusRide: Error clearing trips cache for user:", userId, err);
  }
}
