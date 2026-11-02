import * as THREE from 'three';
import { planetPoint, terrainIndices } from './globe-math.js';
import { marsMaterial } from './mars-material.js';

export function createTerrainSurface(data, texture, baseRadiusAt, innerMask = null) {
  const { rows, cols, bounds, radii, heights, measured } = data;
  const [west, south, east, north] = bounds;
  const point = (lon, lat, radius) => new THREE.Vector3(...planetPoint(lon, lat, radius));
  const center = point((west + east) / 2, (south + north) / 2, radii[Math.floor(radii.length / 2)]);
  const positions = [], colors = [], uvs = [];
  let minHeight = Infinity, maxHeight = -Infinity;
  for (let i = 0; i < heights.length; i++) if (!measured || measured[i]) {
    minHeight = Math.min(minHeight, heights[i]); maxHeight = Math.max(maxHeight, heights[i]);
  }
  const add = (longitude, latitude, radius, height = minHeight) => {
    positions.push(...point(longitude, latitude, radius).sub(center).toArray());
    const t = THREE.MathUtils.clamp((height - minHeight) / Math.max(1, maxHeight - minHeight), 0, 1);
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
  if (innerMask) {
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
      compile(shader);
      shader.uniforms.innerTerrainBounds = { value: innerMask };
      shader.fragmentShader = 'uniform vec4 innerTerrainBounds;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float maskLon=vMapUv.x*360.0-180.0, maskLat=vMapUv.y*180.0-90.0;
        float maskMid=(innerTerrainBounds.x+innerTerrainBounds.z)*0.5;
        maskLon=maskMid+mod(maskLon-maskMid+540.0,360.0)-180.0;
        if(innerTerrainBounds.z>innerTerrainBounds.x && maskLon>innerTerrainBounds.x && maskLon<innerTerrainBounds.z && maskLat>innerTerrainBounds.y && maskLat<innerTerrainBounds.w) discard;`);
    };
  }
  const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(center);
  return { mesh, data, outer };
}

// Sample the wider context window for the inner window's display-only collar.
// The source height grids remain unmodified and are still served by the API.
export function contextRadiusAt(data, longitude, latitude, fallback) {
  const [west, south, east, north] = data.bounds;
  const center = (west + east) / 2;
  const lon = center + ((longitude - center + 540) % 360) - 180;
  if (lon < west || lon > east || latitude < south || latitude > north) return fallback(longitude, latitude);
  const x = (lon - west) / (east - west) * (data.cols - 1);
  const y = (north - latitude) / (north - south) * (data.rows - 1);
  const x0 = Math.min(data.cols - 2, Math.floor(x)), y0 = Math.min(data.rows - 2, Math.floor(y));
  const fx = x - x0, fy = y - y0, at = (xx, yy) => data.radii[yy * data.cols + xx];
  return (1 - fy) * ((1 - fx) * at(x0, y0) + fx * at(x0 + 1, y0))
    + fy * ((1 - fx) * at(x0, y0 + 1) + fx * at(x0 + 1, y0 + 1));
}
