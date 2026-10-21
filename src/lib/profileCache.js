/**
 * CampusRide Profile Cache Manager
 *
 * Provides immediate synchronous hydration and persistent caching for
 * authenticated user profile details (full_name, registration_number, etc.)
 * to eliminate UI display flicker across page refreshes.
 *
 * Enforces strict per-user isolation, safe validation, and background revalidation.
 */

export const PROFILE_CACHE_PREFIX = "campusride_profile_";
export const ADMIN_CACHE_PREFIX = "campusride_admin_";
export const ACTIVE_USER_KEY = "campusride_active_user_id";

/**
 * Retrieves the cached admin status for a specific user ID.
 * Returns false if no valid cache exists or user is not admin.
 *
 * @param {string} userId
 * @returns {boolean}
 */
export function getCachedAdminStatus(userId) {
  if (!userId || typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`${ADMIN_CACHE_PREFIX}${userId}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.isAdmin);
  } catch (_err) {
    return false;
  }
}

/**
 * Retrieves cached pending registrations count for badge stability.
 *
 * @param {string} userId
 * @returns {number}
 */
export function getCachedPendingRegistrationsCount(userId) {
  if (!userId || typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(`${ADMIN_CACHE_PREFIX}${userId}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return typeof parsed?.pendingCount === "number" ? parsed.pendingCount : 0;
  } catch (_err) {
    return 0;
  }
}

/**
 * Saves the admin status and pending count for a specific user ID in localStorage.
 *
 * @param {string} userId
 * @param {boolean} isAdmin
 * @param {number} pendingCount
 */
export function cacheAdminStatus(userId, isAdmin, pendingCount = 0) {
  if (!userId || typeof window === "undefined") return;
  try {
    if (isAdmin) {
      localStorage.setItem(
        `${ADMIN_CACHE_PREFIX}${userId}`,
        JSON.stringify({ isAdmin: true, pendingCount, cached_at: new Date().toISOString() })
      );
    } else {
      localStorage.removeItem(`${ADMIN_CACHE_PREFIX}${userId}`);
    }
  } catch (_err) {
    // Ignore storage write error
  }
}

/**
 * Clears cached admin status for a specific user ID.
 *
 * @param {string} userId
 */
