/**
 * Route matching utilities:
 * - OSRM routing (free, no API key)
 * - Haversine distance
 * - Stop-based route matching for partial journeys
 * - Segment-based seat availability checking
 */

const OSRM_URL = 'https://router.project-osrm.org';

/** Haversine distance in kilometres between two lat/lng points. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch a driving route from OSRM.
 * @param {Array<{lat:number, lng:number}>} waypoints – ordered stops
 * @param {AbortSignal} [signal]
 * @returns {{ geometry: Array<{lat,lng}>, distance: number, duration: number }}
 */
export async function fetchRoute(waypoints, signal) {
  if (!waypoints || waypoints.length < 2) {
    throw new Error('At least two waypoints required');
  }

  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Routing service unavailable');

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) {
    throw new Error('No route found between these locations');
  }

  const route = data.routes[0];
  return {
    geometry: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    distance: route.distance, // metres
    duration: route.duration, // seconds
  };
}

/**
 * Find the best-matching pickup and drop-off stops for a passenger
 * along a driver's ordered route.
 *
 * Returns `null` when:
 *  - either point is beyond `thresholdKm`
 *  - the passenger's direction is opposite to the driver's route
 *
 * @param {{lat,lng}} passengerPickup
 * @param {{lat,lng}} passengerDropoff
 * @param {Array<{lat,lng,name,order_index}>} rideStops – driver stops in order
 * @param {number} [thresholdKm=5] – max proximity in km
 */
export function findMatchingStops(
  passengerPickup,
  passengerDropoff,
  rideStops,
  thresholdKm = 5
) {
  if (!rideStops || rideStops.length < 2) return null;

  let bestPickup = { idx: -1, dist: Infinity };
  let bestDropoff = { idx: -1, dist: Infinity };

  rideStops.forEach((stop, idx) => {
    const pDist = haversineKm(
      passengerPickup.lat,
      passengerPickup.lng,
      stop.lat,
      stop.lng
    );
    const dDist = haversineKm(
      passengerDropoff.lat,
      passengerDropoff.lng,
      stop.lat,
      stop.lng
    );

    if (pDist < bestPickup.dist) bestPickup = { idx, dist: pDist };
    if (dDist < bestDropoff.dist) bestDropoff = { idx, dist: dDist };
  });

  // Both must be within threshold
  if (bestPickup.dist > thresholdKm || bestDropoff.dist > thresholdKm) return null;
  // Pickup must precede drop-off along the route (correct direction)
  if (bestPickup.idx >= bestDropoff.idx) return null;

  return {
    pickupStopIndex: bestPickup.idx,
    dropoffStopIndex: bestDropoff.idx,
    pickupDistance: bestPickup.dist,
    dropoffDistance: bestDropoff.dist,
    pickupStop: rideStops[bestPickup.idx],
    dropoffStop: rideStops[bestDropoff.idx],
  };
}

/**
 * Check whether `seatsRequested` seats are free for every segment between
 * `pickupIdx` and `dropoffIdx` given the currently accepted bookings.
 */
export function checkSegmentAvailability(
  pickupIdx,
  dropoffIdx,
  totalSeats,
  acceptedBookings,
  seatsRequested = 1
) {
  for (let seg = pickupIdx; seg < dropoffIdx; seg++) {
    let occupied = 0;
    for (const b of acceptedBookings) {
      if (b.pickup_stop_index <= seg && b.dropoff_stop_index > seg) {
        occupied += b.seats_requested;
      }
    }
    if (totalSeats - occupied < seatsRequested) return false;
  }
  return true;
}

/** Human-readable distance string. */
export function formatDistance(metres) {
  if (metres == null) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Human-readable duration string. */
export function formatDuration(seconds) {
  if (seconds == null) return '';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}
