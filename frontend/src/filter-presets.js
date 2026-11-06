export const VIEW_PRESETS = [
  {
    name: "Clean",
    values: { places: false, "route-lines": false, "route-endpoints": false },
  },
  {
    name: "Explore",
    values: {
      coordinates: true,
      crosshair: true,
      "saved-places": true,
      "scale-bar": true,
      "camera-altitude": true,
    },
  },
  {
    name: "Terrain study",
    values: {
      "terrain-mode": "slope",
      contours: true,
      coordinates: true,
      "data-info": true,
      places: false,
    },
  },
  {
    name: "Route planning",
    values: {
      "terrain-mode": "slope",
      "layer-opacity": 0.5,
      crosshair: true,
      coordinates: true,
      "all-routes": true,
      "route-directions": true,
      "route-distances": true,
      "route-profile": true,
      "data-info": true,
    },
  },
  {
    name: "Data quality",
    values: {
      "terrain-mode": "resolution",
      "source-seams": true,
      "data-info": true,
      places: false,
    },
  },
  {
    name: "Cinematic",
    values: {
      places: false,
      "route-lines": false,
      "route-endpoints": false,
      exposure: 1.1,
      contrast: 1.1,
      saturation: 0.9,
    },
  },
];
// Reset first: switching presets must not inherit hidden settings.
export function applyViewPreset(registry, preset) {
  registry.reset();
  registry.restore(preset.values);
}
export function loadLocalList(storage, key, validate, limit = 20) {
  try {
    const data = JSON.parse(storage?.getItem(key) || "[]");
    return Array.isArray(data) ? data.filter(validate).slice(0, limit) : [];
  } catch {
    return [];
  }
}
export const validPin = (pin) =>
  pin &&
  typeof pin.name === "string" &&
  pin.name.length <= 80 &&
  Number.isFinite(pin.longitude) &&
  pin.longitude >= -180 &&
  pin.longitude <= 180 &&
  Number.isFinite(pin.latitude) &&
  pin.latitude >= -90 &&
  pin.latitude <= 90;
