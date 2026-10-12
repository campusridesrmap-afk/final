import { useState, useMemo } from "react";
import LocationAutocomplete from "../components/LocationAutocomplete";
import RideCard from "../components/RideCard";
import { findMatchingStops } from "../lib/routeMatching";
import {
  RefreshCw,
  Sparkles,
} from "lucide-react";

export default function FindRide({
  rides,
  onBookRide,
  user,
  requestedRideIds,
  busy,
  dataLoading,
  onRefresh,
  onOfferRideClick,
}) {
  const [pickupText, setPickupText] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);

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
              <strong>{rides.length}</strong> active rides
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
            Showing <strong>{matchedRides.length}</strong> ride{matchedRides.length === 1 ? "" : "s"}
          </span>
          {pickupCoords && dropoffCoords && (
            <span className="route-matching-active-badge">
              <Sparkles size={13} /> Multi-stop matching enabled
            </span>
          )}
        </div>

        {dataLoading ? (
          <div className="empty-state">
            <div className="loading-spinner animate-spin" />
            <h3>Checking for rides...</h3>
            <p>Fetching scheduled trips from database.</p>
          </div>
        ) : matchedRides.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🚗</div>
            <h3>No matching rides found</h3>
            <p>
              Nobody is offering a ride for this route or date yet. Be the first to share a trip!
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
            {matchedRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                onBook={onBookRide}
                isRequested={requestedRideIds.has(ride.id)}
                isOwnRide={ride.provider_id === user?.id}
                user={user}
                busy={busy}
                matchDetails={ride.matchDetails}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
