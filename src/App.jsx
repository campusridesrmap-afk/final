import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./lib/supabase";
import Navbar from "./components/Navbar";
import { CAMPUS_RIDE_LOGO } from "./assets/logo";
import ProfileOnboarding from "./components/ProfileOnboarding";
import PasswordSetupModal from "./components/PasswordSetupModal";
import FindRide from "./pages/FindRide";
import OfferRide from "./pages/OfferRide";
import MyTrips from "./pages/MyTrips";
import AuthPage from "./pages/AuthPage";
import RideActionConfirmModal from "./components/RideActionConfirmModal";
import InstallAppBanner from "./components/InstallAppBanner";
import {
  getInitialAuthAndProfile,
  getCachedUserProfile,
  cacheUserProfile,
  mergeProfileWithCache,
  clearActiveUserSession,
  setActiveUserId,
} from "./lib/profileCache";
import {
  getCachedPublicRides,
  cachePublicRides,
  getCachedExpiredTrips,
  cacheExpiredTrips,
  clearExpiredTripsCache,
} from "./lib/ridesCache";
import {
  getCachedUserBookings,
  cacheUserBookings,
  clearUserBookingsCache,
} from "./lib/bookingsCache";
import {
  getCachedUserTrips,
  cacheUserTrips,
  clearUserTripsCache,
} from "./lib/tripsCache";
import "./App.css";

function getErrorMessage(error) {
  if (!error) return "Something went wrong. Please try again.";
  if (
    error.message?.includes("profiles_registration_number_unique_idx") ||
    (error.code === "23505" &&
      (error.message?.includes("registration_number") || error.details?.includes("registration_number")))
  ) {
    return "This registration number already exists in another account. Please check your registration number and try again.";
  }
  if (error.code === "23505") return "You have already requested this ride.";
  if (error.message && error.message.includes("rides_vehicle_type_check")) {
    return "Database error: 'Auto' vehicle type is restricted by Supabase check constraint. Please run the migration query in your Supabase SQL editor to enable 'Auto'.";
  }
  return error.message || "Something went wrong. Please try again.";
}

