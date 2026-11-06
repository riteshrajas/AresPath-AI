import { planetPoint, SCALE } from "./globe-math.js";

// Keep heights separate from planetary radii: the areoid is not a sphere.
export function buildRouteProfile(route) {
  if (!route?.points?.length) return null;
  const measured =
    Array.isArray(route.heights_m) &&
    route.heights_m.length === route.points.length &&
    route.heights_m.every(Number.isFinite);
  let distance = 0,
    previous;
  const samples = route.points.map((point, index) => {
    const position = planetPoint(...point);
    if (previous)
      distance +=
        Math.hypot(...position.map((value, i) => value - previous[i])) / SCALE;
    previous = position;
    return {
      distance,
      height: measured ? route.heights_m[index] : point[2] - route.points[0][2],
      point,
    };
  });
  const heights = samples.map((sample) => sample.height);
  return {
    samples,
    total: distance,
    min: Math.min(...heights),
    max: Math.max(...heights),
    datum: measured
      ? "Elevation · source areoid datum"
      : "Radial change from start · legacy route; recalculate for elevation",
  };
}

export function profileAt(profile, fraction) {
  const distance = Math.max(0, Math.min(1, fraction)) * profile.total;
  let low = 0,
    high = profile.samples.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (profile.samples[mid].distance <= distance) low = mid;
    else high = mid;
  }
  const a = profile.samples[low],
    b = profile.samples[high],
    t = (distance - a.distance) / Math.max(1e-9, b.distance - a.distance);
  return { distance, height: a.height + (b.height - a.height) * t };
}

export const formatDistance = (value) =>
  value < 1000
    ? `${Math.round(value)} m`
    : `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} km`;
