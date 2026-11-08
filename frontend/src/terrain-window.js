import * as THREE from 'three';
import { pointToTile } from './terrain-client.js';
import { planetPoint, SCALE } from './globe-math.js';

export function isTileVisible(tile, camera, radiusMeters = 3396000) {
  if (!camera) return true;
  const n = 2 ** tile.z;
  const lonMin = -180 + 360 * tile.x / n;
  const lonMax = -180 + 360 * (tile.x + 1) / n;
  const latMax = 90 - 180 * tile.y / n;
  const latMin = 90 - 180 * (tile.y + 1) / n;

  const points = [
    [lonMin, latMin],
    [lonMax, latMin],
    [lonMin, latMax],
    [lonMax, latMax],
    [(lonMin + lonMax) / 2, (latMin + latMax) / 2]
  ].map(([lon, lat]) => new THREE.Vector3(...planetPoint(lon, lat, radiusMeters)));

  // Spherical horizon culling (generous margin preserves silhouettes near horizon)
  const rSq = (radiusMeters * SCALE) ** 2;
  const overHorizon = points.some(p => p.dot(camera.position) >= 0.94 * rSq);
  if (!overHorizon) return false;

  // Frustum intersection test
  camera.updateMatrixWorld();
  const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreenMatrix);
  const center = points[4];
  let maxDistSq = 0;
  for (let i = 0; i < 4; i++) {
    maxDistSq = Math.max(maxDistSq, center.distanceToSquared(points[i]));
  }
  const boundingSphere = new THREE.Sphere(center, Math.sqrt(maxDistSq) * 1.35);
  return frustum.intersectsSphere(boundingSphere);
}

export function planTerrainWindow(longitude, latitude, rangeMeters, aspect = 1, fov = 45) {
  const visibleWidth = Math.max(100, 2 * rangeMeters * Math.tan(fov * Math.PI / 360) * Math.max(1, aspect));
  const baseZ = Math.floor(Math.log2(2 * 21344000 / visibleWidth));
  // Keep sufficient coverage around the view while improving mesh density.
  // The former +2 bias shrank the five-tile patch to a small rectangle on
  // screen; one extra level doubles its width with the same request budget.
  const z = Math.max(2, Math.min(18, baseZ + (globalThis.__ARESPATH_TURBO__ ? 1 : 0)));
  const center = pointToTile(longitude, latitude, z), n = 2 ** z;
  const ring = globalThis.__ARESPATH_TURBO__ ? 2 : 1;
  const left = center.x - ring, right = center.x + ring;
  const top = Math.max(0, center.y - ring), bottom = Math.min(n - 1, center.y + ring);
  const tiles = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++)
    tiles.push({ z, x: (x + n) % n, y, column: x - left, row: y - top });
  return { key: `${z}/${center.x}/${center.y}`, z, tiles, columns: right - left + 1, rows: bottom - top + 1,
    centerColumn: center.x - left, centerRow: center.y - top,
    concurrency: globalThis.__ARESPATH_TURBO__ ? 9 : 6,
    // A smaller preview grid is enough only while the camera is genuinely far
    // away. Keep mid-range views at full tile density so terrain does not look
    // soft during the transition into a close inspection.
    // Preserve more real source relief near the camera; keep the wider
    // context cheap. Extra samples interpolate where source data is coarser.
    size: z < 8 ? 33 : globalThis.__ARESPATH_TURBO__ && z >= 9 ? 129 : 65,
    ring,
    bounds: [-180 + 360 * left / n, 90 - 180 * (bottom + 1) / n,
      -180 + 360 * (right + 1) / n, 90 - 180 * top / n] };
}

