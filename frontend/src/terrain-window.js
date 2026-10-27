import { pointToTile } from './terrain-client.js';

export function planTerrainWindow(longitude, latitude, rangeMeters, aspect = 1, fov = 45) {
  const visibleWidth = Math.max(100, 2 * rangeMeters * Math.tan(fov * Math.PI / 360) * Math.max(1, aspect));
  const baseZ = Math.floor(Math.log2(2 * 21344000 / visibleWidth));
  // Turbo spends two extra tile levels on the visible source raster. This
  // reduces nearest-cell terracing without changing the measured elevations.
  const z = Math.max(2, Math.min(18, baseZ + (globalThis.__ARESPATH_TURBO__ ? 2 : 0)));
  const center = pointToTile(longitude, latitude, z), n = 2 ** z;
  const ring = globalThis.__ARESPATH_TURBO__ ? 2 : 1;
  const left = center.x - ring, right = center.x + ring;
  const top = Math.max(0, center.y - ring), bottom = Math.min(n - 1, center.y + ring);
  const tiles = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++)
    tiles.push({ z, x: (x + n) % n, y, column: x - left, row: y - top });
  return { key: `${z}/${center.x}/${center.y}`, z, tiles, columns: right - left + 1, rows: bottom - top + 1,
    concurrency: globalThis.__ARESPATH_TURBO__ ? 9 : 6,
    // A smaller preview grid is enough only while the camera is genuinely far
    // away. Keep mid-range views at full tile density so terrain does not look
    // soft during the transition into a close inspection.
    size: z < 8 ? 33 : 65,
    ring,
    bounds: [-180 + 360 * left / n, 90 - 180 * (bottom + 1) / n,
      -180 + 360 * (right + 1) / n, 90 - 180 * top / n] };
}

// Inclusive tile edges share one output node. Longitudes stay unwrapped across
// the dateline so the assembled surface and its visual collar are continuous.
export function assembleTerrainWindow(plan, tiles, fallbackRadiusAt) {
  const first = tiles.find(Boolean);
  if (!first) return null;
  const size = first.grid.rows;
  if (!tiles.filter(Boolean).every(tile => tile.grid.rows === size && tile.grid.cols === size && tile.revision === first.revision))
    throw Error('Terrain tiles must have matching grids and catalog revisions');
  const cols = plan.columns * (size - 1) + 1, rows = plan.rows * (size - 1) + 1;
  const radii = new Float64Array(rows * cols), heights = new Float64Array(rows * cols);
  const sources = new Uint16Array(rows * cols), metadata = new Map();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const longitude = plan.bounds[0] + (plan.bounds[2] - plan.bounds[0]) * x / (cols - 1);
    const latitude = plan.bounds[3] - (plan.bounds[3] - plan.bounds[1]) * y / (rows - 1);
    radii[y * cols + x] = fallbackRadiusAt ? fallbackRadiusAt(longitude, latitude) : first.grid.radii_m[0];
  }
  tiles.forEach((tile, index) => {
    if (!tile) return;
    const placement = plan.tiles[index];
    tile.sources.forEach(source => metadata.set(source.id, source));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = y * size + x, to = (placement.row * (size - 1) + y) * cols + placement.column * (size - 1) + x;
      radii[to] = tile.grid.radii_m[from]; heights[to] = tile.grid.heights_m[from]; sources[to] = tile.grid.source_ids[from];
    }
  });
  return { rows, cols, radii, heights, sources, sourceMetadata: [...metadata.values()], bounds: plan.bounds, z: plan.z };
}

export async function fetchTerrainWindow(api, plan, signal, onProgress = () => {}, onPartial = () => {}, fallbackRadiusAt) {
  if (signal.aborted) throw new DOMException('Terrain request canceled', 'AbortError');
  const results = new Array(plan.tiles.length);
  let next = 0, completed = 0;
  // Request the visible ring in parallel. The API and browser cache still
  // bound the total work, while the old three-at-a-time queue made every
  // refinement wait behind three serial batches.
  await Promise.all(Array.from({ length: plan.concurrency || 6 }, async () => {
    while (next < plan.tiles.length) {
      const index = next++, tile = plan.tiles[index];
      results[index] = await api.tile(tile.z, tile.x, tile.y, plan.size, signal);
      const done = ++completed;
      onProgress(done, plan.tiles.length);
      if (done === 1 || done % 3 === 0 || done === plan.tiles.length)
        onPartial(assembleTerrainWindow(plan, results, fallbackRadiusAt), done, plan.tiles.length);
    }
  }));
  if (signal.aborted) throw new DOMException('Terrain request canceled', 'AbortError');
  return assembleTerrainWindow(plan, results, fallbackRadiusAt);
}
