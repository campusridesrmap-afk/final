import { useState } from "react";
import { Car, Bike, Calendar, Clock, MapPin, CheckCircle, ArrowRight, User, ShieldCheck } from "lucide-react";
import { formatDistance } from "../lib/routeMatching";

export function formatDate(value) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCost(value) {
  const num = Number(value);
  return num === 0 ? "Free" : `₹${num.toLocaleString("en-IN")} / seat`;
}

export default function RideCard({
  ride,
  onBook,
  isRequested,
  isOwnRide,
  user,
  busy,
  matchDetails = null, // from findMatchingStops
}) {
  const [requestedSeats, setRequestedSeats] = useState(1);
  const seatsAvailable = Number(ride.available_seats) || 0;
  const stops = Array.isArray(ride.stops) && ride.stops.length >= 2 ? ride.stops : null;

  return (
    <article className="ride-card">
      <div className="ride-card-top">
        <div className="vehicle-pill">
          {ride.vehicle_type === "Bike" ? <Bike size={14} /> : <Car size={14} />}
          <span>{ride.vehicle_type}</span>
        </div>

        <div className="driver-badge">
          <User size={13} />
          <span>{ride.provider_name || "SRM Student"}</span>
        </div>

        <div className={`seat-count-badge ${seatsAvailable <= 1 ? "seat-low" : ""}`}>
          <strong>{seatsAvailable}</strong> {seatsAvailable === 1 ? "seat left" : "seats left"}
        </div>
      </div>

      {/* Partial Route Matching Banner if passenger searched */}
      {matchDetails && (
        <div className="match-banner">
          <div className="match-header">
            <span className="match-tag">🎯 Segment Match</span>
            {matchDetails.pickupDistance != null && (
              <small className="match-dist">
                Pickup {formatDistance(matchDetails.pickupDistance * 1000)} away
              </small>
            )}
          </div>
          <div className="match-segment-text">
            <span>Hop on at: <strong>{matchDetails.pickupStop?.name}</strong></span>
            <ArrowRight size={13} className="inline-arrow" />
            <span>Drop at: <strong>{matchDetails.dropoffStop?.name}</strong></span>
          </div>
        </div>
      )}

      {/* Route Timeline */}
      <div className="route-timeline">
        <div className="timeline-point start">
          <div className="timeline-dot dot-start" />
          <div className="timeline-info">
            <small>FROM</small>
            <strong>{ride.from_location}</strong>
          </div>
        </div>

        {stops && stops.length > 2 && (
          <div className="timeline-via-summary">
            <span className="via-tag">
              Via {stops.length - 2} stop{stops.length - 2 > 1 ? "s" : ""}
            </span>
            <small className="via-names">
              {stops.slice(1, -1).map((s) => s.name).join(" • ")}
            </small>
          </div>
        )}

        <div className="timeline-point end">
          <div className="timeline-dot dot-end" />
          <div className="timeline-info">
            <small>TO</small>
            <strong>{ride.to_location}</strong>
          </div>
        </div>
      </div>

      <div className="ride-meta-bar">
        <div className="meta-item">
          <Calendar size={14} />
          <span>{formatDate(ride.departure_at)}</span>
        </div>
        <div className="meta-cost">
          <strong>{formatCost(ride.cost_per_seat)}</strong>
        </div>
      </div>

      <div className="ride-card-footer">
        {isOwnRide ? (
          <span className="own-ride-pill">Your Offered Ride</span>
        ) : (
          <div className="booking-action-row">
            {seatsAvailable > 1 && !isRequested && user && (
              <div className="seat-select-group">
                <label>Seats:</label>
                <select
                  value={requestedSeats}
                  onChange={(e) => setRequestedSeats(Number(e.target.value))}
                  disabled={busy}
                >
                  {Array.from({ length: Math.min(seatsAvailable, 4) }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num}>
                      {num}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              className={`button ${isRequested ? "button-outline" : "button-primary"}`}
              onClick={() => onBook(ride, requestedSeats, matchDetails)}
              disabled={busy || !user || isRequested || seatsAvailable <= 0}
            >
              {!user
                ? "Sign in to book"
                : isRequested
                ? "✓ Requested"
                : seatsAvailable <= 0
                ? "Ride Full"
                : `Request Seat${requestedSeats > 1 ? ` (${requestedSeats})` : ""}`}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
