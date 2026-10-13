/**
 * CampusRide User Bookings Cache
 *
 * Persists an authenticated user's ride booking requests in localStorage
 * so that on page refresh, the dashboard immediately knows which rides are
 * already "Request Pending" or "Request Accepted", eliminating button flicker
 * and duplicate booking attempts.
 *
 * Account Isolation:
 * Cache keys are strictly partitioned by userId (campusride_user_bookings_${userId}).
 * Never shares booking states across students.
 */

const BOOKINGS_CACHE_PREFIX = "campusride_user_bookings_";

/**
 * Synchronously retrieves cached bookings map for the given userId.
 *
 * @param {string|null} userId
 * @returns {Record<string, { id: string, rideId: string, status: string, seats_requested: number }>}
 */
export function getCachedUserBookings(userId) {
  if (typeof window === "undefined" || !window.localStorage || !userId) {
    return {};
  }

  try {
    const raw = localStorage.getItem(`${BOOKINGS_CACHE_PREFIX}${userId}`);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId || typeof parsed.bookings !== "object") {
      return {};
    }

    return parsed.bookings || {};
  } catch (err) {
    console.warn("CampusRide: Error reading user bookings cache:", err);
    return {};
  }
}

/**
 * Persists user bookings to localStorage.
 *
 * @param {string} userId
 * @param {Array<object>|Record<string, object>} bookings
 */
export function cacheUserBookings(userId, bookings) {
  if (typeof window === "undefined" || !window.localStorage || !userId) {
    return;
  }

  try {
    const map = {};

    if (Array.isArray(bookings)) {
      bookings.forEach((b) => {
        if (!b) return;
        const rideId = b.ride_id || b.ride?.id;
        if (rideId) {
          const existing = map[rideId];
          const newTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          const oldTime = existing?.created_at ? new Date(existing.created_at).getTime() : 0;
          if (!existing || newTime >= oldTime) {
            map[rideId] = {
              id: String(b.id),
              rideId: String(rideId),
              status: b.status || "pending",
              seats_requested: Number(b.seats_requested) || 1,
              created_at: b.created_at || null,
            };
          }
        }
      });
    } else if (bookings && typeof bookings === "object") {
      Object.keys(bookings).forEach((rideId) => {
        const item = bookings[rideId];
        if (item) {
          map[rideId] = {
            id: String(item.id),
            rideId: String(rideId),
            status: item.status || "pending",
            seats_requested: Number(item.seats_requested) || 1,
            created_at: item.created_at || null,
          };
        }
      });
    }

    const payload = {
      version: 1,
      userId,
      timestamp: Date.now(),
      bookings: map,
    };

    localStorage.setItem(`${BOOKINGS_CACHE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch (err) {
    console.warn("CampusRide: Error saving user bookings cache:", err);
  }
}

/**
 * Clears cached bookings for a given user on signout.
 *
 * @param {string} userId
 */
export function clearUserBookingsCache(userId) {
  if (typeof window === "undefined" || !window.localStorage || !userId) return;
  try {
    localStorage.removeItem(`${BOOKINGS_CACHE_PREFIX}${userId}`);
  } catch (err) {
    console.warn("CampusRide: Error clearing user bookings cache:", err);
  }
}
