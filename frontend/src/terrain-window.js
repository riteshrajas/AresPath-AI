import { pointToTile } from './terrain-client.js';

export function planTerrainWindow(longitude, latitude, rangeMeters, aspect = 1, fov = 45) {
  const visibleWidth = Math.max(100, 2 * rangeMeters * Math.tan(fov * Math.PI / 360) * Math.max(1, aspect));
  const z = Math.max(2, Math.min(18, Math.floor(Math.log2(2 * 21344000 / visibleWidth))));
  const center = pointToTile(longitude, latitude, z), n = 2 ** z;
  const left = center.x - 1, right = center.x + 1;
  const top = Math.max(0, center.y - 1), bottom = Math.min(n - 1, center.y + 1);
  const tiles = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++)
    tiles.push({ z, x: (x + n) % n, y, column: x - left, row: y - top });
  return { key: `${z}/${center.x}/${center.y}`, z, tiles, columns: 3, rows: bottom - top + 1,
    // A smaller preview grid is enough only while the camera is genuinely far
    // away. Keep mid-range views at full tile density so terrain does not look
    // soft during the transition into a close inspection.
    size: z < 10 ? 33 : 65,
    bounds: [-180 + 360 * left / n, 90 - 180 * (bottom + 1) / n,
      -180 + 360 * (right + 1) / n, 90 - 180 * top / n] };
}

// Inclusive tile edges share one output node. Longitudes stay unwrapped across
// the dateline so the assembled surface and its visual collar are continuous.
export function assembleTerrainWindow(plan, tiles) {
  const size = tiles[0].grid.rows;
  if (!tiles.every(tile => tile.grid.rows === size && tile.grid.cols === size && tile.revision === tiles[0].revision))
    throw Error('Terrain tiles must have matching grids and catalog revisions');
  const cols = plan.columns * (size - 1) + 1, rows = plan.rows * (size - 1) + 1;
  const radii = new Float64Array(rows * cols), heights = new Float64Array(rows * cols);
  const sources = new Uint16Array(rows * cols), metadata = new Map();
  tiles.forEach((tile, index) => {
    const placement = plan.tiles[index];
    tile.sources.forEach(source => metadata.set(source.id, source));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = y * size + x, to = (placement.row * (size - 1) + y) * cols + placement.column * (size - 1) + x;
      radii[to] = tile.grid.radii_m[from]; heights[to] = tile.grid.heights_m[from]; sources[to] = tile.grid.source_ids[from];
    }
  });
  return { rows, cols, radii, heights, sources, sourceMetadata: [...metadata.values()], bounds: plan.bounds, z: plan.z };
}

export async function fetchTerrainWindow(api, plan, signal, onProgress = () => {}) {
  if (signal.aborted) throw new DOMException('Terrain request canceled', 'AbortError');
  const results = new Array(plan.tiles.length);
  let next = 0, completed = 0;
  // Request the visible ring in parallel. The API and browser cache still
  // bound the total work, while the old three-at-a-time queue made every
  // refinement wait behind three serial batches.
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < plan.tiles.length) {
      const index = next++, tile = plan.tiles[index];
      results[index] = await api.tile(tile.z, tile.x, tile.y, plan.size, signal);
      onProgress(++completed, plan.tiles.length);
    }
  }));
  if (signal.aborted) throw new DOMException('Terrain request canceled', 'AbortError');
  return assembleTerrainWindow(plan, results);
}
