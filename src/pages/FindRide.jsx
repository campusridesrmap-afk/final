import { useState, useMemo } from "react";
import LocationAutocomplete from "../components/LocationAutocomplete";
import RideCard from "../components/RideCard";
import { findMatchingStops } from "../lib/routeMatching";
import {
  Clock,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export default function FindRide({
  rides,
  onBookRide,
  user,
  authLoading = false,
  requestedRideIds,
  userBookings = {},
  busy,
  dataLoading,
  ridesError = "",
  errorMessage = "",
  onRefresh,
  onOfferRideClick,
}) {
  const [pickupText, setPickupText] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [activeLocationField, setActiveLocationField] = useState(null);

  const [vehicleFilter, setVehicleFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");

  function handleSelectPickup(place) {
    setPickupText(place.name || place.label || "");
    if (place.lat && place.lng) {
      setPickupCoords({ lat: place.lat, lng: place.lng, name: place.name });
    }
  }

  function handleSelectDropoff(place) {
    setDropoffText(place.name || place.label || "");
    if (place.lat && place.lng) {
      setDropoffCoords({ lat: place.lat, lng: place.lng, name: place.name });
    }
  }

  function handleResetFilters() {
    setPickupText("");
    setDropoffText("");
    setPickupCoords(null);
    setDropoffCoords(null);
    setVehicleFilter("All");
    setDateFilter("");
    setActiveLocationField(null);
  }

  // Filter & Route Match Rides
  const matchedRides = useMemo(() => {
    const pTerm = pickupText.trim().toLowerCase();
    const dTerm = dropoffText.trim().toLowerCase();

    return rides
      .map((ride) => {
        let matchDetails = null;

        // Route matching algorithm if user specified both pickup and dropoff coordinates
        if (pickupCoords && dropoffCoords && Array.isArray(ride.stops) && ride.stops.length >= 2) {
          matchDetails = findMatchingStops(
            pickupCoords,
            dropoffCoords,
            ride.stops,
            8 // 8 km proximity threshold for Vijayawada/Guntur region
          );
        }

        // Text match score
        const fromStr = (ride.from_location || "").toLowerCase();
        const toStr = (ride.to_location || "").toLowerCase();

        const pickupMatches = !pTerm || fromStr.includes(pTerm) || (matchDetails != null);
        const dropoffMatches = !dTerm || toStr.includes(dTerm) || (matchDetails != null);

        const vehicleMatches =
          vehicleFilter === "All" ||
          (ride.vehicle_type || "").trim().toLowerCase() === vehicleFilter.trim().toLowerCase();

        let dateMatches = true;
        if (dateFilter) {
          const rideDate = new Date(ride.departure_at).toISOString().split("T")[0];
          dateMatches = rideDate === dateFilter;
        }

        const isVisible = pickupMatches && dropoffMatches && vehicleMatches && dateMatches;

        return {
          ...ride,
          matchDetails,
          isVisible,
        };
      })
      .filter((r) => r.isVisible)
      .sort((a, b) => {
        // Boost segment-matched rides to the top
        if (a.matchDetails && !b.matchDetails) return -1;
        if (!a.matchDetails && b.matchDetails) return 1;
        return new Date(a.departure_at) - new Date(b.departure_at);
      });
  }, [rides, pickupText, dropoffText, pickupCoords, dropoffCoords, vehicleFilter, dateFilter]);

  // Segregate active upcoming rides from expired rides (departure time passed)
  const { activeUpcomingRides, expiredRides } = useMemo(() => {
    const now = Date.now();
    const active = [];
    const expired = [];
    matchedRides.forEach((r) => {
      const depTime = new Date(r.departure_at).getTime();
      if (!isNaN(depTime) && depTime <= now) {
        // Expired trip: departure time reached or passed (not cancelled or completed)
        if (r.status !== "cancelled" && r.status !== "completed") {
          expired.push(r);
        }
      } else {
        // Active upcoming trip: departure time in future and status is open/active
        if (r.status === "open" || !r.status || r.status === "active") {
          active.push(r);
        }
      }
    });

    // Sort expired trips in descending departure-time order (newest / most recent departure first)
    expired.sort((a, b) => {
      const timeA = new Date(a.departure_at).getTime() || 0;
      const timeB = new Date(b.departure_at).getTime() || 0;
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });

    return { activeUpcomingRides: active, expiredRides: expired };
  }, [matchedRides]);

  return (
    <div className="find-ride-page">
      {/* Hero Banner */}
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">SRM UNIVERSITY-AP CARPOOLING</span>
          <h1>
            Share rides. <span>Split costs.</span> Commute smarter.
          </h1>
          <p>
            Find fellow students heading your way across Vijayawada, Guntur, Mangalagiri,
            Tadepalli, and campus gates.
          </p>

          <div className="hero-stats-row">
            <div className="stat-pill">
              <strong>{activeUpcomingRides.length}</strong> active rides
            </div>
            <div className="stat-pill">
              <strong>100%</strong> campus community
            </div>
            <div className="stat-pill">
              <strong>₹0</strong> booking fees
            </div>
          </div>
        </div>

        <div className="hero-art">
          <div className="hero-circle">
            <span className="hero-emoji">🚗</span>
          </div>
          <div className="orbit" />
          <div className="orbit orbit-two" />
          <div className="float-chip chip-top">SRM ⇄ Vijayawada</div>
          <div className="float-chip chip-bottom">SRM ⇄ Guntur</div>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section className="search-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SEARCH TRIPS</span>
            <h2>Upcoming Campus Rides</h2>
            <p>Search by starting point, via stops, or destination.</p>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={onRefresh}
              disabled={dataLoading}
              aria-label="Refresh available rides"
            >
              <RefreshCw size={15} className={dataLoading ? "animate-spin" : ""} />
              <span>{dataLoading ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Filter Card */}
        <div className="search-filter-card">
          <div className="search-inputs-grid">
            <LocationAutocomplete
              fieldId="pickup"
              activeField={activeLocationField}
              onSetActiveField={setActiveLocationField}
              label="From (Pickup)"
              value={pickupText}
              placeholder="e.g. SRM University - AP or Vijayawada"
              onChange={(val) => {
                setPickupText(val);
                setPickupCoords(null);
              }}
              onSelect={handleSelectPickup}
              showQuickChips={false}
            />

            <LocationAutocomplete
              fieldId="destination"
              activeField={activeLocationField}
              onSetActiveField={setActiveLocationField}
              label="To (Dropoff)"
              value={dropoffText}
              placeholder="e.g. Guntur or PNBS Bus Stand"
              onChange={(val) => {
                setDropoffText(val);
                setDropoffCoords(null);
              }}
              onSelect={handleSelectDropoff}
              showQuickChips={false}
            />

            <div className="filter-item">
              <label className="field-label">Vehicle</label>
              <select
                className="select-input"
                value={vehicleFilter}
                onChange={(e) => setVehicleFilter(e.target.value)}
              >
                <option value="All">All vehicles</option>
                <option value="Car">Cars only</option>
                <option value="Auto">Autos only</option>
                <option value="Bike">Bikes only</option>
              </select>
            </div>

            <div className="filter-item">
              <label className="field-label">Date</label>
              <input
                type="date"
                className="date-input"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
          </div>

          {(pickupText || dropoffText || vehicleFilter !== "All" || dateFilter) && (
            <div className="active-filters-bar">
              <span>Filtering results</span>
              <button
                type="button"
                className="reset-filters-btn"
                onClick={handleResetFilters}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Results Stream */}
        <div className="results-header">
          <span className="results-count">
            Showing <strong>{activeUpcomingRides.length}</strong> active ride{activeUpcomingRides.length === 1 ? "" : "s"}
          </span>
          {pickupCoords && dropoffCoords && (
            <span className="route-matching-active-badge">
              <Sparkles size={13} /> Multi-stop matching enabled
            </span>
          )}
        </div>

        {dataLoading && rides.length === 0 ? (
          <div className="empty-state">
            <div className="loading-spinner animate-spin" />
            <h3>Checking for rides...</h3>
            <p>Fetching scheduled trips from database.</p>
          </div>
        ) : ridesError && rides.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h3>Unable to load rides</h3>
            <p>{ridesError}</p>
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
        ) : (
          <>
            {ridesError && rides.length > 0 && (
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
                <span>{ridesError}</span>
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
            {activeUpcomingRides.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🚗</div>
                <h3>No active rides found</h3>
                <p>
                  Nobody is offering an upcoming ride for this route or date yet. Be the first to share a trip!
                </p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={onOfferRideClick}
                >
                  + Offer a Ride Now
                </button>
              </div>
            ) : (
              <div className="ride-grid">
                {activeUpcomingRides.map((ride) => (
                  <RideCard
                    key={ride.id}
                    ride={ride}
                    onBook={onBookRide}
                    isRequested={requestedRideIds?.has(ride.id)}
                    bookingStatus={userBookings?.[ride.id]?.status || null}
                    isOwnRide={ride.provider_id === user?.id}
                    user={user}
                    authLoading={authLoading}
                    busy={busy}
                    matchDetails={ride.matchDetails}
                  />
                ))}
              </div>
            )}

            {/* Separate section for expired / departed rides */}
            <div className="past-rides-section">
              <div className="past-rides-header">
                <Clock size={15} />
                <span className="past-rides-title">Expired Trips ({expiredRides.length})</span>
                <span className="past-rides-badge">Booking closed • Departure time passed</span>
                {dataLoading && (
                  <span
                    className="revalidating-badge"
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--muted)",
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <RefreshCw size={11} className="animate-spin" /> Revalidating...
                  </span>
                )}
              </div>

              {ridesError && expiredRides.length > 0 && (
                <div
                  className="subtle-error-banner"
                  style={{
                    margin: "8px 0 14px",
                    padding: "8px 12px",
                    fontSize: "0.8rem",
                    background: "#fffbeb",
                    color: "#92400e",
                    borderRadius: "6px",
                    border: "1px solid #fde68a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Showing cached expired trips. Couldn't refresh data.</span>
                  {onRefresh && (
                    <button
                      type="button"
                      onClick={onRefresh}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#92400e",
                        textDecoration: "underline",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              {dataLoading && rides.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 16px", minHeight: "90px" }}>
                  <div
                    className="loading-spinner animate-spin"
                    style={{ width: "18px", height: "18px", borderWidth: "2px" }}
                  />
                  <p style={{ margin: "8px 0 0", fontSize: "0.825rem", color: "var(--muted)" }}>
                    Checking for past trips...
                  </p>
                </div>
              ) : ridesError && expiredRides.length === 0 ? (
                <div className="empty-state" style={{ padding: "18px 16px", minHeight: "80px" }}>
                  <p style={{ color: "var(--red)", fontSize: "0.85rem", margin: 0 }}>
                    Unable to load expired trips ({ridesError}).
                  </p>
                </div>
              ) : expiredRides.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 16px", minHeight: "80px", textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted)" }}>No expired trips found.</p>
                </div>
              ) : (
                <div className="expired-rides-scroll-container">
                  <div className="expired-rides-row">
                    {expiredRides.map((ride) => (
                      <div key={ride.id} className="expired-ride-card-wrapper">
                        <RideCard
                          ride={ride}
                          onBook={onBookRide}
                          isRequested={requestedRideIds?.has(ride.id)}
                          bookingStatus={userBookings?.[ride.id]?.status || null}
                          isOwnRide={ride.provider_id === user?.id}
                          user={user}
                          authLoading={authLoading}
                          busy={busy}
                          matchDetails={ride.matchDetails}
                          isExpired={true}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
