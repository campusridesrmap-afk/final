import { useEffect, useState, useRef } from "react";
import { MapPin, X, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { COMMON_LOCATIONS } from "../data/srmLocations";

export default function LocationAutocomplete({
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

  // Close dropdown on click outside (mouse + touch)
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const query = (value || "").trim();
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      if (query.length < 2) {
        setSuggestions([]);
        setOpen(false);
        setLoading(false);
        setSearchError("");
        setHighlightedIndex(-1);
        return;
      }

      setLoading(true);
      setSearchError("");

      try {
        // Free Komoot Photon API (OSM based, biased to AP coordinates)
        const url = new URL("https://photon.komoot.io/api/");
        url.searchParams.set("q", query);
        url.searchParams.set("limit", "6");
        url.searchParams.set("lang", "en");
        url.searchParams.set("lat", "16.4638");
        url.searchParams.set("lon", "80.5078");

        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Search service unavailable");

        const data = await response.json();
        if (cancelled) return;

        const places = (data.features || [])
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

        setSuggestions(places);
        setHighlightedIndex(-1);
        setOpen(true);
      } catch (error) {
        if (error.name !== "AbortError" && !cancelled) {
          setSuggestions([]);
          setSearchError("Location search currently unavailable. You can still type your stop name.");
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  function choosePlace(place) {
    onSelect(place);
    setSuggestions([]);
    setOpen(false);
    setSearchError("");
    setHighlightedIndex(-1);
  }

  function handleQuickPick(loc) {
    choosePlace({
      name: loc.name,
      label: loc.label,
      lat: loc.lat,
      lng: loc.lng,
    });
  }

  function handleKeyDown(e) {
    if (!open) return;

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
    }
  }

  const queryLen = (value || "").trim().length;

  return (
    <div className={`location-autocomplete ${open ? "is-open" : ""}`} ref={wrapperRef}>
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
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />

        {loading && <Loader2 className="input-spinner animate-spin" size={16} />}

        {value && !loading && (
          <button
            type="button"
            className="input-clear-btn"
            onClick={() => {
              onChange("");
              setSuggestions([]);
              setOpen(false);
              inputRef.current?.focus();
            }}
            title="Clear location"
            aria-label="Clear location input"
          >
            <X size={15} />
          </button>
        )}

        {/* Suggestion Dropdown anchored directly to input field */}
        {open && (
          <div className="location-suggestions" role="listbox">
            {loading && suggestions.length === 0 && (
              <div className="autocomplete-status-item loading">
                <Loader2 size={14} className="animate-spin" />
                <span>Searching locations in Andhra Pradesh...</span>
              </div>
            )}

            {!loading && searchError && (
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