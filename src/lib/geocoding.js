/**
 * Reverse geocoding using OpenStreetMap Nominatim (free, no API key).
 * Converts device coordinates into rich, human-readable addresses.
 */

import { haversineKm } from "./routeMatching";
import { COMMON_LOCATIONS, SRM_CAMPUS } from "../data/srmLocations";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const geocodeCache = new Map();

/**
 * Formats OpenStreetMap Nominatim response into a complete, human-readable address.
 */
export function formatFullAddress(data) {
  if (!data) return "Location address unavailable";
  const addr = data.address || {};

  const parts = [];

  // 1. Specific building, amenity, landmark, or named place
  const place =
    data.name ||
    addr.amenity ||
    addr.building ||
    addr.office ||
    addr.shop ||
    addr.tourism ||
    addr.leisure ||
    "";
  if (place && place.trim()) {
    parts.push(place.trim());
  }

  // 2. Specific building code or block if different from place
  if (
    addr.building &&
    addr.building.trim() &&
    !parts.some((p) => p.toLowerCase() === addr.building.trim().toLowerCase())
  ) {
    parts.push(addr.building.trim());
  }

  // 3. Campus / Amenity if distinct
  if (
    addr.amenity &&
    addr.amenity.trim() &&
    !parts.some((p) => p.toLowerCase() === addr.amenity.trim().toLowerCase())
  ) {
    parts.push(addr.amenity.trim());
  }

  // 4. Road or street
  const road = addr.road || addr.pedestrian || addr.street || addr.highway || "";
  if (
    road &&
    road.trim() &&
    !parts.some((p) => p.toLowerCase() === road.trim().toLowerCase())
  ) {
    parts.push(road.trim());
  }

  // 5. Locality, suburb, neighborhood, village or hamlet
  const locality =
    addr.suburb ||
    addr.neighbourhood ||
    addr.village ||
    addr.hamlet ||
    addr.residential ||
    "";
  if (
    locality &&
    locality.trim() &&
    !parts.some((p) => p.toLowerCase() === locality.trim().toLowerCase())
  ) {
    parts.push(locality.trim());
  }

  // 6. Mandal / Tehsil / County / Sub-district
  const subdistrict = addr.county || addr.subdistrict || "";
  if (
    subdistrict &&
    subdistrict.trim() &&
    !parts.some((p) => p.toLowerCase() === subdistrict.trim().toLowerCase())
  ) {
    parts.push(subdistrict.trim());
  }

  // 7. City / Town / Municipality
  const city = addr.city || addr.town || addr.municipality || "";
  if (
    city &&
    city.trim() &&
    !parts.some((p) => p.toLowerCase() === city.trim().toLowerCase())
  ) {
    parts.push(city.trim());
  }

  // 8. District
  const district = addr.district || addr.state_district || "";
  if (
    district &&
    district.trim() &&
    !parts.some((p) => p.toLowerCase() === district.trim().toLowerCase())
  ) {
    parts.push(district.trim());
  }

  // 9. State
  const state = addr.state || "";
  if (
    state &&
    state.trim() &&
    !parts.some((p) => p.toLowerCase() === state.trim().toLowerCase())
  ) {
    parts.push(state.trim());
  }

  // 10. Postcode
  const postcode = addr.postcode || "";
  if (
    postcode &&
    postcode.trim() &&
    !parts.some((p) => p.toLowerCase() === postcode.trim().toLowerCase())
  ) {
    parts.push(postcode.trim());
  }

  const structuredAddress = parts.filter(Boolean).join(", ");

  // If structured address has good specificity, return it
  if (parts.length >= 2) {
    return structuredAddress;
  }

  // Otherwise fallback to canonical display_name from Nominatim if present
  if (data.display_name && data.display_name.trim()) {
    return data.display_name.trim();
  }

  return structuredAddress || "Location address unavailable";
}

export async function reverseGeocode(lat, lng, signal) {
  if (lat == null || lng == null) {
    return {
      name: "Location name unavailable",
      fullAddress: "Location address unavailable",
      label: "Location address unavailable",
    };
  }

  // Cache key rounded to ~100m
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");

    const res = await fetch(url, {
      signal,
      headers: { "Accept-Language": "en", "User-Agent": "CampusRide-SRMAP" },
    });

    if (!res.ok) throw new Error("Reverse geocoding failed");

    const data = await res.json();
    if (!data || data.error) throw new Error(data?.error || "Location not found");

    const addr = data.address || {};
    const fullAddress = formatFullAddress(data);

    // Primary place identifier
    const primaryName =
      data.name ||
      addr.building ||
      addr.amenity ||
      addr.road ||
      addr.suburb ||
      addr.village ||
      addr.town ||
      addr.city ||
      "";

    const result = {
      name: primaryName || fullAddress,
      fullAddress,
      label: fullAddress,
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lon),
    };

    geocodeCache.set(cacheKey, result);
    return result;
  } catch {
    // Proximity fallback check against known campus hubs if Nominatim is rate-limited or offline
    for (const loc of [SRM_CAMPUS, ...COMMON_LOCATIONS]) {
      const dist = haversineKm(lat, lng, loc.lat, loc.lng);
      if (dist <= 1.5) {
        const approx = {
          name: `Near ${loc.name}`,
          fullAddress: `Near ${loc.label || loc.name} (Estimated via verified campus hub)`,
          label: `Near ${loc.label || loc.name}`,
          lat,
          lng,
          isFallback: true,
        };
        geocodeCache.set(cacheKey, approx);
        return approx;
      }
    }

    // Strict requirement: return transparent fallback rather than inventing a place
    return {
      name: "Location name unavailable",
      fullAddress: `GPS Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)} (Address lookup unavailable)`,
      label: "Location address unavailable",
      lat,
      lng,
      isFallback: true,
    };
  }
}

