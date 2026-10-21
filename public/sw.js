/**
 * CampusRide Service Worker for Web Push Notifications
 *
 * Handles background push notifications when the browser/app is in the
 * background or completely closed, and routes notification taps to the
 * administrator registrations view.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 1. Background Push Event Handler
// Woken up by Android / Browser Push Service (Google Play Services / FCM)
// even when CampusRide is backgrounded or closed.
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_err) {
      try {
        data = { body: event.data.text() };
      } catch (_e) {
        data = {};
      }
    }
  }

  const title = data.title || "CampusRide – New Request";
  const body =
    data.body || "A new student registration request needs your review.";
  const url = data.url || "/#registrations";

  const options = {
    body,
    icon: data.icon || "/cr.jpeg",
    badge: data.badge || "/cr.jpeg",
    tag: data.tag || `campusride-reg-${data.registrationId || "alert"}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      url,
      targetPage: "registrations",
      registrationId: data.registrationId || null,
      timestamp: Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 2. Notification Click / Tap Handler
// Opens CampusRide or brings existing window to the foreground and navigates
// to the admin registrations review screen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/#registrations";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a CampusRide window is already open, focus it and navigate
      for (const client of windowClients) {
        if ("focus" in client) {
          return client.focus().then((focusedClient) => {
            if (focusedClient && "navigate" in focusedClient) {
              focusedClient.navigate(targetUrl);
            }
            if (focusedClient && "postMessage" in focusedClient) {
              focusedClient.postMessage({
                type: "NAVIGATE",
                page: "registrations",
                url: targetUrl,
              });
            }
          });
        }
      }

      // If no window is currently open, launch a new window to the target URL
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
