import { useState } from "react";
import { Car, Bike, Calendar, Clock, MapPin, CheckCircle, ArrowRight, User, ShieldCheck, Check, X } from "lucide-react";
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
  return num === 0 ? "Free" : `₹${num.toLocaleString("en-IN")}/seat`;
}

export function formatTotalCost(pricePerSeat, seatsRequested = 1) {
  const price = Number(pricePerSeat) || 0;
  const count = Number(seatsRequested) || 1;
  const total = price * count;
  if (price === 0) return "Free";
  return `Total: ₹${total.toLocaleString("en-IN")} for ${count} seat${count > 1 ? "s" : ""}`;
}

export default function RideCard({
  ride,
  onBook,
  isRequested,
  bookingStatus = null,
  isOwnRide,
  user,
  authLoading = false,
  busy,
  matchDetails = null, // from findMatchingStops
  onCompleteRide = null,
  onCancelSharing = null,
}) {
  const [requestedSeats, setRequestedSeats] = useState(1);
  const seatsAvailable = Number(ride.available_seats) || 0;
  const stops = Array.isArray(ride.stops) && ride.stops.length >= 2 ? ride.stops : null;

  const isBike = ride.vehicle_type === "Bike";
  const maxSelectableSeats = isBike ? 1 : Math.max(1, Math.min(seatsAvailable, 7));

  const departureTimestamp = new Date(ride.departure_at).getTime();
  const isDeparturePassed = !isNaN(departureTimestamp) && departureTimestamp <= Date.now();

  const effectiveStatus = bookingStatus || (isRequested ? "pending" : null);
  const hasActiveRequest = effectiveStatus === "pending" || effectiveStatus === "accepted";

  return (
    <article className="ride-card">
      <div className="ride-card-top">
        <div className="vehicle-pill">
          {ride.vehicle_type === "Bike" ? (
            <Bike size={14} />
          ) : ride.vehicle_type === "Auto" ? (
            <span style={{ fontSize: "13px", lineHeight: 1 }} role="img" aria-label="Auto">
              🛺
            </span>
          ) : (
            <Car size={14} />
          )}
          <span>{ride.vehicle_type}</span>
        </div>

        <div className="driver-badge">
          <User size={13} />
          <span>{ride.provider_name || "SRM Student"}</span>
        </div>

        {ride.status === "completed" ? (
          <div className="seat-count-badge status-completed">
            <strong>Ride Ended</strong>
          </div>
        ) : ride.status === "cancelled" ? (
          <div className="seat-count-badge status-cancelled">
            <strong>Cancelled</strong>
          </div>
        ) : isDeparturePassed ? (
          <div className="seat-count-badge status-booking-closed">
            <strong>Booking Closed</strong>
          </div>
        ) : (
          <div className={`seat-count-badge ${seatsAvailable <= 1 ? "seat-low" : ""}`}>
            <strong>{seatsAvailable}</strong> {seatsAvailable === 1 ? "seat left" : "seats left"}
          </div>
        )}
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
          <div className="own-ride-footer-container">
            {ride.status === "completed" ? (
              <span className="status-pill status-completed">Ride Ended</span>
            ) : ride.status === "cancelled" ? (
              <span className="status-pill status-cancelled">Cancelled</span>
            ) : (
              <div className="own-ride-actions-row">
                <span className={`own-ride-pill ${isDeparturePassed ? "status-booking-closed" : ""}`}>
                  {isDeparturePassed ? "Booking Closed" : "Active"}
                </span>
                <div className="own-ride-btn-group">
                  {onCompleteRide && (
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={() => onCompleteRide(ride.id)}
                      disabled={busy}
                    >
                      Complete Ride
                    </button>
                  )}
                  {onCancelSharing && (
                    <button
                      type="button"
                      className="button button-outline button-small danger-outline"
                      onClick={() => onCancelSharing(ride.id)}
                      disabled={busy}
                    >
                      Cancel Sharing
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : ride.status === "completed" ? (
          <div className="booking-action-row">
            <span className="status-pill status-completed">Ride Ended</span>
          </div>
        ) : ride.status === "cancelled" ? (
          <div className="booking-action-row">
            <span className="status-pill status-cancelled">Cancelled</span>
          </div>
        ) : (
          <div className="booking-action-row">
            {effectiveStatus === "pending" ? (
              <button
                type="button"
                className="button button-outline status-btn-pending"
                disabled={true}
                title="Your seat request is pending approval from the driver"
              >
                <Clock size={13} /> Request Pending
              </button>
            ) : effectiveStatus === "accepted" ? (
              <button
                type="button"
                className="button button-outline status-btn-accepted"
                disabled={true}
                title="Your seat has been approved by the driver"
              >
                <Check size={13} /> Request Accepted
              </button>
            ) : effectiveStatus === "rejected" ? (
              <button
                type="button"
                className="button button-outline status-btn-rejected"
                disabled={true}
                title="The driver declined this request"
              >
                <X size={13} /> Request Declined
              </button>
            ) : isDeparturePassed ? (
              <div className="booking-closed-banner">
                <span className="status-pill status-booking-closed">
                  Booking Closed
                </span>
                <small className="booking-closed-explanation">
                  Booking closed because the departure time has passed.
                </small>
              </div>
            ) : seatsAvailable <= 0 ? (
              <button
                type="button"
                className="button button-outline"
                disabled={true}
              >
                Ride Full
              </button>
            ) : (
              <>
                {!isBike && maxSelectableSeats > 1 && !hasActiveRequest && user && (
                  <div className="seat-select-group">
                    <label>Seats:</label>
                    <select
                      value={requestedSeats}
                      onChange={(e) => setRequestedSeats(Number(e.target.value))}
                      disabled={busy}
                    >
                      {Array.from({ length: maxSelectableSeats }, (_, i) => i + 1).map((num) => (
                        <option key={num} value={num}>
                          {num}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!user ? (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => onBook(ride, requestedSeats, matchDetails)}
                    disabled={busy || authLoading}
                  >
                    {authLoading ? "Restoring session..." : "Sign in to book"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => onBook(ride, requestedSeats, matchDetails)}
                    disabled={busy}
                  >
                    Request Seat{requestedSeats > 1 ? ` (${requestedSeats})` : ""}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
