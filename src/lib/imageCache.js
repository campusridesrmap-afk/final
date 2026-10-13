/**
 * CampusRide Image Cache & Smooth Loading Manager
 *
 * Provides in-memory LRU tracking and image preloading to prevent repeated
 * downloads, layout shifts, and broken image placeholders across the application.
 */

const imageMemoryCache = new Set();
const preloadingPromises = new Map();
const MAX_CACHED_IMAGES = 60;

/**
 * Checks whether an image URL has already been loaded in the current session.
 * @param {string} src
 * @returns {boolean}
 */
export function isImageCached(src) {
  if (!src || typeof src !== "string") return false;
  // Inline data / svg URIs are always instantly available
  if (src.startsWith("data:") || src.startsWith("blob:")) return true;
  return imageMemoryCache.has(src);
}

/**
 * Preloads an image into the browser cache and registers it in memory.
 * Returns a promise that resolves when the image is fully ready.
 *
 * @param {string} src
 * @returns {Promise<string>}
 */
export function preloadImage(src) {
  if (!src || typeof src !== "string") {
    return Promise.reject(new Error("Invalid image source"));
  }

  if (isImageCached(src)) {
    return Promise.resolve(src);
  }

  if (preloadingPromises.has(src)) {
    return preloadingPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof Image === "undefined") {
      resolve(src);
      return;
    }

    const img = new Image();
    img.src = src;
    img.decoding = "async";

    img.onload = () => {
      if (imageMemoryCache.size >= MAX_CACHED_IMAGES) {
        const first = imageMemoryCache.values().next().value;
        imageMemoryCache.delete(first);
      }
      imageMemoryCache.add(src);
      preloadingPromises.delete(src);
      resolve(src);
    };

    img.onerror = (err) => {
      preloadingPromises.delete(src);
      reject(err);
    };
  });

  preloadingPromises.set(src, promise);
  return promise;
}
