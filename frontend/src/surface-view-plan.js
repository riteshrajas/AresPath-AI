import { pointToTile } from './terrain-client.js';

// A source-matched inner ring and progressively wider rings cover every
// azimuth, including distant crater rims. No view-direction culling is used.
export function planSurfaceView(longitude, latitude, resolutionMeters = 200) {
  const resolution = Number.isFinite(resolutionMeters) && resolutionMeters > 0 ? resolutionMeters : 200;
  const firstZ = Math.max(8, Math.min(18, Math.ceil(Math.log2(21344000 / (128 * resolution)))));
  const plans = [];
  for (let z = firstZ; ; z = Math.max(6, z - 2)) {
    const center = pointToTile(longitude, latitude, z), n = 2 ** z;
    const ring = plans.length ? 2 : 1;
    const left = center.x - ring, right = center.x + ring;
    const top = Math.max(0, center.y - ring), bottom = Math.min(n - 1, center.y + ring);
    const tiles = [];
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++)
      tiles.push({ z, x: (x + n) % n, y, column: x - left, row: y - top });
    plans.push({ key: `surface/${z}/${center.x}/${center.y}`, z, tiles,
      columns: right - left + 1, rows: bottom - top + 1,
      centerColumn: center.x - left, centerRow: center.y - top,
      size: 129, concurrency: 4,
      bounds: [-180 + 360 * left / n, 90 - 180 * (bottom + 1) / n,
        -180 + 360 * (right + 1) / n, 90 - 180 * top / n] });
    // Up to ~400 km of distant relief, then the complete global DEM remains
    // behind it. Extend at high latitudes where longitudinal tiles narrow.
    if (z <= 6 || (z <= 8 && Math.abs(latitude) < 70)) break;
  }
  return plans;
}
