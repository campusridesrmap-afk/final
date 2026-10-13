import { useState } from "react";
import BookingRow from "../components/BookingRow";
import RideCard from "../components/RideCard";
import { Car, Inbox, Send, RefreshCw, PlusCircle, AlertCircle } from "lucide-react";

export default function MyTrips({
  myRides = [],
  incomingBookings = [],
  myBookings = [],
  onBookingResponse,
  onWithdrawBooking,
  onCancelAcceptedBooking,
  onCancelSharing,
  onCompleteRide,
  onRefresh,
  onOfferRideClick,
  user,
  busy,
  dataLoading,
  tripsError = "",
}) {
  const pendingIncoming = incomingBookings.filter((b) => b.status === "pending");
  const [activeTab, setActiveTab] = useState(
    pendingIncoming.length > 0 ? "incoming" : "offered"
  );

  const hasAnyTrips = myRides.length > 0 || incomingBookings.length > 0 || myBookings.length > 0;

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

      {/* Background Revalidation Indicator */}
      {dataLoading && hasAnyTrips && (
        <div
          className="revalidating-notice"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.8rem",
            color: "var(--muted)",
            margin: "-8px 0 16px",
          }}
        >
          <RefreshCw size={12} className="animate-spin" />
          <span>Updating your trips in background...</span>
        </div>
      )}

      {/* Subtle Error Banner if refresh failed but cached data exists */}
      {tripsError && hasAnyTrips && (
        <div
          className="subtle-error-banner"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            padding: "10px 16px",
            marginBottom: "16px",
            fontSize: "0.875rem",
          }}
        >
          <span>Showing cached trips. Couldn't refresh data: {tripsError}</span>
          {onRefresh && (
            <button
              type="button"
              className="button button-outline"
              onClick={onRefresh}
              style={{ fontSize: "0.75rem", padding: "4px 8px", marginLeft: "12px" }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Blocking Error State if no cache and query failed */}
      {tripsError && !hasAnyTrips && (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          <div className="empty-icon">⚠️</div>
          <h3>Unable to load your trips</h3>
          <p>{tripsError}</p>
          {onRefresh && (
            <button
              type="button"
              className="button button-outline"
              onClick={onRefresh}
              style={{ marginTop: "12px" }}
            >
              <RefreshCw size={14} /> Try Again
            </button>
          )}
        </div>
      )}

      {/* Tabs Bar */}
      <div className="trips-tab-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === "offered" ? "active" : ""}`}
          onClick={() => setActiveTab("offered")}
          aria-label={`Rides You Offer (${myRides.length})`}
        >
          <Car size={16} />
          <span className="tab-text">Rides You Offer ({myRides.length})</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === "incoming" ? "active" : ""}`}
          onClick={() => setActiveTab("incoming")}
          aria-label={`Incoming Requests (${incomingBookings.length})`}
        >
          <Inbox size={16} />
          <span className="tab-text">Incoming Requests ({incomingBookings.length})</span>
          {pendingIncoming.length > 0 && (
            <span className="tab-pill-badge">{pendingIncoming.length} new</span>
          )}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === "bookings" ? "active" : ""}`}
          onClick={() => setActiveTab("bookings")}
          aria-label={`Your Bookings (${myBookings.length})`}
        >
          <Send size={16} />
          <span className="tab-text">Your Bookings ({myBookings.length})</span>
        </button>
      </div>

      {/* Sections Container - Desktop uses active tab, Mobile stacks all 3 vertically */}
      <div className="trips-sections-container">
        {/* Section 1: Rides You Offer */}
        <section className={`trips-section trips-section-offered ${activeTab === "offered" ? "tab-active" : ""}`}>
          <div className="mobile-section-header">
            <div className="mobile-section-title">
              <Car size={16} />
              <h2>Rides You Offer ({myRides.length})</h2>
            </div>
            {myRides.length > 0 && (
              <button
                type="button"
                className="button button-outline mobile-offer-quick-btn"
                onClick={onOfferRideClick}
                style={{ fontSize: "11px", padding: "3px 8px", minHeight: "28px" }}
              >
                + Offer
              </button>
            )}
          </div>

          <div className="trips-section-body">
            {dataLoading && myRides.length === 0 ? (
              <div className="empty-state">
                <div className="loading-spinner animate-spin" />
                <h3>Checking your offered rides...</h3>
                <p>Fetching scheduled trips from database.</p>
              </div>
            ) : myRides.length === 0 ? (
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
                    onCompleteRide={onCompleteRide}
                    onCancelSharing={onCancelSharing}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Incoming Requests */}
        <section className={`trips-section trips-section-incoming ${activeTab === "incoming" ? "tab-active" : ""}`}>
          <div className="mobile-section-header">
            <div className="mobile-section-title">
              <Inbox size={16} />
              <h2>Incoming Requests ({incomingBookings.length})</h2>
            </div>
            {pendingIncoming.length > 0 && (
              <span className="tab-pill-badge">{pendingIncoming.length} new</span>
            )}
          </div>

          <div className="trips-section-body">
            {dataLoading && incomingBookings.length === 0 ? (
              <div className="empty-state">
                <div className="loading-spinner animate-spin" />
                <h3>Checking incoming requests...</h3>
                <p>Fetching passenger requests from database.</p>
              </div>
            ) : incomingBookings.length === 0 ? (
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
                    onComplete={onCompleteRide}
                    currentUser={user}
                    busy={busy}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Your Bookings */}
        <section className={`trips-section trips-section-bookings ${activeTab === "bookings" ? "tab-active" : ""}`}>
          <div className="mobile-section-header">
            <div className="mobile-section-title">
              <Send size={16} />
              <h2>Your Bookings ({myBookings.length})</h2>
            </div>
          </div>

          <div className="trips-section-body">
            {dataLoading && myBookings.length === 0 ? (
              <div className="empty-state">
                <div className="loading-spinner animate-spin" />
                <h3>Checking your bookings...</h3>
                <p>Fetching your seat requests from database.</p>
              </div>
            ) : myBookings.length === 0 ? (
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
                    onWithdraw={onWithdrawBooking}
                    onCancelBooking={onCancelAcceptedBooking}
                    onComplete={onCompleteRide}
                    currentUser={user}
                    busy={busy}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

