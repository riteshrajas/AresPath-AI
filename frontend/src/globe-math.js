export const SCALE = 280 / 3396000;

export function sampleMola(grid, width, height, longitude, latitude, offset = 3396000) {
  const x = (((longitude % 360) + 360) % 360) * width / 360 - 0.5;
  const y = Math.max(0, Math.min(height - 1, (90 - latitude) * height / 180 - 0.5));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const at = (r, c) => grid[Math.min(height - 1, r) * width + ((c % width) + width) % width];
  return offset + (1 - fy) * ((1 - fx) * at(iy, ix) + fx * at(iy, ix + 1))
    + fy * ((1 - fx) * at(iy + 1, ix) + fx * at(iy + 1, ix + 1));
}

export function planetPoint(longitude, latitude, radiusMeters) {
  const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
  const radius = radiusMeters * SCALE;
  return [radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), -radius * Math.cos(lat) * Math.sin(lon)];
}

export function terrainIndices(elevations, rows, cols) {
  const indices = [];
  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
    const a = y * cols + x, b = a + cols, c = a + 1, d = b + 1;
    for (const triangle of [[a, b, c], [c, b, d]]) {
      if (triangle.every(i => elevations[i] !== null)) indices.push(...triangle);
    }
  }
  return indices;
}