// Lower-resolution context around the fine window.  The API still returns
// real source elevations; 33 nodes per tile and two fewer tile levels keep
// this layer bounded while extending coverage roughly fourfold in each axis.
// Below z=4 the orbital globe is already the appropriate fallback.
export function planOuterTerrainWindow(plan) {
  if (plan.z <= 3) return null;
  const z = Math.max(3, plan.z - 2), n = 2 ** z;
  const primary = plan.tiles.find(tile => tile.column === plan.centerColumn && tile.row === plan.centerRow);
  if (!primary) throw Error('Terrain plan is missing its primary tile');
  const scale = 2 ** (plan.z - z);
  const center = { x: Math.floor(primary.x / scale), y: Math.floor(primary.y / scale) };
  const ring = 2, left = center.x - ring, right = center.x + ring;
  const top = Math.max(0, center.y - ring), bottom = Math.min(n - 1, center.y + ring);
  const tiles = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++)
    tiles.push({ z, x: (x + n) % n, y, column: x - left, row: y - top });
  return {
    key: `outer/${z}/${center.x}/${center.y}`, z, tiles,
    columns: right - left + 1, rows: bottom - top + 1,
    centerColumn: center.x - left, centerRow: center.y - top,
    concurrency: plan.concurrency, size: 33, ring,
    bounds: [-180 + 360 * left / n, 90 - 180 * (bottom + 1) / n,
      -180 + 360 * (right + 1) / n, 90 - 180 * top / n]
  };
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
  const sources = new Uint16Array(rows * cols), measured = new Uint8Array(rows * cols), metadata = new Map();
  radii.fill(NaN);
  tiles.forEach((tile, index) => {
    if (!tile) return;
    const placement = plan.tiles[index];
    tile.sources.forEach(source => metadata.set(source.id, source));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = y * size + x, to = (placement.row * (size - 1) + y) * cols + placement.column * (size - 1) + x;
      radii[to] = tile.grid.radii_m[from]; heights[to] = tile.grid.heights_m[from]; sources[to] = tile.grid.source_ids[from]; measured[to] = 1;
    }
  });
  // Only fill nodes not provided by a completed tile. The fallback is coarse
  // context, not measured detail; keep its height near the loaded tile's
  // areoid-relative elevation so an arbitrary zero does not dominate tint.
  const referenceAreoid = first.grid.radii_m[0] - first.grid.heights_m[0];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const index = y * cols + x;
    if (Number.isFinite(radii[index])) continue;
    const longitude = plan.bounds[0] + (plan.bounds[2] - plan.bounds[0]) * x / (cols - 1);
    const latitude = plan.bounds[3] - (plan.bounds[3] - plan.bounds[1]) * y / (rows - 1);
    const radius = fallbackRadiusAt ? fallbackRadiusAt(longitude, latitude) : first.grid.radii_m[0];
    radii[index] = radius; heights[index] = radius - referenceAreoid;
  }
  return { rows, cols, radii, heights, sources, measured, sourceMetadata: [...metadata.values()], bounds: plan.bounds, z: plan.z };
}

export async function fetchTerrainWindow(api, plan, signal, onProgress = () => {}, onPartial = () => {}, fallbackRadiusAt, options = {}) {
  if (signal.aborted) throw new DOMException('Terrain request canceled', 'AbortError');
  const results = new Array(plan.tiles.length);
  let next = 0, completed = 0, stopped = false;
  // Request the center and nearest tiles first, but keep result indices in
  // geographic order for assembly even when requests complete out of order.
  const centerColumn = plan.centerColumn ?? (plan.columns - 1) / 2, centerRow = plan.centerRow ?? (plan.rows - 1) / 2;
  const camera = options?.camera;
  const radiusMeters = options?.radiusMeters || 3396000;
  const cull = options?.cull ?? Boolean(camera);

  const order = plan.tiles.map((tile, index) => {
    const isPrimary = tile.column === centerColumn && tile.row === centerRow;
    const visible = !cull || isPrimary || isTileVisible(tile, camera, radiusMeters);
    return {
      index,
      visible,
      distance: (tile.column - centerColumn) ** 2 + (tile.row - centerRow) ** 2
    };
  })
  .filter(item => item.visible)
  .sort((a, b) => a.distance - b.distance)
  .map(item => item.index);

  const totalToFetch = order.length;
  // Request the visible ring in parallel. The API and browser cache still
  // bound the total work, while the old three-at-a-time queue made every
  // refinement wait behind three serial batches.
  await Promise.all(Array.from({ length: plan.concurrency || 6 }, async () => {
    try {
      while (!stopped && !signal.aborted && next < order.length) {
        const index = order[next++], tile = plan.tiles[index];
        const result = await api.tile(tile.z, tile.x, tile.y, plan.size, signal, 'display');
        if (stopped || signal.aborted) return;
        results[index] = result;
        const done = ++completed;
        onProgress(done, totalToFetch);
        // The caller renders the final result itself. Limit intermediate
        // full-mesh rebuilds while still displaying early arrivals.
        if (done < totalToFetch && (done === 1 || done % 6 === 0))
          onPartial(assembleTerrainWindow(plan, results, fallbackRadiusAt), done, totalToFetch);
      }
    } catch (error) { stopped = true; throw error; }
  }));
  if (signal.aborted) throw new DOMException('Terrain request canceled', 'AbortError');
  return assembleTerrainWindow(plan, results, fallbackRadiusAt);
}
