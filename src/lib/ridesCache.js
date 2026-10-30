/**
 * CampusRide Public Rides Cache Manager (Stale-While-Revalidate)
 *
 * Provides immediate synchronous hydration and persistent caching for
 * public active rides to eliminate dashboard flicker and count resets to 0
 * across page refreshes.
 *
 * Security & Privacy:
 * Stores only public ride display attributes (routes, vehicle type, seats, price, driver name).
 * NEVER caches authentication tokens, private profiles, phone numbers, or booking records.
 */

export const RIDES_CACHE_KEY = "campusride_public_rides_v1";

// Cache freshness window: consider entries within 24 hours as valid candidates
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Expiration threshold for individual rides: filter out rides that departed more than 2 hours ago
const PAST_RIDE_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Strips any sensitive or extraneous data, retaining strictly the fields
 * needed to render public ride cards and calculate search/route matching.
 *
 * @param {object} rawRide
 * @returns {object|null}
 */
export function sanitizePublicRide(rawRide) {
  if (!rawRide || typeof rawRide !== "object" || !rawRide.id) return null;

  // Basic required fields
  const fromLocation = typeof rawRide.from_location === "string" ? rawRide.from_location.trim() : "";
  const toLocation = typeof rawRide.to_location === "string" ? rawRide.to_location.trim() : "";
  if (!fromLocation || !toLocation) return null;

  return {
    id: String(rawRide.id),
    provider_id: rawRide.provider_id ? String(rawRide.provider_id) : "",
    provider_name: typeof rawRide.provider_name === "string" && rawRide.provider_name.trim()
      ? rawRide.provider_name.trim()
      : "SRM Student",
    provider_gender: rawRide.provider_gender ? String(rawRide.provider_gender).trim() : null,
    from_location: fromLocation,
    to_location: toLocation,
    departure_at: rawRide.departure_at || new Date().toISOString(),
    vehicle_type: rawRide.vehicle_type || "Car",
    available_seats: Number(rawRide.available_seats) >= 0 ? Number(rawRide.available_seats) : 0,
    total_seats: Number(rawRide.total_seats || rawRide.available_seats) || 0,
    cost_per_seat: Number(rawRide.cost_per_seat) || 0,
    status: rawRide.status || "open",
    stops: Array.isArray(rawRide.stops) ? rawRide.stops : [],
    pickup_coords: rawRide.pickup_coords && typeof rawRide.pickup_coords === "object"
      ? { lat: Number(rawRide.pickup_coords.lat), lng: Number(rawRide.pickup_coords.lng) }
      : null,
    destination_coords: rawRide.destination_coords && typeof rawRide.destination_coords === "object"
      ? { lat: Number(rawRide.destination_coords.lat), lng: Number(rawRide.destination_coords.lng) }
      : null,
    route_geometry: Array.isArray(rawRide.route_geometry) && rawRide.route_geometry.length <= 50
      ? rawRide.route_geometry
      : [],
  };
}

/**
 * Synchronously retrieves cached public rides from localStorage.
 * Filters out expired/past rides so outdated trips are never displayed as active.
 *
 * @returns {Array<object>}
 */
export function getCachedPublicRides() {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const raw = localStorage.getItem(RIDES_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rides)) {
      return [];
    }

    // Check overall cache timestamp freshness
    if (typeof parsed.timestamp === "number" && Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) {
      return [];
    }

    const now = Date.now();

    // Sanitize and keep all active upcoming rides (departure time in future, open/active status)
    // Note: Do NOT discard rides with available_seats === 0 (full rides are still active trips)
    const validRides = parsed.rides
      .map(sanitizePublicRide)
      .filter((r) => {
        if (!r) return false;
        if (r.status !== "open" && r.status !== "active") return false;
        const depTime = new Date(r.departure_at).getTime();
        return !isNaN(depTime) && depTime > now;
      });

    return validRides;
  } catch (_err) {
    return [];
  }
}

