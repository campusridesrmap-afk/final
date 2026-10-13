import { useState } from "react";
import LocationAutocomplete from "./LocationAutocomplete";
import { Plus, Trash2, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import { COMMON_LOCATIONS } from "../data/srmLocations";

export default function RouteStopsEditor({ stops, onChangeStops }) {
  const [activeLocationField, setActiveLocationField] = useState(null);
  function handleUpdateStop(index, place) {
    const updated = [...stops];
    updated[index] = {
      ...updated[index],
      name: place.name || place.label || "",
      label: place.label || place.name || "",
      lat: place.lat,
      lng: place.lng,
    };
    onChangeStops(updated);
  }

  function handleNameChange(index, newName) {
    const updated = [...stops];
    updated[index] = {
      ...updated[index],
      name: newName,
      label: newName,
    };
    onChangeStops(updated);
  }

  function handleAddViaStop() {
    // Insert before the last stop (destination)
    const updated = [...stops];
    const newStop = {
      name: "",
      label: "",
      lat: null,
      lng: null,
      order_index: updated.length - 1,
    };
    updated.splice(updated.length - 1, 0, newStop);
    // Re-index
    updated.forEach((s, idx) => {
      s.order_index = idx;
    });
    onChangeStops(updated);
  }

  function handleRemoveStop(index) {
    if (stops.length <= 2) return; // Keep origin and destination minimum
    const updated = stops.filter((_, idx) => idx !== index);
    updated.forEach((s, idx) => {
      s.order_index = idx;
    });
    onChangeStops(updated);
  }

  function handleMoveStop(index, direction) {
    const targetIdx = index + direction;
    // Don't move origin or destination outside bounds
    if (targetIdx <= 0 || targetIdx >= stops.length - 1) return;
    const updated = [...stops];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    updated.forEach((s, idx) => {
      s.order_index = idx;
    });
    onChangeStops(updated);
  }

  function handleAddPresetStop(loc) {
    const updated = [...stops];
    const newStop = {
      name: loc.name,
      label: loc.label,
      lat: loc.lat,
      lng: loc.lng,
      order_index: updated.length - 1,
    };
    updated.splice(updated.length - 1, 0, newStop);
    updated.forEach((s, idx) => {
      s.order_index = idx;
    });
    onChangeStops(updated);
  }

  return (
    <div className="route-stops-editor">
      <div className="editor-header">
        <label className="field-label">
          <span>Route & Intermediate Stops</span>
        </label>
        <span className="field-help-text">
          Add intermediate via stops so ride seekers along your journey can hop on!
        </span>
      </div>

      <div className="stops-list">
        {stops.map((stop, index) => {
          const isOrigin = index === 0;
          const isDestination = index === stops.length - 1;
          const isIntermediate = !isOrigin && !isDestination;

          let roleLabel = isOrigin
            ? "1. Starting Point (Pickup)"
            : isDestination
            ? `${stops.length}. Final Destination (Dropoff)`
            : `${index + 1}. Via Stop`;

          return (
            <div
              key={`stop-row-${index}`}
              className={`stop-row-card ${isIntermediate ? "stop-row-via" : ""}`}
            >
              <div className="stop-index-indicator">
                <span
                  className={`stop-bullet ${
                    isOrigin
                      ? "bullet-origin"
                      : isDestination
                      ? "bullet-dest"
                      : "bullet-via"
                  }`}
                >
                  {isOrigin ? "A" : isDestination ? "B" : index}
                </span>
                {index < stops.length - 1 && <span className="stop-connect-line" />}
              </div>

              <div className="stop-content">
                <LocationAutocomplete
                  fieldId={`stop-${index}`}
                  activeField={activeLocationField}
                  onSetActiveField={setActiveLocationField}
                  label={roleLabel}
                  value={stop.name || ""}
                  placeholder={
                    isOrigin
                      ? "e.g. SRM University - AP or Vijayawada"
                      : isDestination
                      ? "e.g. Guntur or PNBS Bus Stand"
                      : "e.g. Tadepalli or Mangalagiri"
                  }
                  onChange={(val) => handleNameChange(index, val)}
                  onSelect={(place) => handleUpdateStop(index, place)}
                  showQuickChips={false}
                  required={isOrigin || isDestination}
                />
              </div>

              <div className="stop-actions">
                {isIntermediate && (
                  <>
                    <button
                      type="button"
                      className="stop-ctrl-btn"
                      title="Move stop up"
                      disabled={index <= 1}
                      onClick={() => handleMoveStop(index, -1)}
                      aria-label="Move stop up"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="stop-ctrl-btn"
                      title="Move stop down"
                      disabled={index >= stops.length - 2}
                      onClick={() => handleMoveStop(index, 1)}
                      aria-label="Move stop down"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="stop-ctrl-btn delete-btn"
                      title="Remove via stop"
                      onClick={() => handleRemoveStop(index)}
                      aria-label="Remove via stop"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Common Hubs for empty Pickup or Destination */}
      {(!stops[0]?.name || !stops[stops.length - 1]?.name) && (
        <div className="common-hubs-quick-row">
          <span className="suggestion-label">
            <Sparkles size={13} /> Quick hubs {!stops[0]?.name ? "(for Pickup):" : "(for Destination):"}
          </span>
          {COMMON_LOCATIONS.slice(0, 4).map((loc) => (
            <button
              type="button"
              key={`quick-hub-${loc.id}`}
              className="chip-btn chip-sm"
              onClick={() => {
                if (!stops[0]?.name) {
                  handleUpdateStop(0, loc);
                } else if (!stops[stops.length - 1]?.name) {
                  handleUpdateStop(stops.length - 1, loc);
                }
              }}
            >
              + {loc.name}
            </button>
          ))}
        </div>
      )}

      {/* Prominent + Add via Button and Quick Presets */}
      <div className="stops-toolbar">
        <button
          type="button"
          className="button button-outline add-via-btn"
          onClick={handleAddViaStop}
        >
          <Plus size={16} />
          <strong>+ Add via</strong>
        </button>

        <div className="common-via-suggestions">
          <span className="suggestion-label">
            <Sparkles size={13} /> Quick via hubs:
          </span>
          {COMMON_LOCATIONS.filter((l) => ["tadepalli", "mangalagiri-town", "aiims-mangalagiri"].includes(l.id)).map((loc) => (
            <button
              type="button"
              key={`quick-via-${loc.id}`}
              className="chip-btn chip-sm"
              onClick={() => handleAddPresetStop(loc)}
            >
              + {loc.name.replace(" (Bus Stand)", "")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
