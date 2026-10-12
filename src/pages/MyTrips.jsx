import { useState } from "react";
import BookingRow from "../components/BookingRow";
import RideCard from "../components/RideCard";
import { Car, Inbox, Send, RefreshCw, PlusCircle, AlertCircle } from "lucide-react";

export default function MyTrips({
  myRides = [],
  incomingBookings = [],
  myBookings = [],
  onBookingResponse,
  onCancelBooking,
  onRefresh,
  onOfferRideClick,
  user,
  busy,
  dataLoading,
}) {
  const pendingIncoming = incomingBookings.filter((b) => b.status === "pending");
  const [activeTab, setActiveTab] = useState(
    pendingIncoming.length > 0 ? "incoming" : "offered"
  );

  return (
    <div className="my-trips-page">
      <div className="trips-header-row">
        <div>
          <span className="eyebrow">YOUR TRIPS DASHBOARD</span>
          <h1>My Rides & Requests</h1>
          <p>Manage your offered rides, accept co-rider requests, and track your bookings.</p>
        </div>

        <button
          type="button"
          className="button button-outline"
          onClick={onRefresh}
          disabled={busy || dataLoading}
          aria-label="Refresh my trips and bookings"
        >
          <RefreshCw size={15} className={dataLoading ? "animate-spin" : ""} />
          <span>{dataLoading ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="trips-tab-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === "offered" ? "active" : ""}`}
          onClick={() => setActiveTab("offered")}
        >
          <Car size={16} />
          <span>Rides You Offer ({myRides.length})</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === "incoming" ? "active" : ""}`}
          onClick={() => setActiveTab("incoming")}
        >
          <Inbox size={16} />
          <span>Incoming Requests ({incomingBookings.length})</span>
          {pendingIncoming.length > 0 && (
            <span className="tab-pill-badge">{pendingIncoming.length} new</span>
          )}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === "bookings" ? "active" : ""}`}
          onClick={() => setActiveTab("bookings")}
        >
          <Send size={16} />
          <span>Your Bookings ({myBookings.length})</span>
        </button>
      </div>

      {/* Tab 1: Offered Rides */}
      {activeTab === "offered" && (
        <section className="trips-section-content">
          {myRides.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🚗</div>
              <h3>You haven't offered any rides yet</h3>
              <p>Planning a trip to Vijayawada, Guntur or campus? Offer a ride and split travel costs!</p>
              <button
                type="button"
                className="button button-primary"
                onClick={onOfferRideClick}
              >
                <PlusCircle size={15} /> Offer a Ride Now
              </button>
            </div>
          ) : (
            <div className="ride-grid">
              {myRides.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  isOwnRide={true}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Incoming Requests */}
      {activeTab === "incoming" && (
        <section className="trips-section-content">
          {incomingBookings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📬</div>
              <h3>No ride seeker requests yet</h3>
              <p>When students request seats on your offered rides, they'll appear here for approval.</p>
            </div>
          ) : (
            <div className="booking-list">
              {incomingBookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  type="incoming"
                  onRespond={onBookingResponse}
                  currentUser={user}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 3: My Bookings */}
      {activeTab === "bookings" && (
        <section className="trips-section-content">
          {myBookings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎒</div>
              <h3>You haven't requested any rides yet</h3>
              <p>Find rides going your way and request a seat with fellow SRM students.</p>
            </div>
          ) : (
            <div className="booking-list">
              {myBookings.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  type="outgoing"
                  onCancel={onCancelBooking}
                  currentUser={user}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
