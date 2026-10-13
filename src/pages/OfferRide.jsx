import { useState, useEffect } from "react";
import RouteStopsEditor from "../components/RouteStopsEditor";
import { fetchRoute, formatDistance, formatDuration } from "../lib/routeMatching";
import {
  Calendar,
  Clock,
  ShieldCheck,
} from "lucide-react";

export default function OfferRide({
  onSubmitRide,
  user,
  busy,
  onNavigateAuth,
}) {
  // Initial empty route: user manually enters/selects pickup and destination
  const [stops, setStops] = useState([
    {
      name: "",
      label: "",
      lat: null,
      lng: null,
      order_index: 0,
    },
    {
      name: "",
      label: "",
      lat: null,
      lng: null,
      order_index: 1,
    },
  ]);

  const [departureAt, setDepartureAt] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [availableSeats, setAvailableSeats] = useState("");
  const [costPerSeat, setCostPerSeat] = useState("");

  const [routeData, setRouteData] = useState(null);
  const [formError, setFormError] = useState("");

  // Whenever valid coordinates exist for waypoints, calculate driving estimates in the background
  useEffect(() => {
    const validWaypoints = stops.filter((s) => s.lat != null && s.lng != null);

    let cancelled = false;
    const controller = new AbortController();

    if (validWaypoints.length < 2) {
      Promise.resolve().then(() => {
        if (!cancelled) setRouteData(null);
      });
      return () => {
        cancelled = true;
      };
    }

    fetchRoute(validWaypoints, controller.signal)
      .then((data) => {
        if (!cancelled) setRouteData(data);
      })
      .catch(() => {
        if (!cancelled) setRouteData(null);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [stops]);

  function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!user) {
      onNavigateAuth();
      return;
    }

    const origin = stops[0];
    const destination = stops[stops.length - 1];

    if (!origin.name || !origin.name.trim()) {
      setFormError("Please provide a starting pickup location.");
      return;
    }

    if (!destination.name || !destination.name.trim()) {
      setFormError("Please provide a destination dropoff location.");
      return;
    }

    const depDate = new Date(departureAt);
    if (isNaN(depDate.getTime()) || depDate <= new Date()) {
      setFormError("Please select a future departure date and time.");
      return;
    }

    if (!vehicleType) {
      setFormError("Please select a vehicle type.");
      return;
    }

    if (vehicleType === "Bike") {
      // Bike is fixed to 1 seat
    } else {
      if (!availableSeats) {
        setFormError("Please select number of seats.");
        return;
      }
    }

    const seatsNum = vehicleType === "Bike" ? 1 : Number(availableSeats);
    if (isNaN(seatsNum) || seatsNum < 1 || seatsNum > 7) {
      setFormError(
        `For ${vehicleType}, available seats must be between 1 and 7.`
      );
      return;
    }

    if (costPerSeat.trim() === "") {
      setFormError("Please enter the price per seat (enter 0 for a free ride).");
      return;
    }

    const costNum = Number(costPerSeat);
    if (isNaN(costNum) || costNum < 0) {
      setFormError("Please enter a valid price per seat (0 or greater).");
      return;
    }

    // Submit payload
    onSubmitRide({
      from_location: origin.name.trim(),
      to_location: destination.name.trim(),
      departure_at: depDate.toISOString(),
      vehicle_type: vehicleType,
      available_seats: seatsNum,
      cost_per_seat: costNum,
      stops: stops.filter((s) => s.name.trim().length > 0),
      pickup_coords: origin.lat && origin.lng ? { lat: origin.lat, lng: origin.lng } : null,
      destination_coords:
        destination.lat && destination.lng
          ? { lat: destination.lat, lng: destination.lng }
          : null,
      route_geometry: routeData?.geometry || [],
    });
  }

  const [minDateTime] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  );

  return (
    <div className="offer-ride-page">
      <div className="form-heading">
        <span className="eyebrow">SRM-AP RIDESHARE</span>
        <h1>Offer a Ride</h1>
        <p>
          Share your daily commute or weekend journey with fellow students. Add via stops
          so co-riders along your path can easily join!
        </p>

        {routeData && (
          <div className="route-stat-callout">
            <div className="stat-unit">
              <span>Estimated Trip Distance</span>
              <strong>{formatDistance(routeData.distance)}</strong>
            </div>
            <div className="stat-unit">
              <span>Estimated Drive Time</span>
              <strong>{formatDuration(routeData.duration)}</strong>
            </div>
            <div className="stat-unit">
              <span>Total Stops</span>
              <strong>{stops.length} stops</strong>
            </div>
          </div>
        )}
      </div>

      <div className="offer-layout-grid">
        <form className="form-card offer-card" onSubmit={handleSubmit}>
          <h2>Trip Details & Stops</h2>

          {formError && <div className="notice notice-error">{formError}</div>}

          {/* Route Stops Editor with + Add via button */}
          <RouteStopsEditor
            stops={stops}
            onChangeStops={setStops}
          />

          {/* Departure Date & Time */}
          <div className="field">
            <label className="field-label">
              <Calendar size={15} /> Departure Date & Time
            </label>
            <input
              type="datetime-local"
              required
              min={minDateTime}
              value={departureAt}
              onChange={(e) => setDepartureAt(e.target.value)}
            />

            {/* Booking Deadline Notice */}
            <div className="booking-deadline-notice">
              <div className="deadline-notice-header">
                <Clock size={14} className="deadline-notice-icon" />
                <strong>Booking Deadline</strong>
              </div>
              <p>
                Seat requests close automatically at your selected departure time. After this time, no new passengers can request or book seats for this ride.
              </p>
              <p className="deadline-notice-sub">
                Please choose your departure time carefully.
              </p>
            </div>
          </div>

          {/* Vehicle & Seats Row */}
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="vehicle-type-select">Vehicle Type</label>
              <select
                id="vehicle-type-select"
                required
                value={vehicleType}
                onChange={(e) => {
                  const newType = e.target.value;
                  setVehicleType(newType);
                  if (newType === "Bike") {
                    setAvailableSeats("1");
                  } else {
                    // For Car, Auto, or unselected: clear seats so old selection is never carried over
                    setAvailableSeats("");
                  }
                }}
              >
                <option value="">Select vehicle type</option>
                <option value="Car">Car 🚗</option>
                <option value="Auto">Auto 🛺</option>
                <option value="Bike">Motorcycle / Scooter 🏍️</option>
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="available-seats-select">
                {vehicleType === "Car" || vehicleType === "Auto"
                  ? "Select number of seats"
                  : "Available Seats"}
              </label>
              <select
                id="available-seats-select"
                required
                value={availableSeats}
                onChange={(e) => setAvailableSeats(e.target.value)}
                disabled={!vehicleType || vehicleType === "Bike"}
              >
                {!vehicleType ? (
                  <option value="">Select vehicle type first</option>
                ) : vehicleType === "Bike" ? (
                  <option value="1">1 seat</option>
                ) : (
                  <>
                    <option value="">Select number of seats</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((seat) => (
                      <option key={seat} value={seat}>
                        {seat} {seat === 1 ? "seat" : "seats"}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Cost per seat */}
          <div className="field">
            <label className="field-label" htmlFor="cost-per-seat-input">Cost Share Per Seat (₹)</label>
            <input
              id="cost-per-seat-input"
              type="number"
              min="0"
              max="5000"
              step="5"
              required
              value={costPerSeat}
              onChange={(e) => setCostPerSeat(e.target.value)}
              placeholder="Enter price per seat"
            />
            <small className="field-help-text">
              Fair travel cost contribution per ride seeker. Free rides encourage quick pickups!
            </small>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            className="button button-primary button-full submit-ride-btn"
            disabled={busy}
          >
            {busy ? "Publishing Ride..." : "Publish SRM Ride"}
          </button>
        </form>

        {/* Safety & Guidelines Sidebar */}
        <aside className="offer-sidebar">
          <div className="safety-card">
            <div className="safety-icon-box">
              <ShieldCheck size={26} />
            </div>
            <h3>SRM-AP Community Guidelines</h3>
            <ul className="guidelines-list">
              <li>
                <strong>Student-only rides:</strong> Verify co-riders & ride seekers using their SRM registration number.
              </li>
              <li>
                <strong>Via stops pickup:</strong> Coordinate exact pickup points along your route with co-riders.
              </li>
              <li>
                <strong>Shared travel expenses:</strong> Cost is strictly for splitting ride and toll expenses, not commercial profit.
              </li>
              <li>
                <strong>Safety first:</strong> Helmets for bike rides and seatbelts for cars are mandatory.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
