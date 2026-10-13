import { useEffect, useState, useRef } from "react";
import { MapPin, X, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { COMMON_LOCATIONS } from "../data/srmLocations";

// Module-level query cache to prevent duplicate network requests across keystrokes and components
const queryCache = new Map();
const MAX_CACHE_ENTRIES = 100;

function getCachedResults(normQuery) {
  return queryCache.get(normQuery) || null;
}

function setCachedResults(normQuery, results) {
  if (queryCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = queryCache.keys().next().value;
    queryCache.delete(firstKey);
  }
  queryCache.set(normQuery, results);
}

// Instant local matching for campus hubs & known AP travel points (0ms latency)
function findLocalMatches(rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];

  return COMMON_LOCATIONS.filter((loc) => {
    const nameMatch = loc.name.toLowerCase().includes(q);
    const labelMatch = (loc.label || "").toLowerCase().includes(q);
    return nameMatch || labelMatch;
  }).map((loc) => ({
    name: loc.name,
    label: loc.label || loc.name,
    lat: loc.lat,
    lng: loc.lng,
    isLocalHub: true,
  }));
}

// Deduplicate and combine local matches with network results
function mergeSuggestions(localList, networkList) {
  const seen = new Set();
  const merged = [];

  for (const item of [...localList, ...networkList]) {
    const latStr = Number(item.lat || 0).toFixed(3);
    const lngStr = Number(item.lng || 0).toFixed(3);
    const key = `${(item.name || "").toLowerCase().trim()}_${latStr}_${lngStr}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged.slice(0, 7);
}

export default function LocationAutocomplete({
  fieldId,
  activeField,
  onSetActiveField,
  label,
  value,
  placeholder,
  onChange,
  onSelect,
  showQuickChips = false,
  required = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Flags to distinguish deliberate user typing from item selection
  const isUserTypingRef = useRef(false);
  const lastSelectedValueRef = useRef(null);

  // Determine whether this field is the currently active location field
  const isFieldActive = activeField !== undefined
    ? activeField === fieldId
    : true;

  // Close dropdown on click outside (mouse + touch)
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        if (isFieldActive && onSetActiveField) {
          onSetActiveField(null);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isFieldActive, onSetActiveField]);

  // When this field becomes inactive (e.g. user moved to another field):
  // Immediately close suggestions and cancel all pending network/debounce operations
  useEffect(() => {
    if (!isFieldActive) {
      setOpen(false);
      requestIdRef.current++;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  }, [isFieldActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Autocomplete search effect
  useEffect(() => {
    const trimmed = (value || "").trim();

    // If the value change was caused by selecting a suggestion, or user is not actively typing,
    // or this field is not currently active:
    // Strictly do not trigger autocomplete search and do not reopen the dropdown!
    if (!isFieldActive || !isUserTypingRef.current || trimmed === lastSelectedValueRef.current) {
      return;
    }

    if (trimmed.length < 2) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      requestIdRef.current++;

      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setSearchError("");
      setHighlightedIndex(-1);
      return;
    }

    const normQuery = trimmed.toLowerCase();
    const currentRequestId = ++requestIdRef.current;

    // 1. Instant local matches (0ms response)
    const localMatches = findLocalMatches(normQuery);

    // 2. Check query cache (0ms response)
    const cached = getCachedResults(normQuery);
    if (cached) {
      const combined = mergeSuggestions(localMatches, cached);
      setSuggestions(combined);
      setHighlightedIndex(-1);
      setSearchError("");
      setLoading(false);
      if (isFieldActive) {
        setOpen(true);
      }
      return;
    }

    // 3. Immediately display local campus matches while network fetch is debounced/pending
    if (localMatches.length > 0 && isFieldActive) {
      setSuggestions(localMatches);
      setHighlightedIndex(-1);
      setOpen(true);
    }

    // 4. Debounced network request (220ms debounce)
    setLoading(true);
    setSearchError("");

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const url = new URL("https://photon.komoot.io/api/");
        url.searchParams.set("q", trimmed);
        url.searchParams.set("limit", "7");
        url.searchParams.set("lang", "en");
        url.searchParams.set("lat", "16.4638");
        url.searchParams.set("lon", "80.5078");

        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Search service unavailable");

        const data = await response.json();

        // Stale response guard: discard if field is no longer active, user continued typing, or selected item
        if (
          !isFieldActive ||
          currentRequestId !== requestIdRef.current ||
          !isUserTypingRef.current ||
          trimmed === lastSelectedValueRef.current
        ) {
          return;
        }

        const networkPlaces = (data.features || [])
          .filter((feature) => {
            const coordinates = feature.geometry?.coordinates;
            return (
              Array.isArray(coordinates) &&
              Number.isFinite(coordinates[0]) &&
              Number.isFinite(coordinates[1])
            );
          })
          .map((feature) => {
            const p = feature.properties || {};
            const name =
              p.name || p.street || p.locality || p.city || "Unnamed place";

            const details = [
              p.street && p.name && p.street !== p.name ? p.street : null,
              p.locality,
              p.district,
              p.city,
              p.state,
            ].filter(
              (item, index, array) =>
                item && item !== name && array.indexOf(item) === index
            );

            return {
              label: [name, ...details].join(", "),
              name,
              lat: feature.geometry.coordinates[1],
              lng: feature.geometry.coordinates[0],
            };
          });

        // Store into query cache
        setCachedResults(normQuery, networkPlaces);

        const merged = mergeSuggestions(localMatches, networkPlaces);

        if (
          isFieldActive &&
          currentRequestId === requestIdRef.current &&
          isUserTypingRef.current &&
          trimmed !== lastSelectedValueRef.current
        ) {
          setSuggestions(merged);
          setHighlightedIndex(-1);
          setOpen(true);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          // If local matches already exist, keep showing local matches instead of an error banner
          if (localMatches.length === 0 && isFieldActive) {
            setSearchError("Location search currently unavailable. You can still type your stop name.");
            setOpen(true);
          }
        }
      } finally {
        if (currentRequestId === requestIdRef.current && isUserTypingRef.current) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [value, isFieldActive]);

  function choosePlace(place) {
    if (!place) return;

    // Immediately flag that selection finished to prevent reopening
    isUserTypingRef.current = false;
    lastSelectedValueRef.current = (place.name || place.label || "").trim();
    requestIdRef.current++;

    // Cancel pending debounce timers and abort in-flight requests
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Immediately close dropdown and clear suggestions
    setOpen(false);
    setSuggestions([]);
    setLoading(false);
    setSearchError("");
    setHighlightedIndex(-1);

    if (onSetActiveField) {
      onSetActiveField(null);
    }

    // Update parent state with structured location data
    onSelect(place);
  }

  function handleQuickPick(loc) {
    choosePlace({
      name: loc.name,
      label: loc.label,
      lat: loc.lat,
      lng: loc.lng,
    });
  }

  function handleClear() {
    isUserTypingRef.current = false;
    lastSelectedValueRef.current = null;
    requestIdRef.current++;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setSuggestions([]);
    setOpen(false);
    setLoading(false);
    setSearchError("");
    setHighlightedIndex(-1);

    onChange("");
    inputRef.current?.focus();
  }

  function handleInputChange(event) {
    const newVal = event.target.value;
    isUserTypingRef.current = true;
    lastSelectedValueRef.current = null;

    if (onSetActiveField && fieldId) {
      onSetActiveField(fieldId);
    }

    onChange(newVal);
  }

  function handleFocus() {
    if (onSetActiveField && fieldId) {
      onSetActiveField(fieldId);
    }

    const trimmed = (value || "").trim();
    // Resume suggestions when returning to an unfinished query that wasn't already selected
    if (
      trimmed.length >= 2 &&
      trimmed !== lastSelectedValueRef.current
    ) {
      isUserTypingRef.current = true;
      const normQuery = trimmed.toLowerCase();
      const cached = getCachedResults(normQuery);
      const local = findLocalMatches(normQuery);
      const merged = mergeSuggestions(local, cached || suggestions);

      if (merged.length > 0) {
        setSuggestions(merged);
        setHighlightedIndex(-1);
        setOpen(true);
      }
    }
  }

  function handleBlur(event) {
    // If focus moved within wrapper (e.g. clicking clear button or dropdown item), keep open
    if (wrapperRef.current && wrapperRef.current.contains(event.relatedTarget)) {
      return;
    }
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        if (onSetActiveField && fieldId) {
          onSetActiveField(fieldId);
        }
        setOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        choosePlace(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      if (onSetActiveField) {
        onSetActiveField(null);
      }
    }
  }

  const queryLen = (value || "").trim().length;
  const trimmedQuery = (value || "").trim();

  // Derived dropdown visibility:
  // Must be open, this field MUST be active, query must be >= 2 characters,
  // user must NOT have already selected this exact location,
  // and there must be suggestions, loading status, or error status to show.
  const isDropdownVisible =
    open &&
    isFieldActive &&
    trimmedQuery.length >= 2 &&
    trimmedQuery !== lastSelectedValueRef.current &&
    (suggestions.length > 0 || loading || (searchError && suggestions.length === 0));

  return (
    <div className={`location-autocomplete ${isDropdownVisible ? "is-open" : ""}`} ref={wrapperRef}>
      <label className="field-label">
        <span>{label}</span>
        {required && <span className="req-dot">*</span>}
      </label>

      <div className="autocomplete-input-wrapper">
        <MapPin className="input-pin-icon" size={17} />
        <input
          ref={inputRef}
          type="text"
          className="location-input"
          value={value}
          maxLength={120}
          autoComplete="off"
          placeholder={placeholder}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />

        {loading && isFieldActive && <Loader2 className="input-spinner animate-spin" size={16} />}

        {value && !loading && (
          <button
            type="button"
            className="input-clear-btn"
            onClick={handleClear}
            title="Clear location"
            aria-label="Clear location input"
          >
            <X size={15} />
          </button>
        )}

        {/* Suggestion Dropdown: Strictly visible only when this field is active */}
        {isDropdownVisible && (
          <div className="location-suggestions" role="listbox">
            {loading && suggestions.length === 0 && (
              <div className="autocomplete-status-item loading">
                <Loader2 size={14} className="animate-spin" />
                <span>Searching locations in Andhra Pradesh...</span>
              </div>
            )}

            {!loading && searchError && suggestions.length === 0 && (
              <div className="autocomplete-status-item error">
                <AlertCircle size={14} />
                <span>{searchError}</span>
              </div>
            )}

            {!loading && !searchError && suggestions.length === 0 && queryLen >= 2 && (
              <div className="autocomplete-status-item empty">
                <span>No places found for "{value}". You can still use this as your stop name.</span>
              </div>
            )}

            {suggestions.map((place, index) => {
              const isHighlighted = highlightedIndex === index;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  className={`location-suggestion ${isHighlighted ? "highlighted" : ""}`}
                  key={`${place.lat}-${place.lng}-${index}`}
                  onMouseDown={(e) => {
                    // Prevent input blur before click fires
                    e.preventDefault();
                  }}
                  onClick={() => choosePlace(place)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div className="suggestion-pin-box">
                    <MapPin size={16} />
                  </div>
                  <div className="suggestion-copy">
                    <strong>{place.name}</strong>
                    <small>{place.label}</small>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showQuickChips && (
        <div className="quick-chips">
          <span className="quick-chips-label">
            <Sparkles size={12} /> Common hubs:
          </span>
          {COMMON_LOCATIONS.slice(0, 5).map((loc) => (
            <button
              type="button"
              key={loc.id}
              className="chip-btn"
              onClick={() => handleQuickPick(loc)}
            >
              {loc.name.replace(" (Bus Stand)", "")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}