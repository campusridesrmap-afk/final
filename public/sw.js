/**
 * CampusRide Service Worker
 *
 * Provides lifecycle management and basic offline shell caching.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
