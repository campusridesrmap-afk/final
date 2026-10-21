/**
 * CampusRide Push Notification Manager
 *
 * Manages service worker lifecycle, browser push subscriptions via VAPID,
 * and synchronizes administrator push endpoints with the Supabase database.
 */

// Default VAPID public key generated for CampusRide (can be overridden via VITE_VAPID_PUBLIC_KEY)
export const VAPID_PUBLIC_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_VAPID_PUBLIC_KEY) ||
  "BOMvCHtVQqhgRdLB2_uUdrMXhwi1L0UzP2kjZlybO_W7IboURX8lce2b47k4p-GKUUJlxMW-wKEtOAASGKlQNY0";

/**
 * Converts a base64url-encoded string to a Uint8Array for applicationServerKey.
 *
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks whether the current device/browser supports Service Workers and Web Push.
 *
 * @returns {boolean}
 */
export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Returns the current notification permission state: "granted", "denied", "default", or "unsupported".
 *
 * @returns {string}
 */
export function getNotificationPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Registers the root Service Worker (/sw.js) if not already registered.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    return registration;
  } catch (err) {
    console.warn("CampusRide: Service Worker registration failed:", err);
    return null;
  }
}

/**
 * Subscribes the current device/browser to Web Push notifications and
 * securely persists the subscription in Supabase for the authenticated administrator.
 *
 * @param {object} supabaseClient
 * @returns {Promise<{ success: boolean, reason?: string, error?: string, subscription?: PushSubscription }>}
 */
export async function subscribeAdminPush(supabaseClient) {
  if (!isPushSupported()) {
    return { success: false, reason: "unsupported" };
  }

  try {
    // 1. Request notification permission from the administrator
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, reason: "permission_denied", permission };
    }

    // 2. Ensure Service Worker is active
    let registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) {
      registration = await registerServiceWorker();
    }
    if (!registration) {
      return { success: false, reason: "sw_failed", error: "Could not register service worker" };
    }

    // Wait until the service worker is active
    if (!registration.active) {
      await new Promise((resolve) => {
        const check = () => {
          if (registration.active) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }

    // 3. Obtain push subscription from the browser's PushManager
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // 4. Extract standard subscription details
    const subJson = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = subJson.keys?.p256dh || "";
    const auth = subJson.keys?.auth || "";

    if (!endpoint || !p256dh || !auth) {
      return { success: false, reason: "invalid_keys", error: "Push subscription keys missing" };
    }

    // 5. Securely persist subscription in Supabase via RPC
    const { data, error } = await supabaseClient.rpc("save_admin_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: navigator.userAgent || "",
    });

    if (error) {
      console.warn("CampusRide: Failed to save admin push subscription to database:", error);
      return { success: false, reason: "db_error", error: error.message };
    }

    return { success: true, subscription };
  } catch (err) {
    console.error("CampusRide: Error subscribing admin to push:", err);
    return { success: false, reason: "exception", error: err.message };
  }
}

/**
 * Unsubscribes the current device/browser from push notifications and
 * removes the subscription from Supabase.
 *
 * @param {object} supabaseClient
 * @returns {Promise<{ success: boolean }>}
 */
export async function unsubscribeAdminPush(supabaseClient) {
  if (!isPushSupported()) return { success: false };

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        if (supabaseClient) {
          await supabaseClient.rpc("remove_admin_push_subscription", {
            p_endpoint: endpoint,
          });
        }
      }
    }
    return { success: true };
  } catch (err) {
    console.warn("CampusRide: Error unsubscribing admin from push:", err);
    return { success: false };
  }
}

/**
 * Checks whether the current device has an active push subscription registered.
 *
 * @returns {Promise<boolean>}
 */
export async function hasActivePushSubscription() {
  if (!isPushSupported() || Notification.permission !== "granted") {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch (_err) {
    return false;
  }
}

/**
 * Dispatches a client-side test notification via the active Service Worker
 * to verify device delivery and notification click routing.
 *
 * @returns {Promise<boolean>}
 */
export async function sendLocalTestNotification() {
  if (!isPushSupported() || Notification.permission !== "granted") {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (registration) {
      await registration.showNotification("CampusRide – New Request", {
        body: "A new student registration request needs your review. (Test Alert)",
        icon: "/cr.jpeg",
        badge: "/cr.jpeg",
        tag: "campusride-test-alert",
        vibrate: [200, 100, 200],
        data: {
          url: "/#registrations",
          targetPage: "registrations",
          timestamp: Date.now(),
        },
      });
      return true;
    }
  } catch (err) {
    console.warn("CampusRide: Failed to show test notification:", err);
  }
  return false;
}
