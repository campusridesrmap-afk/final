import { Check, X, Clock, Users, Calendar, ArrowRight } from "lucide-react";
import ContactShare from "./ContactShare";
import LiveLocationShare from "./LiveLocationShare";
import { formatDate, formatCost } from "./RideCard";

export default function BookingRow({
  booking,
  type = "incoming", // "incoming" (as driver) | "outgoing" (as passenger)
  onRespond, // (bookingId, 'accept' | 'reject')
  onCancel, // (bookingId)
  currentUser,
  busy,
}) {
  const isIncoming = type === "incoming";
  const ride = booking.ride || booking.rides || {};
  const isAccepted = booking.status === "accepted";
  const isPending = booking.status === "pending";

  const pickup = booking.pickup_location || ride.from_location;
  const dropoff = booking.dropoff_location || ride.to_location;

  return (
    <article className={`booking-row-card status-${booking.status}`}>
      <div className="booking-main">
        <div className="booking-status-header">
          <div className="booking-route-title">
            <span className="route-endpoints">
              <strong>{pickup || "Start"}</strong>
              <ArrowRight size={14} className="route-arrow" />
              <strong>{dropoff || "Destination"}</strong>
            </span>
          </div>

          <span className={`status-pill status-${booking.status}`}>
            {isPending && <Clock size={12} />}
            {isAccepted && <Check size={12} />}
            {booking.status}
          </span>
        </div>

        <div className="booking-meta-line">
          <span className="meta-entry">
            <Calendar size={13} />
            {formatDate(ride.departure_at)}
          </span>
          <span className="meta-entry">
            <Users size={13} />
            {booking.seats_requested} seat{booking.seats_requested > 1 ? "s" : ""}
          </span>
          {ride.cost_per_seat != null && (
            <span className="meta-entry font-semibold">
              {formatCost(ride.cost_per_seat * (booking.seats_requested || 1))}
            </span>
          )}
        </div>

        {isIncoming ? (
          <div className="passenger-summary-row">
            <span>Ride Seeker: <strong>{booking.passenger_name || "SRM Student"}</strong></span>
          </div>
        ) : (
          <div className="driver-summary-row">
            <span>Vehicle Sharer: <strong>{booking.driver_name || ride.provider_name || "Vehicle Sharer"}</strong></span>
          </div>
        )}

        {/* Contact details when accepted */}
        {isAccepted && (
          <div className="booking-contact-section">
            {isIncoming ? (
              <ContactShare profile={booking.passenger_profile} role="Ride Seeker" />
            ) : (
              <ContactShare profile={booking.driver_profile} role="Vehicle Sharer" />
            )}

            {/* Student Live Location (Place Name - No Map) */}
            <LiveLocationShare
              rideId={booking.ride_id || ride.id}
              currentUser={currentUser}
              currentUserName={isIncoming ? "You (Vehicle Sharer)" : "You (Ride Seeker)"}
              role={isIncoming ? "driver" : "passenger"}
              partnerRole={isIncoming ? "Ride Seeker" : "Vehicle Sharer"}
              partnerId={
                isIncoming
                  ? booking.passenger_id
                  : (ride.provider_id || booking.rides?.provider_id || booking.ride?.provider_id)
              }
              partnerName={isIncoming ? (booking.passenger_name || "Ride Seeker") : (booking.driver_name || ride.provider_name || "Vehicle Sharer")}
              isAccepted={true}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="booking-actions">
        {isIncoming && isPending && onRespond && (
          <div className="response-btn-group">
            <button
              type="button"
              className="button button-primary button-small"
              onClick={() => onRespond(booking.id, "accept")}
              disabled={busy}
            >
              <Check size={14} /> Accept
            </button>
            <button
              type="button"
              className="button button-outline button-small danger-outline"
              onClick={() => onRespond(booking.id, "reject")}
              disabled={busy}
            >
              <X size={14} /> Reject
            </button>
          </div>
        )}

        {!isIncoming && isPending && onCancel && (
          <button
            type="button"
            className="button button-outline button-small"
            onClick={() => onCancel(booking.id)}
            disabled={busy}
          >
            Cancel Request
          </button>
        )}
      </div>
    </article>
  );
}