/**
 * Persists fresh public rides to localStorage.
 *
 * @param {Array<object>} rides
 */
export function cachePublicRides(rides) {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!Array.isArray(rides)) return;

  try {
    const now = Date.now();
    const sanitized = rides
      .map(sanitizePublicRide)
      .filter((r) => {
        if (!r) return false;
        if (r.status !== "open" && r.status !== "active") return false;
        const depTime = new Date(r.departure_at).getTime();
        return !isNaN(depTime) && depTime > now;
      });

    const payload = {
      version: 1,
      timestamp: Date.now(),
      rides: sanitized,
    };

    localStorage.setItem(RIDES_CACHE_KEY, JSON.stringify(payload));
  } catch (_err) {
    // LocalStorage write error handled silently
  }
}

/**
 * Clears the public rides cache if explicitly needed.
 */
export function clearPublicRidesCache() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(RIDES_CACHE_KEY);
  } catch (_err) {
    // LocalStorage remove error handled silently
  }
}

export const EXPIRED_TRIPS_CACHE_PREFIX = "campusride_expired_trips_";

/**
 * Synchronously retrieves cached expired trips for a given user (or guest).
 * Partitioned by user ID to prevent displaying another user's trip history.
 *
 * @param {string|null} userId
 * @returns {Array<object>}
 */
export function getCachedExpiredTrips(userId) {
  if (typeof window === "undefined" || !window.localStorage) return [];

  const key = `${EXPIRED_TRIPS_CACHE_PREFIX}${userId || "guest"}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rides)) {
      return [];
    }

    if (typeof parsed.timestamp === "number" && Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) {
      return [];
    }

    const now = Date.now();
    return parsed.rides
      .map(sanitizePublicRide)
      .filter((r) => {
        if (!r) return false;
        if (r.status === "cancelled" || r.status === "completed") return false;
        const depTime = new Date(r.departure_at).getTime();
        return !isNaN(depTime) && depTime <= now;
      })
      .sort((a, b) => {
        const timeA = new Date(a.departure_at).getTime() || 0;
        const timeB = new Date(b.departure_at).getTime() || 0;
        if (timeB !== timeA) return timeB - timeA;
        return String(b.id || "").localeCompare(String(a.id || ""));
      });
  } catch (_err) {
    return [];
  }
}

/**
 * Persists fresh expired trips to localStorage, scoped by user ID.
 *
 * @param {string|null} userId
 * @param {Array<object>} rides
 */
export function cacheExpiredTrips(userId, rides) {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!Array.isArray(rides)) return;

  const key = `${EXPIRED_TRIPS_CACHE_PREFIX}${userId || "guest"}`;
  try {
    const now = Date.now();
    const sanitized = rides
      .map(sanitizePublicRide)
      .filter((r) => {
        if (!r) return false;
        if (r.status === "cancelled" || r.status === "completed") return false;
        const depTime = new Date(r.departure_at).getTime();
        return !isNaN(depTime) && depTime <= now;
      })
      .sort((a, b) => {
        const timeA = new Date(a.departure_at).getTime() || 0;
        const timeB = new Date(b.departure_at).getTime() || 0;
        if (timeB !== timeA) return timeB - timeA;
        return String(b.id || "").localeCompare(String(a.id || ""));
      });

    const payload = {
      version: 1,
      userId: userId || "guest",
      timestamp: Date.now(),
      rides: sanitized,
    };

    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_err) {
    // LocalStorage write error handled silently
  }
}

/**
 * Clears the expired trips cache entry on logout.
 *
 * @param {string|null} userId
 */
export function clearExpiredTripsCache(userId) {
  if (typeof window === "undefined" || !window.localStorage || !userId) return;
  try {
    localStorage.removeItem(`${EXPIRED_TRIPS_CACHE_PREFIX}${userId}`);
  } catch (_err) {
    // LocalStorage remove error handled silently
  }
}

