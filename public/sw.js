/**
 * CampusRide Service Worker
 *
 * Meets Progressive Web App (PWA) installability criteria.
 */

const CACHE_NAME = "campusride-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event listener is mandatory for Chrome's native beforeinstallprompt
self.addEventListener("fetch", (event) => {
  // Let browser handle navigation and network requests normally
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