export function clearCachedAdminStatus(userId) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${ADMIN_CACHE_PREFIX}${userId}`);
  } catch (_err) {}
}

/**
 * Validates whether profile data contains genuine student identity information.
 * Disallows temporary defaults such as "SRM Student", email addresses, or empty strings.
 *
 * @param {object} profile
 * @returns {boolean}
 */
export function isValidProfileData(profile) {
  if (!profile || typeof profile !== "object") return false;

  const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";

  // Must have a non-empty name
  if (!fullName) return false;

  // Never treat "SRM Student" as valid identity
  if (fullName.toLowerCase() === "srm student") return false;

  // Never treat an email address as valid full_name
  if (fullName.includes("@")) return false;

  return true;
}

/**
 * Retrieves the cached profile for a specific user ID.
 * Returns null if no valid cache exists for that user ID.
 *
 * @param {string} userId
 * @returns {object|null}
 */
export function getCachedUserProfile(userId) {
  if (!userId || typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${userId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed && parsed.id === userId && isValidProfileData(parsed)) {
      return parsed;
    }
  } catch (_err) {
    // Read error fallback
  }

  return null;
}

/**
 * Saves a valid profile for a specific user ID in localStorage.
 * Only saves if profile data passes validation to prevent polluting cache with temporary values.
 *
 * @param {string} userId
 * @param {object} profileData
 * @returns {object|null} The cached profile object, or null if invalid
 */
export function cacheUserProfile(userId, profileData) {
  if (!userId || !profileData || typeof window === "undefined") return null;

  if (!isValidProfileData(profileData)) {
    return null;
  }

  try {
    const cleanProfile = {
      id: userId,
      full_name: profileData.full_name.trim(),
      registration_number: (profileData.registration_number || "").trim().toUpperCase(),
      mobile_number: (profileData.mobile_number || "").trim(),
      profile_completed: Boolean(profileData.profile_completed),
      must_change_password: Boolean(profileData.must_change_password),
      cached_at: new Date().toISOString(),
    };

    localStorage.setItem(`${PROFILE_CACHE_PREFIX}${userId}`, JSON.stringify(cleanProfile));
    localStorage.setItem(ACTIVE_USER_KEY, userId);

    return cleanProfile;
  } catch (_err) {
    return null;
  }
}

/**
 * Sets or clears the active user ID tracker in localStorage.
 *
 * @param {string|null} userId
 */
export function setActiveUserId(userId) {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      localStorage.setItem(ACTIVE_USER_KEY, userId);
    } else {
      localStorage.removeItem(ACTIVE_USER_KEY);
    }
  } catch (_err) {
    // Session tracking error handled silently
  }
}

/**
 * Clears the active user session marker.
 * Strictly maintains isolation so a logged-out state never references an active user.
 */
export function clearActiveUserSession() {
  if (typeof window === "undefined") return;
  try {
    const activeUserId = localStorage.getItem(ACTIVE_USER_KEY);
    if (activeUserId) {
      localStorage.removeItem(`${ADMIN_CACHE_PREFIX}${activeUserId}`);
    }
    localStorage.removeItem(ACTIVE_USER_KEY);
  } catch (_err) {
    // Clear session error handled silently
  }
}

/**
 * Synchronously inspects localStorage during initial React render.
 * Reads the stored Supabase session and active user profile if available,
 * allowing React components to render immediately with the correct name and reg number.
 *
 * @returns {{ initialSession: object|null, initialUser: object|null, initialProfile: object|null }}
 */
export function getInitialAuthAndProfile() {
  if (typeof window === "undefined") {
    return { initialSession: null, initialUser: null, initialProfile: null };
  }

  try {
    let activeUserId = localStorage.getItem(ACTIVE_USER_KEY);
    let sessionUser = null;
    let fullSession = null;

    // Inspect localStorage for Supabase's stored auth token
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("sb-") ||
          key.includes("supabase.auth.token") ||
          key.includes("auth-token"))
      ) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const candidateUser =
              parsed?.user || parsed?.session?.user || parsed?.currentSession?.user;
            if (candidateUser?.id) {
              sessionUser = candidateUser;
              fullSession =
                parsed?.session ||
                (parsed?.access_token ? parsed : { user: candidateUser });
              activeUserId = candidateUser.id;
              break;
            }
          } catch {
            // continue checking other keys if any
          }
        }
      }
    }

    // Security requirement: strictly require a genuine Supabase auth token in localStorage.
    // Never treat cached profile data alone as proof of an authenticated session.
    if (sessionUser?.id) {
      const cached = getCachedUserProfile(sessionUser.id);
      const cachedAdmin = getCachedAdminStatus(sessionUser.id);
      const cachedPendingCount = getCachedPendingRegistrationsCount(sessionUser.id);

      return {
        initialSession: fullSession || { user: sessionUser },
        initialUser: sessionUser,
        initialProfile: cached,
        initialIsAdmin: cachedAdmin,
        initialPendingCount: cachedPendingCount,
      };
    }
  } catch (_err) {
    // Initial auth hydration error handled silently
  }

  return {
    initialSession: null,
    initialUser: null,
    initialProfile: null,
    initialIsAdmin: false,
    initialPendingCount: 0,
  };
}

/**
 * Safely merges fresh data from the network with existing cache.
 * If fresh data is valid, updates the cache.
 * If network data is missing or invalid, retains the valid cached profile.
 *
 * @param {string} userId
 * @param {object|null} freshData
 * @returns {object|null}
 */
export function mergeProfileWithCache(userId, freshData) {
  if (!userId) return null;

  const existingCache = getCachedUserProfile(userId);

  if (freshData && isValidProfileData(freshData)) {
    // Fresh network response is valid: update cache and return
    cacheUserProfile(userId, freshData);
    return freshData;
  }

  // Network returned empty, error, or fallback skeleton
  if (existingCache) {
    // Retain existing valid cached details! Do not clobber with fallback or empty data
    if (freshData) {
      // Safely merge flags like must_change_password or profile_completed
      const merged = {
        ...existingCache,
        ...(freshData.must_change_password !== undefined
          ? { must_change_password: freshData.must_change_password }
          : {}),
        ...(freshData.profile_completed !== undefined
          ? { profile_completed: freshData.profile_completed }
          : {}),
      };
      cacheUserProfile(userId, merged);
      return merged;
    }
    return existingCache;
  }

  return freshData || null;
}
