import { Check, X, Clock, Users, Calendar, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import ContactShare from "./ContactShare";
import LiveLocationShare from "./LiveLocationShare";
import { formatDate, formatCost } from "./RideCard";

export default function BookingRow({
  booking,
  type = "incoming", // "incoming" (as driver) | "outgoing" (as passenger)
  onRespond, // (bookingId, 'accept' | 'reject')
  onWithdraw, // (bookingId) - for pending passenger requests
  onCancelBooking, // (bookingId) - for accepted passenger bookings
  onComplete, // (rideId) - available to both driver and accepted passenger
  currentUser,
  busy,
}) {
  const isIncoming = type === "incoming";
  const ride = booking.ride || booking.rides || {};

  const isRideCompleted = ride.status === "completed" || booking.status === "completed";
  const isRideCancelled = ride.status === "cancelled" || booking.status === "cancelled";
  const depTime = new Date(ride.departure_at).getTime();
  const isDeparturePassed = !isNaN(depTime) && depTime <= Date.now();
  const isExpired = booking.status === "expired" || (booking.status === "pending" && isDeparturePassed);

  const isAccepted = booking.status === "accepted" && !isRideCompleted && !isRideCancelled;
  const isPending = booking.status === "pending" && !isRideCompleted && !isRideCancelled && !isExpired;

  const pickup = booking.pickup_location || ride.from_location;
  const dropoff = booking.dropoff_location || ride.to_location;

  // Active contact & location sharing is only permitted for active accepted bookings on open rides
  const isSharingActive = isAccepted && (ride.status === "open" || !ride.status);

  const pricePerSeat = Number(ride.cost_per_seat) || 0;
  const seatsCount = Number(booking.seats_requested) || 1;
  const totalCost = pricePerSeat * seatsCount;

  return (
    <article className={`booking-row-card status-${isRideCompleted ? "completed" : isRideCancelled ? "cancelled" : isExpired ? "expired" : booking.status}`}>
      <div className="booking-main">
        <div className="booking-status-header">
          <div className="booking-route-title">
            <span className="route-endpoints">
              <strong>{pickup || "Start"}</strong>
              <ArrowRight size={14} className="route-arrow" />
              <strong>{dropoff || "Destination"}</strong>
            </span>
          </div>

          <span className={`status-pill status-${isRideCompleted ? "completed" : isRideCancelled ? "cancelled" : isExpired ? "expired" : booking.status}`}>
            {isPending && <Clock size={12} />}
            {isAccepted && <Check size={12} />}
            {isRideCompleted ? "Ride Ended" : isRideCancelled ? "Cancelled" : isExpired ? "Expired" : booking.status}
          </span>
        </div>

        <div className="booking-meta-line">
          <span className="meta-entry">
            <Calendar size={13} />
            {formatDate(ride.departure_at)}
          </span>
          <span className="meta-entry">
            <Users size={13} />
            {seatsCount} seat{seatsCount > 1 ? "s" : ""}
          </span>
          {ride.cost_per_seat != null && (
            <span className="meta-entry font-semibold booking-price-pill">
              <span className="cost-per-seat">
                {pricePerSeat === 0 ? "Free" : `₹${pricePerSeat.toLocaleString("en-IN")}/seat`}
              </span>
              <span className="cost-separator">•</span>
              <span className="cost-total">
                {pricePerSeat === 0
                  ? "Free ride"
                  : `Total: ₹${totalCost.toLocaleString("en-IN")} for ${seatsCount} seat${seatsCount > 1 ? "s" : ""}`}
              </span>
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

        {/* Contact details and Live Location - ONLY active when accepted and ride is open */}
        {isSharingActive ? (
          <div className="booking-contact-section">
            {isIncoming ? (
              <ContactShare profile={booking.passenger_profile} role="Ride Seeker" isSharingActive={true} />
            ) : (
              <ContactShare profile={booking.driver_profile} role="Vehicle Sharer" isSharingActive={true} />
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
              rideStatus="open"
            />
          </div>
        ) : isExpired ? (
          <div className="sharing-ended-banner expired">
            <AlertCircle size={14} />
            <span>Request expired: Ride departure deadline passed before confirmation.</span>
          </div>
        ) : isRideCompleted ? (
          <div className="sharing-ended-banner completed">
            <ShieldCheck size={14} />
            <span>Ride completed. Contact details and live location sharing have been securely closed.</span>
          </div>
        ) : isRideCancelled ? (
          <div className="sharing-ended-banner cancelled">
            <AlertCircle size={14} />
            <span>Ride cancelled. Contact details and live location sharing are closed.</span>
          </div>
        ) : null}
      </div>

      {/* Action buttons */}
      <div className="booking-actions">
        {/* Incoming (Driver) Actions */}
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

        {isIncoming && isAccepted && onComplete && (
          <button
            type="button"
            className="button button-primary button-small"
            onClick={() => onComplete(booking.ride_id || ride.id)}
            disabled={busy}
          >
            Complete Ride
          </button>
        )}

        {/* Outgoing (Passenger) Actions */}
        {!isIncoming && isPending && onWithdraw && (
          <button
            type="button"
            className="button button-outline button-small danger-outline"
            onClick={() => onWithdraw(booking.id)}
            disabled={busy}
          >
            Withdraw Request
          </button>
        )}

        {!isIncoming && isAccepted && (
          <div className="response-btn-group">
            {onComplete && (
              <button
                type="button"
                className="button button-primary button-small"
                onClick={() => onComplete(booking.ride_id || ride.id)}
                disabled={busy}
              >
                Complete Ride
              </button>
            )}
            {onCancelBooking && (
              <button
                type="button"
                className="button button-outline button-small danger-outline"
                onClick={() => onCancelBooking(booking.id)}
                disabled={busy}
              >
                Cancel Booking
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

