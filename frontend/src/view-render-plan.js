import * as THREE from 'three';

// Sample the visible sphere in normalized screen coordinates. This is an
// approximation to the actual elevated terrain/frustum intersection: the
// sphere does not know about peaks, and a finite sample may miss small slivers.
// Callers must present it as a bounded view refinement, not complete coverage.
export function planVisibleTerrain(camera, options = {}) {
  const { targetZ = 14, maxTiles = 36, size = 65, concurrency = 6, radius = 280, samples = 25 } = options;
  if (!Number.isInteger(targetZ) || !Number.isInteger(maxTiles) || maxTiles < 16 ||
      !Number.isInteger(samples) || samples < 3 || !Number.isFinite(radius) || radius <= 0)
    throw Error('Invalid view terrain planning parameters');
  camera.updateMatrixWorld();
  const origin = new THREE.Vector3(); camera.getWorldPosition(origin);
  const toSurface = (x, y) => {
    const direction = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(origin).normalize();
    const b = origin.dot(direction), c = origin.lengthSq() - radius * radius;
    const discriminant = b * b - c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const distance = -b - root >= 0 ? -b - root : -b + root;
    return distance >= 0 ? origin.clone().addScaledVector(direction, distance) : null;
  };
  const positions = [], grid = [];
  for (let row = 0; row < samples; row++) {
    const cells = [];
    for (let col = 0; col < samples; col++) {
      const x = -1 + 2 * col / (samples - 1), y = -1 + 2 * row / (samples - 1);
      const point = toSurface(x, y); cells.push({ x, y, point });
      if (point) positions.push(point);
    }
    grid.push(cells);
  }
  // Bisect each sampled hit/miss boundary to include points near the horizon.
  // This improves the footprint but does not prove coverage between samples.
  for (let row = 0; row < samples; row++) for (let col = 0; col < samples; col++) {
    const cell = grid[row][col];
    for (const neighbor of [grid[row]?.[col + 1], grid[row + 1]?.[col]]) {
      if (!neighbor || Boolean(cell.point) === Boolean(neighbor.point)) continue;
      let hit = cell.point ? cell : neighbor, miss = cell.point ? neighbor : cell;
      for (let i = 0; i < 12; i++) {
        const x = (hit.x + miss.x) / 2, y = (hit.y + miss.y) / 2, point = toSurface(x, y);
        if (point) hit = { x, y, point }; else miss = { x, y, point: null };
      }
      positions.push(hit.point);
    }
  }
  if (!positions.length) return null;

  const coordinates = positions.map(point => ({
    lon: THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(-point.z, point.x)), 360),
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(point.y / radius, -1, 1)))
  }));
  const longitudes = coordinates.map(p => p.lon).sort((a, b) => a - b);
  let largestGap = -1, gapIndex = 0;
  for (let i = 0; i < longitudes.length; i++) {
    const next = i + 1 < longitudes.length ? longitudes[i + 1] : longitudes[0] + 360;
    if (next - longitudes[i] > largestGap) { largestGap = next - longitudes[i]; gapIndex = i; }
  }
  let west = longitudes[(gapIndex + 1) % longitudes.length];
  if (west >= 180) west -= 360;
  let east = west + 360 - largestGap;
  let south = Math.min(...coordinates.map(p => p.lat)), north = Math.max(...coordinates.map(p => p.lat));

  const poleVisible = sign => {
    const pole = new THREE.Vector3(0, sign * radius, 0);
    if (pole.dot(origin.clone().sub(pole)) <= 0) return false;
    const projected = pole.clone().project(camera);
    return Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1;
  };
  if (poleVisible(1)) { north = 90; west = -180; east = 180; }
  if (poleVisible(-1)) { south = -90; west = -180; east = 180; }
  const marginLon = Math.max((east - west) * 0.05, 1e-7), marginLat = Math.max((north - south) * 0.05, 1e-7);
  if (east - west + 2 * marginLon >= 360) { west = -180; east = 180; }
  else { west -= marginLon; east += marginLon; }
  south = Math.max(-90, south - marginLat); north = Math.min(90, north + marginLat);

  const requestedZ = Math.max(2, Math.min(18, targetZ));
  const limits = z => {
    const n = 2 ** z;
    const left = Math.floor((west + 180) / 360 * n);
    const right = Math.min(left + n - 1, Math.max(left, Math.ceil((east + 180) / 360 * n) - 1));
    const top = Math.max(0, Math.min(n - 1, Math.floor((90 - north) / 180 * n)));
    const bottom = Math.max(top, Math.min(n - 1, Math.ceil((90 - south) / 180 * n) - 1));
    return { n, left, right, top, bottom, count: (right - left + 1) * (bottom - top + 1) };
  };
  let z = requestedZ, extent = limits(z);
  while (z > 2 && extent.count > maxTiles) extent = limits(--z);
  const { n, left, right, top, bottom } = extent, tiles = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++)
    tiles.push({ z, x: ((x % n) + n) % n, y, column: x - left, row: y - top });
  return {
    key: `view/${z}/${left}/${right}/${top}/${bottom}`, z, tiles,
    columns: right - left + 1, rows: bottom - top + 1,
    centerColumn: (right - left) / 2, centerRow: (bottom - top) / 2,
    concurrency, size,
    bounds: [-180 + 360 * left / n, 90 - 180 * (bottom + 1) / n,
      -180 + 360 * (right + 1) / n, 90 - 180 * top / n],
    coverage: { approximate: true, sampleHits: positions.length, targetZ: requestedZ,
      selectedZ: z, limitedByBudget: z < requestedZ, maxTiles }
  };
}
