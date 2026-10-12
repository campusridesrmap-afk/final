import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import Navbar from "./components/Navbar";
import ProfileOnboarding from "./components/ProfileOnboarding";
import PasswordSetupModal from "./components/PasswordSetupModal";
import FindRide from "./pages/FindRide";
import OfferRide from "./pages/OfferRide";
import MyTrips from "./pages/MyTrips";
import AuthPage from "./pages/AuthPage";
import "./App.css";

function getErrorMessage(error) {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code === "23505") return "You have already requested this ride.";
  return error.message || "Something went wrong. Please try again.";
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("find");

  const [profile, setProfile] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordSetupModal, setShowPasswordSetupModal] = useState(false);
  const [passwordSetupMode, setPasswordSetupMode] = useState("first_login");

  const [rides, setRides] = useState([]);
  const [myRides, setMyRides] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [incomingBookings, setIncomingBookings] = useState([]);
  const [requestedRideIds, setRequestedRideIds] = useState(new Set());

  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  const user = session?.user ?? null;

  // Initialize Supabase Auth listener
  useEffect(() => {
    let alive = true;

    async function initAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error) setErrorMessage(getErrorMessage(error));
        setSession(data?.session ?? null);
      } catch (err) {
        if (alive) setErrorMessage(getErrorMessage(err));
      } finally {
        if (alive) setAuthLoading(false);
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load user profile details
  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, registration_number, mobile_number, profile_completed, must_change_password")
        .eq("id", userId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.warn("Profile load warning:", error.message);
      }

      if (data) {
        setProfile(data);
        return data;
      } else {
        // Fallback profile skeleton
        const fallback = {
          id: userId,
          full_name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "SRM Student",
          registration_number: "",
          mobile_number: "",
          profile_completed: false,
        };
        setProfile(fallback);
        return fallback;
      }
    } catch (err) {
      console.warn("Failed to load profile:", err);
      return null;
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      loadProfile(user.id).then((prof) => {
        if (prof?.must_change_password) {
          setPasswordSetupMode("first_login");
          setShowPasswordSetupModal(true);
        }
      });
    } else {
      setProfile(null);
    }
  }, [user?.id, loadProfile]);

  // Load active rides
  const loadRides = useCallback(async () => {
    setDataLoading(true);
    try {
      // Allow up to 2-hour grace window so recently scheduled rides don't vanish during testing
      const graceTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("status", "open")
        .gte("departure_at", graceTime)
        .gt("available_seats", 0)
        .order("departure_at", { ascending: true });

      if (error) throw error;

      const rawRides = data ?? [];
      console.log("CampusRide: Loaded active rides from DB:", rawRides);

      // Fetch provider names if available
      const providerIds = [...new Set(rawRides.map((r) => r.provider_id))];
      let profilesMap = {};

      if (providerIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, mobile_number, registration_number")
          .in("id", providerIds);

        (profs || []).forEach((p) => {
          profilesMap[p.id] = p;
        });
      }

      setRides(
        rawRides.map((r) => ({
          ...r,
          provider_name: profilesMap[r.provider_id]?.full_name || "SRM Student",
          provider_profile: profilesMap[r.provider_id] || null,
        }))
      );
    } catch (error) {
      console.error("Failed to load rides:", error);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Load user trips & bookings
  const loadMyTrips = useCallback(async () => {
    if (!user) {
      setMyRides([]);
      setMyBookings([]);
      setIncomingBookings([]);
      setRequestedRideIds(new Set());
      return;
    }

    try {
      // 1. My offered rides
      const { data: ownRides, error: ridesErr } = await supabase
        .from("rides")
        .select("*")
        .eq("provider_id", user.id)
        .order("departure_at", { ascending: true });

      if (ridesErr) throw ridesErr;
      const myRidesList = ownRides ?? [];
      setMyRides(myRidesList);

      // 2. My bookings as passenger
      const { data: bookingsData, error: bookingsErr } = await supabase
        .from("bookings")
        .select("*, rides(*)")
        .eq("passenger_id", user.id)
        .order("created_at", { ascending: false });

      if (bookingsErr) throw bookingsErr;
      const myBookingsList = bookingsData ?? [];

      // Fetch driver profiles for accepted bookings
      const driverIds = [
        ...new Set(
          myBookingsList
            .map((b) => b.rides?.provider_id)
            .filter(Boolean)
        ),
      ];

      let driverProfilesMap = {};
      if (driverIds.length > 0) {
        const { data: driverProfs } = await supabase
          .from("profiles")
          .select("id, full_name, mobile_number, registration_number")
          .in("id", driverIds);

        (driverProfs || []).forEach((p) => {
          driverProfilesMap[p.id] = p;
        });
      }

      setMyBookings(
        myBookingsList.map((b) => ({
          ...b,
          driver_name: driverProfilesMap[b.rides?.provider_id]?.full_name || "Vehicle Sharer",
          driver_profile: driverProfilesMap[b.rides?.provider_id] || null,
        }))
      );

      setRequestedRideIds(new Set(myBookingsList.map((b) => b.ride_id)));

      // 3. Incoming booking requests for my rides
      if (myRidesList.length === 0) {
        setIncomingBookings([]);
        return;
      }

      const ownRideIds = myRidesList.map((r) => r.id);
      const { data: requests, error: requestsErr } = await supabase
        .from("bookings")
        .select("*")
        .in("ride_id", ownRideIds)
        .neq("passenger_id", user.id)
        .order("created_at", { ascending: false });

      if (requestsErr) throw requestsErr;
      const incomingList = requests ?? [];

      // Fetch passenger profiles
      const passengerIds = [...new Set(incomingList.map((b) => b.passenger_id))];
      let passengerProfilesMap = {};

      if (passengerIds.length > 0) {
        const { data: passengerProfs } = await supabase
          .from("profiles")
          .select("id, full_name, mobile_number, registration_number")
          .in("id", passengerIds);

        (passengerProfs || []).forEach((p) => {
          passengerProfilesMap[p.id] = p;
        });
      }

      const ridesById = Object.fromEntries(myRidesList.map((r) => [r.id, r]));

      setIncomingBookings(
        incomingList.map((b) => ({
          ...b,
          passenger_name: passengerProfilesMap[b.passenger_id]?.full_name || "SRM Student",
          passenger_profile: passengerProfilesMap[b.passenger_id] || null,
          ride: ridesById[b.ride_id] || null,
        }))
      );
    } catch (error) {
      console.error("Failed to load trips:", error);
      setErrorMessage(getErrorMessage(error));
    }
  }, [user]);

  // Refresh all active rides and user trips with tactile feedback
  const handleRefresh = useCallback(async () => {
    setDataLoading(true);
    setNotice("");
    try {
      await Promise.all([loadRides(), loadMyTrips()]);
      setNotice("Latest rides and trips refreshed!");
      setTimeout(() => {
        setNotice("");
      }, 2500);
    } catch (err) {
      console.error("Refresh error:", err);
      setErrorMessage("Failed to refresh. Please check your connection.");
    } finally {
      // Keep loading spinner visible briefly for tactile feedback
      setTimeout(() => {
        setDataLoading(false);
      }, 500);
    }
  }, [loadRides, loadMyTrips]);

  // Initial load
  useEffect(() => {
    if (!authLoading) {
      loadRides();
      loadMyTrips();
    }
  }, [authLoading, loadRides, loadMyTrips]);

  // Ensure user profile in database
  const ensureProfile = useCallback(async (currentUser, name = "") => {
    if (!currentUser?.id) return;
    const fallbackName =
      name.trim() ||
      currentUser.user_metadata?.full_name ||
      currentUser.email?.split("@")[0] ||
      "SRM Student";

    await supabase.from("profiles").upsert(
      {
        id: currentUser.id,
        full_name: fallbackName,
      },
      { onConflict: "id" }
    );
  }, []);

  // Auth: Login
  async function handleLogin({ email, password }) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Login failed.");

      await ensureProfile(data.user);
      const userProf = await loadProfile(data.user.id);

      setNotice("Login successful. Welcome to CampusRide SRM-AP!");
      setPage("find");

      // Direct users to mandatory password setup on first login
      if (userProf?.must_change_password) {
        setPasswordSetupMode("first_login");
        setShowPasswordSetupModal(true);
      } else if (!userProf?.profile_completed || !userProf?.mobile_number) {
        setShowProfileModal(true);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Auth: Sign Up
  async function handleSignUp({ email, password, fullName }) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        await ensureProfile(data.user, fullName);
        await loadProfile(data.user.id);
      }

      setNotice("Account created successfully! Welcome to CampusRide SRM-AP.");
      setPage("find");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Auth: Logout
  async function handleLogout() {
    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setProfile(null);
      setPage("find");
      setNotice("You have successfully signed out.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Ride: Offer Ride
  async function handleOfferRide(ridePayload) {
    if (!user) {
      setPage("auth");
      setErrorMessage("Please log in to publish a ride.");
      return;
    }

    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      await ensureProfile(user);

      const insertData = {
        provider_id: user.id,
        from_location: ridePayload.from_location,
        to_location: ridePayload.to_location,
        departure_at: ridePayload.departure_at,
        vehicle_type: ridePayload.vehicle_type,
        available_seats: ridePayload.available_seats,
        total_seats: ridePayload.available_seats,
        cost_per_seat: ridePayload.cost_per_seat,
        stops: ridePayload.stops,
        pickup_coords: ridePayload.pickup_coords,
        destination_coords: ridePayload.destination_coords,
        route_geometry: ridePayload.route_geometry,
        status: "open",
      };

      const { error } = await supabase.from("rides").insert(insertData);
      if (error) throw error;

      setNotice("Ride published successfully! Students along your path can now request seats.");
      setPage("find");

      await loadRides();
      await loadMyTrips();
    } catch (error) {
      console.error("Failed to offer ride:", error);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Ride: Book / Request Seat
  async function handleBookRide(ride, seatsRequested = 1, matchDetails = null) {
    if (!user) {
      setPage("auth");
      setErrorMessage("Please log in to book a seat.");
      return;
    }

    if (requestedRideIds.has(ride.id)) {
      setNotice("You have already requested this ride.");
      return;
    }

    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      await ensureProfile(user);

      const pickupLoc = matchDetails?.pickupStop?.name || ride.from_location;
      const dropoffLoc = matchDetails?.dropoffStop?.name || ride.to_location;

      const bookingData = {
        ride_id: ride.id,
        passenger_id: user.id,
        seats_requested: seatsRequested,
        status: "pending",
        pickup_location: pickupLoc,
        dropoff_location: dropoffLoc,
        pickup_stop_index: matchDetails?.pickupStopIndex ?? 0,
        dropoff_stop_index:
          matchDetails?.dropoffStopIndex ??
          (Array.isArray(ride.stops) && ride.stops.length > 1 ? ride.stops.length - 1 : 1),
      };

      const { error } = await supabase.from("bookings").insert(bookingData);
      if (error) throw error;

      setNotice(`Seat request sent to the vehicle sharer for ${pickupLoc} → ${dropoffLoc}.`);
      await loadMyTrips();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Ride: Respond to incoming booking (Accept or Reject)
  async function handleBookingResponse(bookingId, action) {
    const isAccept = action === "accept";
    const promptText = `Are you sure you want to ${isAccept ? "accept" : "reject"} this ride seeker request?`;
    if (!window.confirm(promptText)) return;

    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      // 1. Try Supabase RPC first
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "process_booking_response",
        {
          p_booking_id: bookingId,
          p_response: action,
        }
      );

      // 2. If RPC fails or is missing, fallback to direct table updates safely
      if (rpcError) {
        console.warn("RPC call failed, applying fallback direct update:", rpcError.message);
        const nextStatus = isAccept ? "accepted" : "rejected";

        const { error: bookingUpdateErr } = await supabase
          .from("bookings")
          .update({ status: nextStatus })
          .eq("id", bookingId);

        if (bookingUpdateErr) throw bookingUpdateErr;

        if (isAccept) {
          const booking = incomingBookings.find((b) => b.id === bookingId);
          if (booking?.ride_id) {
            const currentRide = rides.find((r) => r.id === booking.ride_id) || booking.ride;
            if (currentRide && currentRide.available_seats > 0) {
              await supabase
                .from("rides")
                .update({
                  available_seats: Math.max(0, currentRide.available_seats - (booking.seats_requested || 1)),
                })
                .eq("id", booking.ride_id);
            }
          }
        }
      }

      setNotice(`Booking request ${isAccept ? "accepted" : "rejected"}. Contact details shared!`);
      await loadMyTrips();
      await loadRides();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Ride: Cancel my booking request
  async function handleCancelBooking(bookingId) {
    if (!window.confirm("Are you sure you want to cancel this seat request?")) return;

    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId);

      if (error) throw error;

      setNotice("Seat request cancelled.");
      await loadMyTrips();
      await loadRides();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function handleNavigate(nextPage) {
    setNotice("");
    setErrorMessage("");

    if (["offer", "trips"].includes(nextPage) && !user) {
      setPage("auth");
      setNotice("Please log in to continue.");
      return;
    }

    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (authLoading) {
    return (
      <main className="loading-screen">
        <img src="/cr.jpeg" alt="CampusRide" className="brand-mark brand-logo-large" />
        <h1>CampusRide</h1>
        <p>Connecting SRM University-AP students...</p>
      </main>
    );
  }

  const pendingIncomingCount = incomingBookings.filter(
    (b) => b.status === "pending"
  ).length;

  return (
    <div className="app-shell">
      {/* Responsive Navbar */}
      <Navbar
        page={page}
        onNavigate={handleNavigate}
        user={user}
        profile={profile}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
        isProfileOpen={showProfileModal}
        pendingRequestsCount={pendingIncomingCount}
      />

      <main className="main-content">
        {/* Alerts & Toasts */}
        {notice && (
          <div className="notice notice-success" role="status">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="notice notice-error" role="alert">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage("")} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {/* Page Switcher */}
        {page === "find" && (
          <FindRide
            rides={rides}
            onBookRide={handleBookRide}
            user={user}
            requestedRideIds={requestedRideIds}
            busy={busy}
            dataLoading={dataLoading}
            onRefresh={handleRefresh}
            onOfferRideClick={() => handleNavigate("offer")}
          />
        )}

        {page === "offer" && (
          <OfferRide
            onSubmitRide={handleOfferRide}
            user={user}
            busy={busy}
            onNavigateAuth={() => handleNavigate("auth")}
          />
        )}

        {page === "trips" && (
          <MyTrips
            myRides={myRides}
            incomingBookings={incomingBookings}
            myBookings={myBookings}
            onBookingResponse={handleBookingResponse}
            onCancelBooking={handleCancelBooking}
            onRefresh={handleRefresh}
            onOfferRideClick={() => handleNavigate("offer")}
            user={user}
            busy={busy}
            dataLoading={dataLoading}
          />
        )}

        {page === "auth" && (
          <AuthPage
            onLogin={handleLogin}
            busy={busy}
            errorMessage={errorMessage}
            onClearError={() => setErrorMessage("")}
          />
        )}

        {/* Footer */}
        <footer className="site-footer">
          <div className="footer-brand">
            <img src="/cr.jpeg" alt="CampusRide" className="brand-mark brand-mark-small" />
            <div>
              <strong>CampusRide</strong>
              <small>SRM University-AP Student Carpooling</small>
            </div>
          </div>

          <div className="footer-meta">
            <span>Travel responsibly • Wear helmets & seatbelts</span>
            <p>Built exclusively for the SRM University-AP campus community.</p>
          </div>
        </footer>
      </main>

      {/* Profile Onboarding Modal */}
      {showProfileModal && (
        <ProfileOnboarding
          user={user}
          initialProfile={profile}
          isModal={true}
          onClose={() => setShowProfileModal(false)}
          onSave={(updatedProfile) => {
            setProfile(updatedProfile);
            setShowProfileModal(false);
            setNotice("Profile updated successfully!");
          }}
        />
      )}

      {/* Password Setup Modal (First login or recovery) */}
      {showPasswordSetupModal && (
        <PasswordSetupModal
          mode={passwordSetupMode}
          onSuccess={async () => {
            setShowPasswordSetupModal(false);
            const updatedProf = await loadProfile(user?.id);
            setNotice("Password configured successfully!");
            if (!updatedProf?.profile_completed || !updatedProf?.mobile_number) {
              setShowProfileModal(true);
            }
          }}
          onClose={() => {
            if (passwordSetupMode !== "first_login") {
              setShowPasswordSetupModal(false);
            }
          }}
        />
      )}
    </div>
  );
}