export default function App() {
  // Synchronously hydrate session and profile from localStorage on first render
  // This completely eliminates profile and navigation flicker across page refreshes.
  const {
    initialSession,
    initialProfile,
  } = getInitialAuthAndProfile();

  const [session, setSession] = useState(initialSession);
  const [authLoading, setAuthLoading] = useState(!initialSession);
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "").trim().toLowerCase();
      const validPages = ["find", "dashboard", "offer", "trips", "auth"];
      if (validPages.includes(hash)) {
        return hash;
      }
      try {
        const saved = localStorage.getItem("campusride_current_page");
        if (saved && validPages.includes(saved)) {
          return saved;
        }
      } catch {}
    }
    return "find";
  });

  const [profile, setProfile] = useState(initialProfile);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordSetupModal, setShowPasswordSetupModal] = useState(false);
  const [passwordSetupMode, setPasswordSetupMode] = useState("first_login");

  const initialTrips = useMemo(
    () => getCachedUserTrips(initialSession?.user?.id),
    [initialSession?.user?.id]
  );

  // Synchronously hydrate active rides and user-scoped expired trips from localStorage cache on first render (stale-while-revalidate)
  const [rides, setRides] = useState(() => {
    const active = getCachedPublicRides();
    const expired = getCachedExpiredTrips(initialSession?.user?.id);
    const map = new Map();
    [...active, ...expired].forEach((r) => {
      if (r && r.id && !map.has(r.id)) {
        map.set(r.id, r);
      }
    });
    return Array.from(map.values());
  });
  const [myRides, setMyRides] = useState(() => initialTrips.myRides);
  const [myBookings, setMyBookings] = useState(() => initialTrips.myBookings);
  const [incomingBookings, setIncomingBookings] = useState(() => initialTrips.incomingBookings);
  // Synchronously hydrate user bookings from localStorage cache on first render
  // This prevents the "Request Seat" button flicker on page refresh
  const [userBookings, setUserBookings] = useState(() =>
    getCachedUserBookings(initialSession?.user?.id)
  );

  // Derived set of active requested ride IDs from userBookings
  const requestedRideIds = useMemo(() => {
    const set = new Set();
    Object.values(userBookings || {}).forEach((b) => {
      if (b && (b.status === "pending" || b.status === "accepted")) {
        set.add(b.rideId || b.ride_id);
      }
    });
    return set;
  }, [userBookings]);

  const [pendingBooking, setPendingBooking] = useState(null);

  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ridesError, setRidesError] = useState("");
  const [tripsError, setTripsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  // Lifecycle confirmation modal state
  const [lifecycleModal, setLifecycleModal] = useState({
    isOpen: false,
    type: "complete", // "complete" | "complete_trip" | "cancel_sharing" | "withdraw_request" | "cancel_booking"
    targetId: null,
    activePassengersCount: 0,
    activePassengerNames: [],
    error: "",
  });
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  const user = session?.user ?? null;
  // Ref tracking the currently active authenticated user ID to discard stale async responses
  const activeUserIdRef = useRef(initialSession?.user?.id ?? null);
  activeUserIdRef.current = user?.id ?? null;
  // Request sequence ref to prevent stale responses from overwriting newer results
  const ridesRequestIdRef = useRef(0);
  const tripsRequestIdRef = useRef(0);
  // In-flight promise refs to deduplicate overlapping concurrent calls
  const loadRidesInFlightRef = useRef(null);
  const loadMyTripsInFlightRef = useRef(null);
  const loadProfileInFlightRef = useRef(null);
  // Initial mount & sync lifecycle refs
  const initialRidesLoadedRef = useRef(false);
  const lastLoadedTripsUserIdRef = useRef(null);
  const lastHiddenTimeRef = useRef(0);
  // RPC throttling & concurrency refs to prevent repeated 400s or overlapping network calls
  const closeExpiredRpcInFlightRef = useRef(null);
  const lastCloseExpiredRpcTimeRef = useRef(0);
  const rpcSchemaErrorLoggedRef = useRef(false);

  // Synchronize active session and hydrate user state once per unique auth change
  const applySession = useCallback((nextSession) => {
    const nextUserId = nextSession?.user?.id ?? null;
    activeUserIdRef.current = nextUserId;

    if (!nextUserId) {
      clearActiveUserSession();
      setSession(null);
      setProfile(null);
      setUserBookings({});
      setMyRides([]);
      setMyBookings([]);
      setIncomingBookings([]);
      const guestExpired = getCachedExpiredTrips(null);
      const guestActive = getCachedPublicRides();
      const map = new Map();
      [...guestActive, ...guestExpired].forEach((r) => {
        if (r && r.id && !map.has(r.id)) {
          map.set(r.id, r);
        }
      });
      setRides(Array.from(map.values()));
    } else {
      setActiveUserId(nextUserId);
      setSession(nextSession);

      // Account isolation: Restore only this user's cached profile, bookings, and trips
      const nextCached = getCachedUserProfile(nextUserId);
      setProfile(nextCached || null);
      setUserBookings(getCachedUserBookings(nextUserId));
      const nextCachedTrips = getCachedUserTrips(nextUserId);
      setMyRides(nextCachedTrips.myRides);
      setMyBookings(nextCachedTrips.myBookings);
      setIncomingBookings(nextCachedTrips.incomingBookings);
      const nextCachedExpired = getCachedExpiredTrips(nextUserId);
      const cachedActive = getCachedPublicRides();
      const map = new Map();
      [...cachedActive, ...nextCachedExpired].forEach((r) => {
        if (r && r.id && !map.has(r.id)) {
          map.set(r.id, r);
        }
      });
      setRides(Array.from(map.values()));
    }
  }, []);

  const lastProcessedTokenRef = useRef(initialSession?.access_token ?? null);
  const authInitializedRef = useRef(false);

  // Initialize Supabase Auth listener with deduplication to prevent double-execution on page refresh
  useEffect(() => {
    let alive = true;

    // Listen for auth changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const token = nextSession?.access_token ?? null;
      // Skip redundant initial hydration if identical session was already applied
      if (authInitializedRef.current && token === lastProcessedTokenRef.current) {
        return;
      }
      lastProcessedTokenRef.current = token;
      authInitializedRef.current = true;
      if (alive) {
        applySession(nextSession);
        setAuthLoading(false);
      }
    });

    // Verification check on mount: runs only if onAuthStateChange has not already processed the session
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setErrorMessage(getErrorMessage(error));
      const nextSession = data?.session ?? null;
      const token = nextSession?.access_token ?? null;
      if (!authInitializedRef.current || token !== lastProcessedTokenRef.current) {
        lastProcessedTokenRef.current = token;
        authInitializedRef.current = true;
        applySession(nextSession);
      }
      setAuthLoading(false);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [applySession]);



  // Load user profile details in the background from Supabase
  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return null;
    }

    const targetUserId = userId;

    if (loadProfileInFlightRef.current && loadProfileInFlightRef.current.userId === targetUserId) {
      return loadProfileInFlightRef.current.promise;
    }

    const task = (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, registration_number, mobile_number, profile_completed, must_change_password")
          .eq("id", targetUserId)
          .maybeSingle();

        // Guard: Discard stale response if user logged out or switched accounts during fetch
        if (activeUserIdRef.current !== targetUserId) {
          return null;
        }

        if (error && error.code !== "PGRST116") {
          // Non-blocking profile load notice
        }

        // Safely merge network response with cache:
        // Valid fresh data updates state & cache.
        // If network returns empty/fallback, valid cached profile is preserved!
        const resolvedProfile = mergeProfileWithCache(targetUserId, data);

        if (activeUserIdRef.current === targetUserId && resolvedProfile) {
          setProfile(resolvedProfile);
        }

        return resolvedProfile;
      } catch (_err) {
        // Retain existing valid cache on network failure
        // Retain existing valid cache on network failure
        const existingCached = getCachedUserProfile(targetUserId);
        if (activeUserIdRef.current === targetUserId && existingCached) {
          setProfile(existingCached);
          return existingCached;
        }
        return null;
      } finally {
        if (loadProfileInFlightRef.current?.userId === targetUserId) {
          loadProfileInFlightRef.current = null;
        }
      }
    })();

    loadProfileInFlightRef.current = { userId: targetUserId, promise: task };
    return task;
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadProfile(user.id).then((prof) => {
        if (activeUserIdRef.current === user.id) {
          if (prof?.must_change_password) {
            setPasswordSetupMode("first_login");
            setShowPasswordSetupModal(true);
          } else if (!prof?.profile_completed || !prof?.mobile_number || !prof.mobile_number.trim()) {
            setShowProfileModal(true);
          }
        }
      });
    } else {
      setProfile(null);
    }
  }, [user?.id, loadProfile]);

  // Load active rides and expired trips using reliable pagination and stale-while-revalidate
  const loadRides = useCallback(async (force = false) => {
    if (!force && loadRidesInFlightRef.current) {
      return loadRidesInFlightRef.current;
    }

    const task = (async () => {
      const requestId = ++ridesRequestIdRef.current;
      setRides((current) => {
        if (force || current.length === 0) {
          setDataLoading(true);
        }
        return current;
      });
      try {
        // 1. Reliably fetch all records page-by-page to prevent silent truncations
        const PAGE_SIZE = 100;
        let allRides = [];
        let pageIndex = 0;
        let hasMore = true;

        while (hasMore) {
          const from = pageIndex * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;

          let query = supabase
            .from("rides")
            .select("*")
            .in("status", ["open", "expired"])
            .order("departure_at", { ascending: true })
            .range(from, to);

          let { data, error } = await query;

          // Fallback to eq("status", "open") if in("status", ["open", "expired"]) fails
          if (error) {
            const fallback = await supabase
              .from("rides")
              .select("*")
              .eq("status", "open")
              .order("departure_at", { ascending: true })
              .range(from, to);
            if (fallback.error) throw fallback.error;
            data = fallback.data;
          }

          const pageRows = data || [];
          allRides.push(...pageRows);

          if (pageRows.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            pageIndex++;
          }
        }

        // Discard stale response if a newer request was dispatched
        if (requestId !== ridesRequestIdRef.current) return;

        const rawRides = allRides;

        // Fetch provider display names in chunks of 50 to avoid query URL parameter overflow
        const providerIds = [...new Set(rawRides.map((r) => r.provider_id))].filter(Boolean);
        let profilesMap = {};

        if (providerIds.length > 0) {
          try {
            for (let i = 0; i < providerIds.length; i += 50) {
              const chunk = providerIds.slice(i, i + 50);
              const { data: profs } = await supabase
                .from("profiles")
                .select("id, full_name")
                .in("id", chunk);

              (profs || []).forEach((p) => {
                profilesMap[p.id] = p;
              });
            }
          } catch (_profErr) {
            // Silently fallback if driver profile names chunk cannot be retrieved
          }
        }

        // Check request sequencing again after the secondary profile fetch
        if (requestId !== ridesRequestIdRef.current) return;

        const freshRides = rawRides.map((r) => ({
          ...r,
          provider_name: profilesMap[r.provider_id]?.full_name || "SRM Student",
          provider_profile: profilesMap[r.provider_id] || null,
        }));

        // Atomically update state and localStorage caches
        setRides(freshRides);
        const nowMs = Date.now();
        const freshActive = freshRides.filter((r) => {
          const dep = new Date(r.departure_at).getTime();
          return !isNaN(dep) && dep > nowMs && (r.status === "open" || r.status === "active");
        });
        const freshExpired = freshRides
          .filter((r) => {
            const dep = new Date(r.departure_at).getTime();
            return !isNaN(dep) && dep <= nowMs && r.status !== "cancelled" && r.status !== "completed";
          })
          .sort((a, b) => {
            const timeA = new Date(a.departure_at).getTime() || 0;
            const timeB = new Date(b.departure_at).getTime() || 0;
            if (timeB !== timeA) return timeB - timeA;
            return String(b.id || "").localeCompare(String(a.id || ""));
          });
        cachePublicRides(freshActive);
        cacheExpiredTrips(activeUserIdRef.current, freshExpired);
        setRidesError("");
      } catch (error) {
        console.error("Failed to load rides:", error);
        // Retain last-known cached data if we already have rides in memory
        // Only set a blocking error message if no rides are currently available
        setRides((currentRides) => {
          if (currentRides.length === 0) {
            setRidesError(getErrorMessage(error));
          }
          return currentRides;
        });
      } finally {
        loadRidesInFlightRef.current = null;
        if (requestId === ridesRequestIdRef.current) {
          setDataLoading(false);
        }
      }
    })();

    loadRidesInFlightRef.current = task;
    return task;
  }, []);

  // Server-side RPC to close expired pending bookings with throttling, deduplication, and schema safety
  const triggerCloseExpiredRpc = useCallback(async (force = false) => {
    const now = Date.now();
    // Throttle calls: run at most once every 60 seconds unless forced (e.g. manual refresh)
    if (!force && now - lastCloseExpiredRpcTimeRef.current < 60000) {
      return;
    }
    // In-flight deduplication: return active promise if already executing
    if (closeExpiredRpcInFlightRef.current) {
      return closeExpiredRpcInFlightRef.current;
    }

    const task = (async () => {
      try {
        const { error } = await supabase.rpc("close_expired_pending_bookings");
        lastCloseExpiredRpcTimeRef.current = Date.now();
        if (error) {
          if (error.code === "23514") {
            // Check constraint violation in PostgreSQL: bookings_status_check lacks 'expired'
            rpcSchemaErrorLoggedRef.current = true;
          }
        } else {
          rpcSchemaErrorLoggedRef.current = false;
        }
      } catch (_err) {
        // Background RPC notice
      } finally {
        closeExpiredRpcInFlightRef.current = null;
      }
    })();

    closeExpiredRpcInFlightRef.current = task;
    return task;
  }, []);

  // Load user trips & bookings with race-condition prevention, caching, and RPC deduplication
  const loadMyTrips = useCallback(async (force = false, skipRpc = false) => {
    const targetUserId = activeUserIdRef.current;
    if (!targetUserId) {
      return;
    }

    if (!force && loadMyTripsInFlightRef.current) {
      return loadMyTripsInFlightRef.current;
    }

    const task = (async () => {
      const requestId = ++tripsRequestIdRef.current;
      try {
        // Trigger server-side pending booking expiration with deduplication and throttling
        if (!skipRpc) {
          await triggerCloseExpiredRpc();
        }

      // 1. My offered rides - paginate to retrieve all records
      let myRidesList = [];
      let ridePage = 0;
      const RIDE_PAGE_SIZE = 100;
      while (true) {
        const from = ridePage * RIDE_PAGE_SIZE;
        const to = from + RIDE_PAGE_SIZE - 1;
        const { data: ownRides, error: ridesErr } = await supabase
          .from("rides")
          .select("*")
          .eq("provider_id", targetUserId)
          .order("departure_at", { ascending: true })
          .range(from, to);

        if (ridesErr) throw ridesErr;
        const pageRows = ownRides ?? [];
        myRidesList.push(...pageRows);
        if (pageRows.length < RIDE_PAGE_SIZE) break;
        ridePage++;
      }

      // Guard: Discard stale response if a newer request began or user switched
      if (requestId !== tripsRequestIdRef.current || activeUserIdRef.current !== targetUserId) {
        return;
      }

      // 2. My bookings as passenger
      let myBookingsList = [];
      const nowMs = Date.now();

      try {
        const { data: bData, error: bErr } = await supabase
          .from("bookings")
          .select("*, rides(*)")
          .eq("passenger_id", targetUserId)
          .order("created_at", { ascending: false });

        if (!bErr && bData) {
          myBookingsList = bData.map((b) => {
            const depTime = new Date(b.rides?.departure_at || b.ride?.departure_at).getTime();
            const isDepPassed = !isNaN(depTime) && depTime <= nowMs;
            const effectiveStatus = b.status === "pending" && isDepPassed ? "expired" : b.status;
            return { ...b, status: effectiveStatus };
          });
        } else {
          const { data: flatData, error: flatErr } = await supabase
            .from("bookings")
            .select("*")
            .eq("passenger_id", targetUserId)
            .order("created_at", { ascending: false });

          if (flatErr) throw flatErr;
          if (flatData) {
            const rideIds = [...new Set(flatData.map((b) => b.ride_id).filter(Boolean))];
            let ridesMap = {};
            if (rideIds.length > 0) {
              for (let i = 0; i < rideIds.length; i += 50) {
                const chunk = rideIds.slice(i, i + 50);
                const { data: rData } = await supabase
                  .from("rides")
                  .select("*")
                  .in("id", chunk);
                (rData || []).forEach((r) => {
                  ridesMap[r.id] = r;
                });
              }
            }
            myBookingsList = flatData.map((b) => {
              const ride = ridesMap[b.ride_id] || null;
              const depTime = new Date(ride?.departure_at).getTime();
              const isDepPassed = !isNaN(depTime) && depTime <= nowMs;
              const effectiveStatus = b.status === "pending" && isDepPassed ? "expired" : b.status;
              return { ...b, status: effectiveStatus, rides: ride };
            });
          }
        }
      } catch (bookEx) {
        throw bookEx;
      }

      // Guard: Discard stale response
      if (requestId !== tripsRequestIdRef.current || activeUserIdRef.current !== targetUserId) {
        return;
      }

      // Fetch driver profiles for passenger bookings
      const activeAcceptedDriverIds = [
        ...new Set(
          myBookingsList
            .filter((b) => {
              const ride = b.rides || b.ride;
              return b.status === "accepted" && (!ride?.status || ride?.status === "open" || ride?.status === "active");
            })
            .map((b) => {
              const ride = b.rides || b.ride;
              return ride?.provider_id || b.provider_id;
            })
            .filter(Boolean)
        ),
      ];

      const otherDriverIds = [
        ...new Set(
          myBookingsList
            .map((b) => {
              const ride = b.rides || b.ride;
              return ride?.provider_id || b.provider_id;
            })
            .filter(Boolean)
        ),
      ].filter((id) => !activeAcceptedDriverIds.includes(id));

      let driverProfilesMap = {};
      if (activeAcceptedDriverIds.length > 0) {
        for (let i = 0; i < activeAcceptedDriverIds.length; i += 50) {
          const chunk = activeAcceptedDriverIds.slice(i, i + 50);
          const { data: driverProfs } = await supabase
            .from("profiles")
            .select("id, full_name, mobile_number, registration_number")
            .in("id", chunk);

          (driverProfs || []).forEach((p) => {
            driverProfilesMap[p.id] = p;
          });
        }
      }

      if (otherDriverIds.length > 0) {
        for (let i = 0; i < otherDriverIds.length; i += 50) {
          const chunk = otherDriverIds.slice(i, i + 50);
          const { data: otherProfs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", chunk);

          (otherProfs || []).forEach((p) => {
            driverProfilesMap[p.id] = { id: p.id, full_name: p.full_name, mobile_number: null, registration_number: null };
          });
        }
      }

      const processedMyBookings = myBookingsList.map((b) => {
        const ride = b.rides || b.ride;
        const providerId = ride?.provider_id || b.provider_id;
        return {
          ...b,
          driver_name: driverProfilesMap[providerId]?.full_name || b.driver_name || "Vehicle Sharer",
          driver_profile: driverProfilesMap[providerId] || b.driver_profile || null,
        };
      });

      // Update userBookings map
      const bookingsMap = {};
      myBookingsList.forEach((b) => {
        if (b.ride_id && !bookingsMap[b.ride_id]) {
          bookingsMap[b.ride_id] = {
            id: String(b.id),
            rideId: String(b.ride_id),
            status: b.status || "pending",
            seats_requested: Number(b.seats_requested) || 1,
            created_at: b.created_at || null,
          };
        }
      });

      // 3. Incoming booking requests for my rides
      const ownRideIds = myRidesList.map((r) => r.id);
      let incomingList = [];
      if (ownRideIds.length > 0) {
        for (let i = 0; i < ownRideIds.length; i += 50) {
          const chunk = ownRideIds.slice(i, i + 50);
          try {
            const { data: requests, error: requestsErr } = await supabase
              .from("bookings")
              .select("*")
              .in("ride_id", chunk)
              .neq("passenger_id", targetUserId)
              .order("created_at", { ascending: false });

            if (requestsErr) throw requestsErr;
            if (requests) {
              incomingList.push(...requests);
            }
          } catch (reqErr) {
            throw reqErr;
          }
        }
      }

      // Guard: Discard stale response
      if (requestId !== tripsRequestIdRef.current || activeUserIdRef.current !== targetUserId) {
        return;
      }

      const latestIncomingMap = new Map();
      incomingList.forEach((b) => {
        const key = `${b.ride_id}_${b.passenger_id}`;
        if (!latestIncomingMap.has(key)) {
          latestIncomingMap.set(key, b);
        }
      });
      const deduplicatedIncoming = Array.from(latestIncomingMap.values());
      const ridesById = Object.fromEntries(myRidesList.map((r) => [r.id, r]));

      const activeAcceptedPassengerIds = [
        ...new Set(
          deduplicatedIncoming
            .filter((b) => b.status === "accepted" && ridesById[b.ride_id]?.status === "open")
            .map((b) => b.passenger_id)
        ),
      ];

      const otherPassengerIds = [
        ...new Set(
          deduplicatedIncoming
            .filter((b) => !(b.status === "accepted" && ridesById[b.ride_id]?.status === "open"))
            .map((b) => b.passenger_id)
        ),
      ].filter((id) => !activeAcceptedPassengerIds.includes(id));

      let passengerProfilesMap = {};
      if (activeAcceptedPassengerIds.length > 0) {
        for (let i = 0; i < activeAcceptedPassengerIds.length; i += 50) {
          const chunk = activeAcceptedPassengerIds.slice(i, i + 50);
          const { data: passengerProfs } = await supabase
            .from("profiles")
            .select("id, full_name, mobile_number, registration_number")
            .in("id", chunk);

          (passengerProfs || []).forEach((p) => {
            passengerProfilesMap[p.id] = p;
          });
        }
      }

      if (otherPassengerIds.length > 0) {
        for (let i = 0; i < otherPassengerIds.length; i += 50) {
          const chunk = otherPassengerIds.slice(i, i + 50);
          const { data: otherPassengerProfs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", chunk);

          (otherPassengerProfs || []).forEach((p) => {
            passengerProfilesMap[p.id] = { id: p.id, full_name: p.full_name, mobile_number: null, registration_number: null };
          });
        }
      }

      const processedIncoming = deduplicatedIncoming.map((b) => {
        const ride = ridesById[b.ride_id];
        const depTime = new Date(ride?.departure_at).getTime();
        const isDepPassed = !isNaN(depTime) && depTime <= nowMs;
        const effectiveStatus = b.status === "pending" && isDepPassed ? "expired" : b.status;
        return {
          ...b,
          status: effectiveStatus,
          passenger_name: passengerProfilesMap[b.passenger_id]?.full_name || "SRM Student",
          passenger_profile: passengerProfilesMap[b.passenger_id] || null,
          ride: ride || null,
        };
      });

      // Guard: Discard stale response before committing state
      if (requestId !== tripsRequestIdRef.current || activeUserIdRef.current !== targetUserId) {
        return;
      }

      // Atomically commit all fresh authoritative data together
      setMyRides(myRidesList);
      setMyBookings(processedMyBookings);
      setUserBookings(bookingsMap);
      setIncomingBookings(processedIncoming);
      setTripsError("");

      cacheUserBookings(targetUserId, bookingsMap);
      cacheUserTrips(targetUserId, {
        myRides: myRidesList,
        incomingBookings: processedIncoming,
        myBookings: processedMyBookings,
      });
    } catch (error) {
      if (requestId === tripsRequestIdRef.current) {
        setTripsError(getErrorMessage(error));
      }
      // Retain existing cached trips in memory; NEVER reset to []!
    } finally {
      loadMyTripsInFlightRef.current = null;
    }
  })();

  loadMyTripsInFlightRef.current = task;
  return task;
}, [triggerCloseExpiredRpc]);

  // Refresh all active rides, user trips, and profile data with tactile feedback
  const handleRefresh = useCallback(async () => {
    setDataLoading(true);
    setNotice("");
    setRidesError("");
    setTripsError("");
    try {
      const rpcTask = triggerCloseExpiredRpc(true);
      const refreshTasks = [loadRides(true), loadMyTrips(true), rpcTask];
      if (activeUserIdRef.current) {
        refreshTasks.push(loadProfile(activeUserIdRef.current));
      }
      await Promise.all(refreshTasks);
      setNotice("Latest rides and trips refreshed!");
      setTimeout(() => {
        setNotice("");
      }, 2500);
    } catch (err) {
      console.error("Refresh error:", err);
      setErrorMessage("Failed to refresh. Please check your connection.");
    } finally {
      setTimeout(() => {
        setDataLoading(false);
      }, 500);
    }
  }, [loadRides, loadMyTrips, loadProfile, triggerCloseExpiredRpc]);

  // Load rides once authLoading settles, and re-fetch whenever the authenticated user ID changes
  useEffect(() => {
    if (!authLoading) {
      if (!initialRidesLoadedRef.current || (user?.id && user.id !== lastLoadedTripsUserIdRef.current)) {
        initialRidesLoadedRef.current = true;
        loadRides();
      }
    }
  }, [authLoading, user?.id, loadRides]);

  // Load authenticated user trips & bookings once authLoading settles and whenever user changes
  useEffect(() => {
    if (!authLoading && user?.id) {
      if (lastLoadedTripsUserIdRef.current !== user.id) {
        lastLoadedTripsUserIdRef.current = user.id;
        loadMyTrips();
      }
    } else if (!user?.id) {
      lastLoadedTripsUserIdRef.current = null;
    }
  }, [authLoading, user?.id, loadMyTrips]);

  // Debounced background sync for Realtime events to prevent rapid overlapping network requests
  const syncTimerRef = useRef(null);

  const scheduleRealtimeSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(async () => {
      syncTimerRef.current = null;
      try {
        await loadRides(false);
      } catch (_) {}
      if (activeUserIdRef.current) {
        try {
          await loadMyTrips(false, true);
        } catch (_) {}
      }
    }, 300);
  }, [loadRides, loadMyTrips]);

  // 1. Public Rides Realtime synchronization (active for all users, including visitors & guests)
  useEffect(() => {
    const channel = supabase
      .channel("campusride_public_rides")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides" },
        (payload) => {
          const { eventType, new: newRide, old: oldRide } = payload;
          if (eventType === "INSERT" && newRide) {
            setRides((prev) => {
              if (prev.some((r) => r.id === newRide.id)) return prev;
              return [
                ...prev,
                { ...newRide, provider_name: newRide.provider_name || "SRM Student" },
              ];
            });
          } else if (eventType === "UPDATE" && newRide) {
            setRides((prev) =>
              prev.map((r) => (r.id === newRide.id ? { ...r, ...newRide } : r))
            );
            setMyRides((prev) =>
              prev.map((r) => (r.id === newRide.id ? { ...r, ...newRide } : r))
            );
          } else if (eventType === "DELETE" && oldRide) {
            setRides((prev) => prev.filter((r) => r.id !== oldRide.id));
            setMyRides((prev) => prev.filter((r) => r.id !== oldRide.id));
          }
          scheduleRealtimeSync();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleRealtimeSync]);

  // 2. Authenticated User Bookings Realtime synchronization
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`campusride_user_bookings_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          const { eventType, new: newBooking } = payload;
          if (newBooking) {
            // If the passenger is the current user, update userBookings map immediately
            if (newBooking.passenger_id === user.id) {
              setUserBookings((prev) => ({
                ...prev,
                [newBooking.ride_id]: {
                  id: String(newBooking.id),
                  rideId: String(newBooking.ride_id),
                  status: newBooking.status,
                  seats_requested: Number(newBooking.seats_requested) || 1,
                  created_at: newBooking.created_at || null,
                },
              }));
              setMyBookings((prev) =>
                prev.map((b) => (b.id === newBooking.id ? { ...b, ...newBooking } : b))
              );
            }

            // If incoming bookings contain this booking, update it immediately
            setIncomingBookings((prev) =>
              prev.map((b) => (b.id === newBooking.id ? { ...b, ...newBooking } : b))
            );
          }
          scheduleRealtimeSync();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, scheduleRealtimeSync]);

  // 3. Tab visibility resync for catching missed events on mobile unlock or tab return
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastHiddenTimeRef.current;
        // Only resync if the tab was away for more than 30 seconds
        if (lastHiddenTimeRef.current > 0 && elapsed > 30000) {
          scheduleRealtimeSync();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [scheduleRealtimeSync]);

  // Ensure user profile in database without overwriting existing valid student identity
  const ensureProfile = useCallback(async (currentUser, name = "") => {
    if (!currentUser?.id) return;

    // Check if user already has an existing profile in Supabase
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, full_name, registration_number")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (existing && existing.full_name && existing.full_name.toLowerCase() !== "srm student") {
      return; // Already exists with valid profile; do not overwrite!
    }

    const trimmedName = name.trim();
    const metaName = currentUser.user_metadata?.full_name?.trim();
    const fallbackName = trimmedName || metaName || "";

    // Never save "SRM Student", email address, or empty defaults to the profiles table
    if (fallbackName && fallbackName.toLowerCase() !== "srm student" && !fallbackName.includes("@")) {
      await supabase.from("profiles").upsert(
        {
          id: currentUser.id,
          full_name: fallbackName,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
    }
  }, []);

  // Auth: Login
  async function handleLogin({ email, password }) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setErrorMessage("");

    try {
      const cleanEmail = email.trim().toLowerCase();
      let { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      // Gracefully handle students typing their temporary password (registration number) in lowercase
      if (
        error &&
        password &&
        password !== password.toUpperCase() &&
        /^[a-zA-Z]{2}[0-9a-zA-Z]{6,16}$/.test(password.trim())
      ) {
        const retryRes = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password.trim().toUpperCase(),
        });
        if (!retryRes.error && retryRes.data?.user) {
          data = retryRes.data;
          error = null;
        }
      }

      if (error) throw error;
      if (!data.user) throw new Error("Login failed.");

      activeUserIdRef.current = data.user.id;
      setActiveUserId(data.user.id);

      // Restore matching cached profile if available immediately
      const cached = getCachedUserProfile(data.user.id);
      if (cached) {
        setProfile(cached);
      }

      await ensureProfile(data.user);
      const userProf = await loadProfile(data.user.id);

      setNotice("Login successful. Welcome to CampusRide SRM-AP!");
      setPage("find");

      // Immediately refresh active rides, expired trips, and user trips with authenticated session
      loadRides();
      loadMyTrips();

      // If user clicked "Sign in to book" while browsing as a guest, automatically resume their seat request
      if (pendingBooking) {
        const toBook = pendingBooking;
        setPendingBooking(null);
        setTimeout(() => {
          handleBookRide(toBook.ride, toBook.seatsRequested, toBook.matchDetails);
        }, 300);
      }

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
        activeUserIdRef.current = data.user.id;
        setActiveUserId(data.user.id);

        if (fullName.trim()) {
          cacheUserProfile(data.user.id, {
            id: data.user.id,
            full_name: fullName.trim(),
            registration_number: "",
          });
        }

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
      if (user?.id) {
        clearUserBookingsCache(user.id);
        clearUserTripsCache(user.id);
        clearExpiredTripsCache(user.id);
      }
      activeUserIdRef.current = null;
      clearActiveUserSession();
      setProfile(null);
      setSession(null);
      setPendingBooking(null);
      setUserBookings({});
      setMyRides([]);
      setMyBookings([]);
      setIncomingBookings([]);

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      try {
        localStorage.removeItem("campusride_current_page");
        if (window.location.hash) window.location.hash = "find";
      } catch {}

      setPage("find");
      setNotice("You have successfully signed out.");
      // Reload public active rides so guest dashboard remains populated
      await loadRides();
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

    // Strictly enforce complete profile and mobile number before allowing ride creation
    if (!profile?.profile_completed || !profile?.mobile_number || !profile.mobile_number.trim()) {
      setShowProfileModal(true);
      setErrorMessage("Please complete your profile and provide your mobile number before offering a ride.");
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

      const { data: newInsertedRide, error } = await supabase
        .from("rides")
        .insert(insertData)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      // Trigger automatic background notification to students subscribed to ride alerts on this route
      if (newInsertedRide?.id) {
        supabase.functions.invoke("registration-email-otp", {
          body: {
            action: "notify_matching_ride_alerts",
            ride_id: newInsertedRide.id,
            driver_name: profile?.full_name || user?.user_metadata?.full_name || "SRM Student",
          },
        }).catch((e) => console.error("Ride alerts trigger error:", e));
      }

      setNotice("Ride published successfully! Students along your path can now request seats.");
      setPage("find");

      await loadRides(true);
      await loadMyTrips(true);
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
      setPendingBooking({ ride, seatsRequested, matchDetails });
      setPage("auth");
      setNotice(`Please log in with your SRM-AP student account to request a seat on ${ride.from_location} → ${ride.to_location}.`);
      return;
    }

    // Strictly enforce complete profile and mobile number before allowing ride booking
    if (!profile?.profile_completed || !profile?.mobile_number || !profile.mobile_number.trim()) {
      setShowProfileModal(true);
      setErrorMessage("Please complete your profile and provide your mobile number before booking a ride.");
      return;
    }

    if (busy) return;

    // Check existing booking status from in-memory state
    const existing = userBookings[ride.id];
    if (existing) {
      if (existing.status === "pending") {
        setNotice("Your seat request is already pending driver confirmation.");
        return;
      }
      if (existing.status === "accepted") {
        setNotice("Your seat request has already been accepted for this ride.");
        return;
      }
    }

    // Departure deadline check: block all new seat requests once departure time has arrived or passed
    const depTime = new Date(ride.departure_at).getTime();
    if (!isNaN(depTime) && depTime <= Date.now()) {
      setErrorMessage("Booking closed because the departure time has passed.");
      return;
    }

    if (ride.status !== "open") {
      setErrorMessage("This ride is no longer open for booking.");
      return;
    }

    if (Number(ride.available_seats) <= 0) {
      setErrorMessage("This ride has no seats remaining.");
      return;
    }

    const maxAllowedSeats = ride.vehicle_type === "Bike" ? 1 : Math.min(Number(ride.available_seats) || 0, 7);
    if (ride.vehicle_type === "Bike" && seatsRequested !== 1) {
      setErrorMessage("Only 1 seat can be requested for a motorcycle / scooter.");
      return;
    }
    if (seatsRequested < 1 || seatsRequested > maxAllowedSeats) {
      setErrorMessage(`Cannot request ${seatsRequested} seats. Only ${ride.available_seats} seat${ride.available_seats === 1 ? "" : "s"} available.`);
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

      const { data: newBooking, error } = await supabase
        .from("bookings")
        .insert(bookingData)
        .select()
        .maybeSingle();

      if (error) {
        // Database-level duplicate-request protection (unique constraint violation code 23505)
        if (error.code === "23505") {
          // Fetch the latest existing booking record from Supabase to sync its real database status
          const { data: existingDbBooking } = await supabase
            .from("bookings")
            .select("*")
            .eq("ride_id", ride.id)
            .eq("passenger_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingDbBooking) {
            // If the passenger previously withdrew/cancelled this request and re-requests under a global UNIQUE constraint:
            // Safely reactivate the existing booking row back to pending!
            if (existingDbBooking.status === "cancelled" || existingDbBooking.status === "withdrawn") {
              const depCheckTime = new Date(ride.departure_at).getTime();
              if (!isNaN(depCheckTime) && depCheckTime <= Date.now()) {
                setErrorMessage("Booking closed because the departure time has passed.");
                return;
              }

              const { data: reactivatedBooking, error: reactivateErr } = await supabase
                .from("bookings")
                .update({
                  status: "pending",
                  seats_requested: seatsRequested,
                  pickup_location: pickupLoc,
                  dropoff_location: dropoffLoc,
                  pickup_stop_index: matchDetails?.pickupStopIndex ?? 0,
                  dropoff_stop_index:
                    matchDetails?.dropoffStopIndex ??
                    (Array.isArray(ride.stops) && ride.stops.length > 1 ? ride.stops.length - 1 : 1),
                  created_at: new Date().toISOString(),
                })
                .eq("id", existingDbBooking.id)
                .select()
                .maybeSingle();

              if (!reactivateErr && reactivatedBooking) {
                setUserBookings((prev) => {
                  const next = {
                    ...prev,
                    [ride.id]: {
                      id: String(reactivatedBooking.id),
                      rideId: String(ride.id),
                      status: "pending",
                      seats_requested: seatsRequested,
                      created_at: reactivatedBooking.created_at,
                    },
                  };
                  cacheUserBookings(user.id, next);
                  return next;
                });

                setNotice(`Seat request sent to the vehicle sharer for ${pickupLoc} → ${dropoffLoc}.`);
                await loadMyTrips();
                return;
              }
            }

            setUserBookings((prev) => {
              const updated = {
                ...prev,
                [ride.id]: {
                  id: String(existingDbBooking.id),
                  rideId: String(existingDbBooking.ride_id),
                  status: existingDbBooking.status,
                  seats_requested: Number(existingDbBooking.seats_requested) || 1,
                  created_at: existingDbBooking.created_at,
                },
              };
              cacheUserBookings(user.id, updated);
              return updated;
            });

            if (existingDbBooking.status === "pending") {
              setNotice("Your seat request is currently pending driver confirmation.");
            } else if (existingDbBooking.status === "accepted") {
              setNotice("Your seat request for this ride has already been accepted.");
            } else if (existingDbBooking.status === "rejected") {
              setNotice("Your seat request for this ride was previously declined by the driver.");
            } else {
              setNotice("You have already requested this ride.");
            }
          } else {
            setNotice("You have already requested this ride.");
          }

          await loadMyTrips();
          return;
        }

        throw error;
      }

      // Do not report successful booking unless Supabase confirms the request exists
      if (newBooking) {
        setUserBookings((prev) => {
          const next = {
            ...prev,
            [ride.id]: {
              id: String(newBooking.id),
              rideId: String(ride.id),
              status: newBooking.status || "pending",
              seats_requested: seatsRequested,
              created_at: newBooking.created_at || new Date().toISOString(),
            },
          };
          cacheUserBookings(user.id, next);
          return next;
        });

        // Trigger email notification to the driver (silent background call - strictly Full Name only, no phone or reg no)
        supabase.functions.invoke("registration-email-otp", {
          body: {
            action: "notify_ride_requested",
            ride_id: ride.id,
            passenger_name: profile?.full_name || user?.user_metadata?.full_name || "SRM Student",
            seats_requested: seatsRequested,
          },
        }).catch((e) => console.error("Driver notification error:", e));

        setNotice(`Seat request sent to the vehicle sharer for ${pickupLoc} → ${dropoffLoc}.`);
        await loadMyTrips(true);
      }
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

      // If accepted, trigger email notification to the passenger (silent background call - strictly Full Name only, no phone or reg no)
      if (isAccept) {
        supabase.functions.invoke("registration-email-otp", {
          body: {
            action: "notify_ride_accepted",
            booking_id: bookingId,
            driver_name: profile?.full_name || user?.user_metadata?.full_name || "Your Driver",
          },
        }).catch((e) => console.error("Passenger notification error:", e));
      }

      setNotice(`Booking request ${isAccept ? "accepted" : "rejected"}. Contact details shared!`);
      await loadMyTrips(true);
      await loadRides(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // ==============================================================================
  // Ride Lifecycle Management Handlers
  // ==============================================================================

  function handleOpenCompleteTripModal(bookingId) {
    setLifecycleModal({
      isOpen: true,
      type: "complete_trip",
      targetId: bookingId,
      activePassengersCount: 0,
      activePassengerNames: [],
      error: "",
    });
  }

  function handleOpenCompleteModal(targetId) {
    // If targetId is actually a booking ID, delegate to passenger trip completion
    const matchingBooking =
      myBookings.find((b) => b.id === targetId) ||
      incomingBookings.find((b) => b.id === targetId);

    if (matchingBooking) {
      return handleOpenCompleteTripModal(targetId);
    }

    const rideId = targetId;
    const activeBookings = incomingBookings.filter(
      (b) => b.ride_id === rideId && b.status === "accepted"
    );

    setLifecycleModal({
      isOpen: true,
      type: "complete",
      targetId: rideId,
      activePassengersCount: activeBookings.length,
      activePassengerNames: activeBookings.map((b) => b.passenger_name || "SRM Student"),
      error: "",
    });
  }

  function handleOpenCancelSharingModal(rideId) {
    setLifecycleModal({
      isOpen: true,
      type: "cancel_sharing",
      targetId: rideId,
      activePassengersCount: 0,
      activePassengerNames: [],
      error: "",
    });
  }

  function handleOpenWithdrawModal(bookingId) {
    setLifecycleModal({
      isOpen: true,
      type: "withdraw_request",
      targetId: bookingId,
      activePassengersCount: 0,
      activePassengerNames: [],
      error: "",
    });
  }

  function handleOpenCancelBookingModal(bookingId) {
    setLifecycleModal({
      isOpen: true,
      type: "cancel_booking",
      targetId: bookingId,
      activePassengersCount: 0,
      activePassengerNames: [],
      error: "",
    });
  }

  function handleCloseLifecycleModal() {
    if (lifecycleBusy) return;
    setLifecycleModal({
      isOpen: false,
      type: "complete",
      targetId: null,
      activePassengersCount: 0,
      activePassengerNames: [],
      error: "",
    });
  }

  async function handleConfirmLifecycleAction() {
    const { type, targetId, activePassengersCount } = lifecycleModal;
    if (!targetId || !user) return;

    setLifecycleBusy(true);
    setLifecycleModal((prev) => ({ ...prev, error: "" }));

    try {
      if (type === "complete_trip") {
        const bookingId = targetId;
        let completedSuccessfully = false;

        // 1. Try Supabase RPC first
        const { data: rpcData, error: rpcErr } = await supabase.rpc("complete_passenger_trip", {
          p_booking_id: bookingId,
        });

        if (!rpcErr && rpcData?.success) {
          completedSuccessfully = true;
        } else {
          // 2. Direct table fallback: update ONLY this booking
          const { data: updatedBookings, error: bookingErr } = await supabase
            .from("bookings")
            .update({ status: "completed" })
            .eq("id", bookingId)
            .select();

          if (bookingErr) throw bookingErr;

          if (updatedBookings && updatedBookings.length > 0) {
            completedSuccessfully = true;
          } else {
            const { data: verifiedBooking } = await supabase
              .from("bookings")
              .select("id, status")
              .eq("id", bookingId)
              .maybeSingle();

            if (verifiedBooking && verifiedBooking.status === "completed") {
              completedSuccessfully = true;
            } else {
              throw new Error("Unable to complete passenger trip. Please verify authorization.");
            }
          }
        }

        if (completedSuccessfully) {
          // Update passenger bookings local state
          setMyBookings((prev) =>
            prev.map((b) => (b.id === bookingId ? { ...b, status: "completed" } : b))
          );
          setIncomingBookings((prev) =>
            prev.map((b) => (b.id === bookingId ? { ...b, status: "completed" } : b))
          );

          // Update passenger bookings cache map
          const currentBooking =
            myBookings.find((b) => b.id === bookingId) ||
            incomingBookings.find((b) => b.id === bookingId);
          const rideId = currentBooking?.ride_id;
          if (rideId) {
            setUserBookings((prev) => {
              if (!prev || !prev[rideId]) return prev;
              const updated = {
                ...prev,
                [rideId]: {
                  ...prev[rideId],
                  status: "completed",
                },
              };
              cacheUserBookings(user.id, updated);
              return updated;
            });
          }

          setNotice("Trip completed successfully! Direct contact sharing for this trip has ended.");
          handleCloseLifecycleModal();
          await loadMyTrips(true);
        }
      } else if (type === "complete") {
        const rideId = targetId;
        const hasActivePassengers = (activePassengersCount || 0) > 0;
        let completedSuccessfully = false;

        // 1. Try Supabase RPC first
        const { data: rpcData, error: rpcErr } = await supabase.rpc("complete_ride", {
          p_ride_id: rideId,
          p_force: true,
        });

        if (!rpcErr && rpcData?.success) {
          completedSuccessfully = true;
        } else {
          // 2. Direct table update fallback with row verification
          const { data: updatedRides, error: rideErr } = await supabase
            .from("rides")
            .update({ status: "completed", available_seats: 0 })
            .eq("id", rideId)
            .eq("provider_id", user.id)
            .select();

          if (rideErr) throw rideErr;

          if (updatedRides && updatedRides.length > 0) {
            completedSuccessfully = true;

            // If forced completion with active passengers, update accepted bookings
            if (hasActivePassengers) {
              await supabase
                .from("bookings")
                .update({ status: "completed" })
                .eq("ride_id", rideId)
                .eq("status", "accepted");
            }

            // Cancel any leftover pending bookings
            await supabase
              .from("bookings")
              .update({ status: "cancelled" })
              .eq("ride_id", rideId)
              .eq("status", "pending");
          } else {
            // Idempotency check: verify if the ride was already marked completed in the database
            const { data: verifiedRide } = await supabase
              .from("rides")
              .select("id, status")
              .eq("id", rideId)
              .maybeSingle();

            if (verifiedRide && verifiedRide.status === "completed") {
              completedSuccessfully = true;
            } else {
              throw new Error(
                "Unable to complete ride in database. Only the driver who offered this ride can complete it."
              );
            }
          }
        }

        if (completedSuccessfully) {
          // Remove ride from public state & cache immediately
          setRides((prev) => {
            const updated = prev.filter((r) => r.id !== rideId);
            cachePublicRides(updated);
            return updated;
          });

          setMyRides((prev) =>
            prev.map((r) => (r.id === rideId ? { ...r, status: "completed", available_seats: 0 } : r))
          );

          setNotice("Ride completed! All remaining participant trips and contact sharing have ended.");
          handleCloseLifecycleModal();
          await loadRides();
          await loadMyTrips();
        }
      } else if (type === "cancel_sharing") {
        const rideId = targetId;

        // 1. Try Supabase RPC first
        const { data: rpcData, error: rpcErr } = await supabase.rpc("cancel_ride_sharing", {
          p_ride_id: rideId,
        });

        if (rpcErr) {
          // Fallback direct update
          const { error: rideErr } = await supabase
            .from("rides")
            .update({ status: "cancelled", available_seats: 0 })
            .eq("id", rideId)
            .eq("provider_id", user.id);
          if (rideErr) throw rideErr;

          await supabase
            .from("bookings")
            .update({ status: "cancelled" })
            .eq("ride_id", rideId);
        }

        // Remove from public cache and state
        setRides((prev) => {
          const updated = prev.filter((r) => r.id !== rideId);
          cachePublicRides(updated);
          return updated;
        });

        setNotice("Ride sharing cancelled. All requests closed and contact sharing ended.");
      } else if (type === "withdraw_request") {
        const bookingId = targetId;

        // 1. Try Supabase RPC first
        const { data: rpcData, error: rpcErr } = await supabase.rpc("withdraw_booking_request", {
          p_booking_id: bookingId,
        });

        if (rpcErr) {
          const { error: bookErr } = await supabase
            .from("bookings")
            .update({ status: "cancelled" })
            .eq("id", bookingId)
            .eq("passenger_id", user.id)
            .eq("status", "pending");
          if (bookErr) throw bookErr;
        }

        setNotice("Seat request withdrawn.");
      } else if (type === "cancel_booking") {
        const bookingId = targetId;
        const targetBooking = myBookings.find((b) => b.id === bookingId);

        // 1. Try Supabase RPC first
        const { data: rpcData, error: rpcErr } = await supabase.rpc("cancel_accepted_booking", {
          p_booking_id: bookingId,
        });

        if (rpcErr) {
          const { error: bookErr } = await supabase
            .from("bookings")
            .update({ status: "cancelled" })
            .eq("id", bookingId)
            .eq("passenger_id", user.id);
          if (bookErr) throw bookErr;

          // Restore seats if the associated ride is still open
          if (targetBooking?.ride_id) {
            const { data: rideData } = await supabase
              .from("rides")
              .select("id, available_seats, total_seats, status")
              .eq("id", targetBooking.ride_id)
              .maybeSingle();

            if (rideData && rideData.status === "open") {
              const restoredSeats = Math.min(
                rideData.total_seats || 7,
                rideData.available_seats + (targetBooking.seats_requested || 1)
              );
              await supabase
                .from("rides")
                .update({ available_seats: restoredSeats })
                .eq("id", targetBooking.ride_id);
            }
          }
        }

        setNotice("Confirmed booking cancelled. Seats returned to driver.");
      }

      // Close modal on successful action
      setLifecycleModal({
        isOpen: false,
        type: "complete",
        targetId: null,
        error: "",
      });

      // Synchronize database state without a full page reload
      await loadMyTrips(true);
      await loadRides(true);
    } catch (err) {
      console.error("Lifecycle action error:", err);
      // Keep modal open and display clear error message to user
      setLifecycleModal((prev) => ({
        ...prev,
        error: getErrorMessage(err),
      }));
    } finally {
      setLifecycleBusy(false);
    }
  }

  function handleNavigate(nextPage) {
    setNotice("");
    setErrorMessage("");

    const targetPage = nextPage === "dashboard" ? "find" : nextPage;

    if (targetPage === "registrations") {
      setPage("find");
      return;
    }

    if (["offer", "trips"].includes(targetPage)) {
      if (authLoading) {
        // Session restoration in flight; do not prematurely redirect to login
        setPage(targetPage);
        try {
          localStorage.setItem("campusride_current_page", targetPage);
          window.location.hash = targetPage;
        } catch {}
        return;
      }
      if (!user) {
        setPage("auth");
        try {
          localStorage.setItem("campusride_current_page", "auth");
          window.location.hash = "auth";
        } catch {}
        setNotice("Please log in to continue.");
        return;
      }
    }

    setPage(targetPage);
    try {
      localStorage.setItem("campusride_current_page", targetPage);
      window.location.hash = targetPage;
    } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Once session is restored, if user is authenticated and on login page, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user && page === "auth") {
      setPage("find");
      try {
        localStorage.setItem("campusride_current_page", "find");
        window.location.hash = "find";
      } catch {}
    }
  }, [authLoading, user, page]);

  // If session is confirmed genuinely absent and user is on a protected page, show login
  useEffect(() => {
    if (!authLoading && !user && ["offer", "trips"].includes(page)) {
      setPage("auth");
      try {
        localStorage.setItem("campusride_current_page", "auth");
        window.location.hash = "auth";
      } catch {}
      setNotice("Please log in to continue.");
    }
  }, [authLoading, user, page]);

  const pendingIncomingCount = incomingBookings.filter(
    (b) => b.status === "pending"
  ).length;

  const hasUsableCachedTrips = myRides.length > 0 || incomingBookings.length > 0 || myBookings.length > 0;

  return (
    <div className="app-shell">
      {/* Responsive Navbar: Always mounted to guarantee logo stability on refresh */}
      <Navbar
        page={page}
        onNavigate={handleNavigate}
        user={user}
        authLoading={authLoading}
        profile={profile}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
        isProfileOpen={showProfileModal}
        pendingRequestsCount={pendingIncomingCount}
      />

      <main className="main-content">
        {authLoading && (page === "auth" || ["offer", "trips"].includes(page)) && !hasUsableCachedTrips && !initialProfile ? (
          <div className="auth-initializing-state" aria-busy="true">
            <div className="auth-initializing-card">
              <Loader2 className="animate-spin" size={28} style={{ color: "var(--blue)" }} />
              <p>Connecting to CampusRide SRM-AP...</p>
            </div>
          </div>
        ) : (
          <>
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
        {(page === "find" || page === "dashboard") && (
          <FindRide
            rides={rides}
            onBookRide={handleBookRide}
            user={user}
            profile={profile}
            authLoading={authLoading}
            requestedRideIds={requestedRideIds}
            userBookings={userBookings}
            busy={busy}
            dataLoading={dataLoading}
            ridesError={ridesError}
            errorMessage={errorMessage}
            onRefresh={handleRefresh}
            onOfferRideClick={() => handleNavigate("offer")}
            onNavigateAuth={() => handleNavigate("auth")}
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
            onWithdrawBooking={handleOpenWithdrawModal}
            onCancelAcceptedBooking={handleOpenCancelBookingModal}
            onCancelSharing={handleOpenCancelSharingModal}
            onCompleteRide={handleOpenCompleteModal}
            onCompleteTrip={handleOpenCompleteTripModal}
            onRefresh={handleRefresh}
            onOfferRideClick={() => handleNavigate("offer")}
            user={user}
            busy={busy || lifecycleBusy}
            dataLoading={dataLoading}
            tripsError={tripsError}
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


        </>
        )}

        {/* Footer */}
        <footer className="site-footer">
          <div className="footer-brand">
            <img
              src={CAMPUS_RIDE_LOGO}
              alt="CampusRide"
              className="brand-mark brand-mark-small"
              width="32"
              height="32"
              loading="lazy"
              decoding="sync"
            />
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
          onClose={() => {
            // Cannot close modal until profile and mobile number are completed
            if (profile?.profile_completed && profile?.mobile_number && profile.mobile_number.trim()) {
              setShowProfileModal(false);
            }
          }}
          onSave={(updatedProfile) => {
            if (user?.id) {
              cacheUserProfile(user.id, updatedProfile);
            }
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

      {/* Ride Lifecycle Confirmation Dialog */}
      <RideActionConfirmModal
        isOpen={lifecycleModal.isOpen}
        type={lifecycleModal.type}
        activePassengersCount={lifecycleModal.activePassengersCount}
        activePassengerNames={lifecycleModal.activePassengerNames}
        onConfirm={handleConfirmLifecycleAction}
        onClose={handleCloseLifecycleModal}
        busy={lifecycleBusy}
        error={lifecycleModal.error}
      />

      {/* Smart Mobile Install Banner (Add to Home Screen) */}
      <InstallAppBanner />
    </div>
  );
}
