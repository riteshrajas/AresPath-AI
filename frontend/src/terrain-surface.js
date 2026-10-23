import * as THREE from 'three';
import { planetPoint, terrainIndices } from './globe-math.js';
import { marsMaterial } from './mars-material.js';

export function createTerrainSurface(data, texture, baseRadiusAt) {
  const { rows, cols, bounds, radii, heights } = data;
  const [west, south, east, north] = bounds;
  const point = (lon, lat, radius) => new THREE.Vector3(...planetPoint(lon, lat, radius));
  const center = point((west + east) / 2, (south + north) / 2, radii[Math.floor(radii.length / 2)]);
  const positions = [], colors = [], uvs = [];
  let minHeight = Infinity, maxHeight = -Infinity;
  for (const height of heights) { minHeight = Math.min(minHeight, height); maxHeight = Math.max(maxHeight, height); }
  const add = (longitude, latitude, radius, height = minHeight) => {
    positions.push(...point(longitude, latitude, radius).sub(center).toArray());
    const t = (height - minHeight) / Math.max(1, maxHeight - minHeight);
    colors.push(.34 + .19 * t, .20 + .13 * t, .14 + .08 * t);
    uvs.push((longitude + 180) / 360, (latitude + 90) / 180);
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    add(west + (east - west) * x / (cols - 1), north - (north - south) * y / (rows - 1), radii[y * cols + x], heights[y * cols + x]);
  const indices = terrainIndices(heights, rows, cols), border = [];
  for (let x = 0; x < cols; x++) border.push(x);
  for (let y = 1; y < rows; y++) border.push(y * cols + cols - 1);
  for (let x = cols - 2; x >= 0; x--) border.push((rows - 1) * cols + x);
  for (let y = rows - 2; y > 0; y--) border.push(y * cols);
  // Render-only one-cell collar joins the actual coarse globe triangles.
  // Interior source samples remain untouched; the collar is not measured data.
  const padLon = (east - west) / (cols - 1), padLat = (north - south) / (rows - 1);
  const outer = [west - padLon, Math.max(-90, south - padLat), east + padLon, Math.min(90, north + padLat)];
  let previous = border;
  for (let ring = 1; ring <= 3; ring++) {
    const current = [], t = Math.min(ring / 2, 1);
    for (const index of border) {
      const y = Math.floor(index / cols), x = index % cols;
      const longitude = west + (east - west) * x / (cols - 1), latitude = north - (north - south) * y / (rows - 1);
      const outerLon = outer[0] + (outer[2] - outer[0]) * x / (cols - 1);
      const outerLat = outer[3] - (outer[3] - outer[1]) * y / (rows - 1);
      const lon = longitude + t * (outerLon - longitude), lat = latitude + t * (outerLat - latitude);
      current.push(positions.length / 3);
      add(lon, lat, (1 - t) * radii[index] + t * (baseRadiusAt(lon, lat) + 2) - (ring === 3 ? 2000 : 0), heights[index]);
    }
    for (let i = 0; i < border.length; i++) {
      const j = (i + 1) % border.length;
      indices.push(previous[i], current[i], previous[j], previous[j], current[i], current[j]);
    }
    previous = current;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Use the same basemap and grade as the globe at every zoom. Elevation still
  // shapes the geometry; it no longer recolors each window into a tan palette.
  const material = marsMaterial(texture, THREE.DoubleSide); material.vertexColors = true;
  const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(center);
  return { mesh, data, outer };
}
