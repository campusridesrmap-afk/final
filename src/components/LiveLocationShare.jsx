import { useState, useEffect, useRef } from "react";
import { reverseGeocode } from "../lib/geocoding";
import { supabase } from "../lib/supabase";
import {
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  StopCircle,
  PlayCircle,
  Radio,
} from "lucide-react";

// Module-level watcher map to prevent duplicate watchers across tab changes,
// visibility toggles, or component re-renders.
// Key format: `${rideId}_${userId}` -> { watchId, lastCoords, lastAddress, listeners: Set }
const activeWatchers = new Map();

function formatRelativeTime(timestamp, currentMs) {
  if (!timestamp) return "Never";
  const diffSec = Math.floor((currentMs - new Date(timestamp).getTime()) / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function getStorageKey(rideId, userId) {
  if (!rideId || !userId) return null;
  return `campusride_sharing_${rideId}_${userId}`;
}

export default function LiveLocationShare({
  rideId,
  currentUser,
  currentUserName = "Me",
  role = "passenger", // 'driver' | 'passenger'
  partnerRole = "Vehicle Sharer",
  partnerId = null,
  partnerName = "Co-rider",
  isAccepted = true,
}) {
  const userId = currentUser?.id;
  const storageKey = getStorageKey(rideId, userId);
  const watcherKey = rideId && userId ? `${rideId}_${userId}` : null;

  // Track current timestamp in state to satisfy render purity rules
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Lazy initialize state from localStorage for instantaneous tab-restore
  const [isSharing, setIsSharing] = useState(() => {
    if (!storageKey) return false;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? Boolean(JSON.parse(raw)?.isSharing) : false;
    } catch {
      return false;
    }
  });

  const [myLocation, setMyLocation] = useState(() => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.isSharing && (parsed.placeName || parsed.fullAddress)) {
        return {
          placeName: parsed.fullAddress || parsed.placeName,
          lat: parsed.lat,
          lng: parsed.lng,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    } catch {
      return null;
    }
    return null;
  });

  const [permissionError, setPermissionError] = useState("");
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [partnerLocation, setPartnerLocation] = useState(null);

  // Keep latest props in ref for watcher callbacks
  const propsRef = useRef({
    rideId,
    userId,
    currentUserName,
    role,
    storageKey,
    watcherKey,
  });

  useEffect(() => {
    propsRef.current = {
      rideId,
      userId,
      currentUserName,
      role,
      storageKey,
      watcherKey,
    };
  }, [rideId, userId, currentUserName, role, storageKey, watcherKey]);

  // Timer to update relative time without impure Date.now() calls in render
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // 1. Centralized Geolocation Watcher Manager (Singleton per ride+user)
  // ---------------------------------------------------------------------------
  function attachWatcher(key, onPositionUpdate, onErrorUpdate) {
    if (!key) return () => {};

    let entry = activeWatchers.get(key);
    if (!entry) {
      entry = {
        watchId: null,
        listeners: new Set(),
        lastCoords: { lat: 0, lng: 0 },
        lastAddress: "",
      };
      activeWatchers.set(key, entry);

      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const currentEntry = activeWatchers.get(key);
          if (!currentEntry) return;

          const dLat = Math.abs(lat - currentEntry.lastCoords.lat);
          const dLng = Math.abs(lng - currentEntry.lastCoords.lng);

          let address = currentEntry.lastAddress;

          // Only reverse-geocode when moved significantly (~30m) or first time
          if (dLat > 0.0003 || dLng > 0.0003 || !address) {
            try {
              const geocoded = await reverseGeocode(lat, lng);
              address =
                geocoded?.fullAddress ||
                geocoded?.label ||
                geocoded?.name ||
                "Location address unavailable";
              currentEntry.lastCoords = { lat, lng };
              currentEntry.lastAddress = address;
            } catch {
              address = "Location address unavailable";
            }
          }

          const now = new Date().toISOString();
          const payload = {
            placeName: address,
            lat,
            lng,
            updatedAt: now,
          };

          const {
            storageKey: sKey,
            userId: uId,
            rideId: rId,
            role: userRole,
            currentUserName: uName,
          } = propsRef.current;

          // Save to localStorage to persist across tab visibility / refresh
          if (sKey) {
            try {
              localStorage.setItem(
                sKey,
                JSON.stringify({ isSharing: true, ...payload })
              );
            } catch {
              // Ignore storage errors
            }
          }

          // Sync with Supabase trip_live_locations
          if (uId && rId) {
            try {
              await supabase.from("trip_live_locations").upsert(
                {
                  ride_id: rId,
                  user_id: uId,
                  user_role: userRole,
                  user_name: uName,
                  place_name: address,
                  lat,
                  lng,
                  is_active: true,
                  updated_at: now,
                },
                { onConflict: "ride_id,user_id" }
              );
            } catch {
              // Silently continue
            }
          }

          // Notify all registered listeners
          currentEntry.listeners.forEach((listener) => {
            try {
              listener.onPos(payload);
            } catch {
              // listener failed
            }
          });
        },
        (err) => {
          const currentEntry = activeWatchers.get(key);
          if (!currentEntry) return;

          if (err.code === 1) {
            // Permission Denied: Stop sharing permanently
            if (currentEntry.watchId != null) {
              navigator.geolocation.clearWatch(currentEntry.watchId);
            }
            activeWatchers.delete(key);

            const { storageKey: sKey, userId: uId, rideId: rId } = propsRef.current;
            if (sKey) localStorage.removeItem(sKey);

            if (uId && rId) {
              supabase
                .from("trip_live_locations")
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq("ride_id", rId)
                .eq("user_id", uId);
            }

            currentEntry.listeners.forEach((listener) => {
              listener.onErr(
                "Location permission denied. Please allow location access in your browser settings to share your live location."
              );
              listener.onStop();
            });
          } else if (err.code === 2) {
            // Position unavailable (temporary GPS glitch)
            currentEntry.listeners.forEach((listener) => {
              listener.onErr("Device location is temporarily unavailable. Checking GPS / network...");
            });
          } else if (err.code === 3) {
            // Timeout: Do NOT stop sharing! Tab switching often causes temporary watch timeouts.
            // We log and ignore so sharing remains active when returning to tab.
            console.warn("Location watch timeout (likely background tab). Waiting for next fix...");
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
        }
      );

      entry.watchId = watchId;
    }

    const listenerObj = {
      onPos: onPositionUpdate,
      onErr: onErrorUpdate,
      onStop: () => {
        setIsSharing(false);
        setMyLocation(null);
      },
    };

    entry.listeners.add(listenerObj);

    return () => {
      const current = activeWatchers.get(key);
      if (current) {
        current.listeners.delete(listenerObj);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Realtime Subscription + Partner Polling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!rideId || !isAccepted) return;

    let active = true;

    async function fetchPartner() {
      try {
        let query = supabase
          .from("trip_live_locations")
          .select("*")
          .eq("ride_id", rideId);

        if (partnerId) {
          query = query.eq("user_id", partnerId);
        } else if (userId) {
          query = query.neq("user_id", userId);
        }

        const { data, error } = await query
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && active && data) {
          setPartnerLocation(data);
        }
      } catch {
        // Silently catch network errors
      }
    }

    // Initial fetch
    fetchPartner();

    // Supabase Realtime channel subscription
    const channelName = `trip_live_${rideId}_${partnerId || "all"}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_live_locations",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row || !active) return;

          if (partnerId) {
            if (row.user_id === partnerId) {
              setPartnerLocation(row);
            }
          } else if (row.user_id !== userId) {
            setPartnerLocation(row);
          }
        }
      )
      .subscribe();

    // Polling fallback
    const interval = setInterval(fetchPartner, 10000);

    return () => {
      active = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [rideId, isAccepted, partnerId, userId]);

  // ---------------------------------------------------------------------------
  // 3. Tab Visibility, Focus, & Page Refresh Synchronization
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!rideId || !isAccepted) return;

    let active = true;

    async function syncSharingState() {
      // 1. Fetch partner location immediately on tab return
      try {
        let query = supabase
          .from("trip_live_locations")
          .select("*")
          .eq("ride_id", rideId);

        if (partnerId) {
          query = query.eq("user_id", partnerId);
        } else if (userId) {
          query = query.neq("user_id", userId);
        }

        const { data } = await query
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (active && data) {
          setPartnerLocation(data);
        }
      } catch {
        // ignore
      }

      // 2. Verify own saved sharing status
      if (!userId) return;

      try {
        const { data: myDbLoc, error } = await supabase
          .from("trip_live_locations")
          .select("*")
          .eq("ride_id", rideId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!active) return;

        if (!error && myDbLoc) {
          if (myDbLoc.is_active) {
            setIsSharing(true);
            setMyLocation({
              placeName: myDbLoc.place_name,
              lat: myDbLoc.lat,
              lng: myDbLoc.lng,
              updatedAt: myDbLoc.updated_at,
            });

            // Ensure active watcher is connected
            if (watcherKey && !activeWatchers.has(watcherKey)) {
              attachWatcher(
                watcherKey,
                (loc) => {
                  setMyLocation(loc);
                  setIsSharing(true);
                  setResolvingPlace(false);
                  setPermissionError("");
                },
                (err) => setPermissionError(err)
              );
            }
          } else if (!myDbLoc.is_active) {
            setIsSharing(false);
            setMyLocation(null);
            if (storageKey) localStorage.removeItem(storageKey);
          }
        } else {
          // Check if localStorage indicates active sharing
          let localActive = false;
          if (storageKey) {
            try {
              const raw = localStorage.getItem(storageKey);
              if (raw && JSON.parse(raw)?.isSharing) localActive = true;
            } catch {
              // ignore
            }
          }
          if (localActive && watcherKey && !activeWatchers.has(watcherKey)) {
            attachWatcher(
              watcherKey,
              (loc) => {
                setMyLocation(loc);
                setIsSharing(true);
                setResolvingPlace(false);
                setPermissionError("");
              },
              (err) => setPermissionError(err)
            );
          }
        }
      } catch {
        // network issue
      }
    }

    syncSharingState();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncSharingState();
      }
    };

    const handleFocus = () => {
      syncSharingState();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [rideId, isAccepted, partnerId, userId, watcherKey, storageKey]);

  // ---------------------------------------------------------------------------
  // 4. Start & Stop Sharing Handlers
  // ---------------------------------------------------------------------------
  const handleStartSharing = () => {
    setPermissionError("");

    if (!navigator.geolocation) {
      setPermissionError("Geolocation is not supported by your browser.");
      return;
    }

    if (!watcherKey) return;

    setResolvingPlace(true);

    attachWatcher(
      watcherKey,
      (loc) => {
        setMyLocation(loc);
        setIsSharing(true);
        setResolvingPlace(false);
        setPermissionError("");
      },
      (err) => {
        setResolvingPlace(false);
        setPermissionError(err);
      }
    );
  };

  const handleStopSharing = async () => {
    setPermissionError("");

    if (watcherKey) {
      const entry = activeWatchers.get(watcherKey);
      if (entry && entry.watchId != null) {
        navigator.geolocation.clearWatch(entry.watchId);
      }
      activeWatchers.delete(watcherKey);
    }

    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }

    setIsSharing(false);
    setMyLocation(null);

    // Update Supabase to mark inactive
    if (userId && rideId) {
      try {
        await supabase
          .from("trip_live_locations")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("ride_id", rideId)
          .eq("user_id", userId);
      } catch {
        // ignore
      }
    }
  };

  if (!isAccepted) return null;

  // ---------------------------------------------------------------------------
  // 5. Partner Staleness & Status Calculation
  // ---------------------------------------------------------------------------
  const isPartnerActive = Boolean(partnerLocation?.is_active);
  const partnerAgeSec = partnerLocation?.updated_at
    ? (currentTime - new Date(partnerLocation.updated_at).getTime()) / 1000
    : Infinity;
  const isPartnerStale = partnerAgeSec > 120; // Stale after 2 minutes of no updates

  let partnerAddress = partnerLocation?.place_name;
  if (!partnerAddress && partnerLocation?.lat && partnerLocation?.lng) {
    partnerAddress = `GPS: ${partnerLocation.lat.toFixed(5)}, ${partnerLocation.lng.toFixed(5)}`;
  }

  return (
    <div className="live-location-panel">
      <div className="live-location-header">
        <div className="live-indicator-wrapper">
          <Radio size={16} className={isSharing ? "live-pulse-icon" : "text-muted"} />
          <strong>Student Live Location</strong>
        </div>
        <span className="live-privacy-tag">
          <ShieldCheck size={12} /> Trip members only
        </span>
      </div>

      {/* Permission or Geolocation Errors */}
      {permissionError && (
        <div className="notice notice-error location-error-notice">
          <AlertTriangle size={15} />
          <span>{permissionError}</span>
        </div>
      )}

      {/* Partner's Live Location Display (Full Text Address - Map Free) */}
      <div className="location-participant-card partner-card">
        <div className="participant-header">
          <span className="participant-role-tag">{partnerRole}:</span>
          <strong>{partnerName}</strong>
        </div>

        {partnerLocation && isPartnerActive && !isPartnerStale ? (
          <div className="live-place-status">
            <div className="place-name-line">
              <MapPin size={16} className="pin-live" />
              <div className="place-address-wrapper">
                <span className="place-address-label">Current location</span>
                <p className="place-address-text">{partnerAddress}</p>
              </div>
            </div>
            <div className="live-status-pill active">
              <span className="status-dot green" />
              <span>Live location active • Updated {formatRelativeTime(partnerLocation.updated_at, currentTime)}</span>
            </div>
          </div>
        ) : partnerLocation && isPartnerActive && isPartnerStale ? (
          <div className="live-place-status">
            <div className="place-name-line text-muted">
              <MapPin size={16} />
              <div className="place-address-wrapper">
                <span className="place-address-label">Last reported location</span>
                <p className="place-address-text">{partnerAddress}</p>
              </div>
            </div>
            <div className="live-status-pill stale">
              <span className="status-dot amber" />
              <span>Location stale • Last updated {formatRelativeTime(partnerLocation.updated_at, currentTime)}</span>
            </div>
          </div>
        ) : partnerLocation && !isPartnerActive ? (
          <div className="live-place-status">
            <span className="text-muted">⚪ {partnerRole} ({partnerName}) is not sharing location right now.</span>
          </div>
        ) : (
          <div className="live-place-status">
            <span className="text-muted">Waiting for {partnerRole.toLowerCase()} location...</span>
          </div>
        )}
      </div>

      {/* My Live Location Status & Controls */}
      <div className="location-participant-card my-location-card">
        <div className="participant-header">
          <span className="participant-role-tag">Your Location ({role}):</span>
          <strong>{currentUserName}</strong>
        </div>

        {isSharing && myLocation ? (
          <div className="live-place-status">
            <div className="place-name-line">
              <MapPin size={16} className="pin-live" />
              <div className="place-address-wrapper">
                <span className="place-address-label">Your shared address</span>
                <p className="place-address-text">{myLocation.placeName || "Resolving address..."}</p>
              </div>
            </div>
            <div className="live-status-pill active">
              <span className="status-dot green" />
              <span>Sharing live location • Updated {formatRelativeTime(myLocation.updatedAt, currentTime)}</span>
            </div>
          </div>
        ) : resolvingPlace ? (
          <div className="live-place-status loading">
            <Loader2 size={14} className="animate-spin" />
            <span>Requesting device location & resolving full address...</span>
          </div>
        ) : (
          <div className="live-place-status">
            <span className="text-muted">Location sharing is currently turned off.</span>
          </div>
        )}

        {/* Toggle Control Button */}
        <div className="location-toggle-row">
          {!isSharing ? (
            <button
              type="button"
              className="button button-primary button-small live-toggle-btn"
              onClick={handleStartSharing}
              disabled={resolvingPlace}
            >
              {resolvingPlace ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Starting...
                </>
              ) : (
                <>
                  <PlayCircle size={14} /> Start Sharing Live Location
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="button button-outline button-small danger-outline live-toggle-btn"
              onClick={handleStopSharing}
            >
              <StopCircle size={14} /> Stop Sharing Location
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
