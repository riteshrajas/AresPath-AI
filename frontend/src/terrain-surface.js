import * as THREE from 'three';
import { SCALE, planetPoint, terrainIndices } from './globe-math.js';
import { marsMaterial } from './mars-material.js';
import { terrainOcclusion, applyTerrainLighting } from './terrain-lighting.js';
import { attachTerrainAnalysis } from './terrain-analysis.js';

export function createTerrainNormalTexture(data) {
  const { rows, cols, bounds, radii, heights, measured } = data;
  if (!rows || !cols || rows < 2 || cols < 2 || !heights || !radii) {
    const flat = new Uint8Array([128, 128, 255, 255]);
    const tex = new THREE.DataTexture(flat, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.needsUpdate = true;
    tex.channel = 1;
    return tex;
  }
  const pixels = new Uint8Array(rows * cols * 4);
  const radians = Math.PI / 180;
  const [west, south, east, north] = bounds;
  const lonSpan = Math.abs(east - west);
  const latSpan = Math.abs(north - south);

  const getHeight = (x, y) => {
    const i = y * cols + x;
    if (measured && !measured[i]) return null;
    const h = heights[i];
    return Number.isFinite(h) ? h : null;
  };

  for (let y = 0; y < rows; y++) {
    const lat = (north - latSpan * y / (rows - 1)) * radians;
    const cosLat = Math.max(0.001, Math.cos(lat));
    const texY = rows - 1 - y;
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const radius = radii[idx] || 3396000;
      const dx = Math.max(0.01, lonSpan * radians * radius * cosLat / (cols - 1));
      const dy = Math.max(0.01, latSpan * radians * radius / (rows - 1));

      const x0 = Math.max(0, x - 1), x1 = Math.min(cols - 1, x + 1);
      const y0 = Math.max(0, y - 1), y1 = Math.min(rows - 1, y + 1);

      const hCenter = getHeight(x, y) ?? 0;
      const hL = getHeight(x0, y) ?? hCenter;
      const hR = getHeight(x1, y) ?? hCenter;
      const hT = getHeight(x, y0) ?? hCenter;
      const hB = getHeight(x, y1) ?? hCenter;

      const dz_dx = (x1 > x0) ? (hR - hL) / ((x1 - x0) * dx) : 0;
      const dz_dy_north = (y1 > y0) ? (hT - hB) / ((y1 - y0) * dy) : 0;

      const nx = -dz_dx;
      const ny = -dz_dy_north;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);

      const offset = (texY * cols + x) * 4;
      pixels[offset]     = Math.min(255, Math.max(0, Math.round((nx / len * 0.5 + 0.5) * 255)));
      pixels[offset + 1] = Math.min(255, Math.max(0, Math.round((ny / len * 0.5 + 0.5) * 255)));
      pixels[offset + 2] = Math.min(255, Math.max(0, Math.round((nz / len * 0.5 + 0.5) * 255)));
      pixels[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(pixels, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.channel = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createTerrainSurface(data, texture, baseRadiusAt, innerMask = null, cache = null) {
  const { rows, cols, bounds, radii, heights, measured } = data;
  const [west, south, east, north] = bounds;
  const point = (lon, lat, radius) => new THREE.Vector3(...planetPoint(lon, lat, radius));
  const center = point((west + east) / 2, (south + north) / 2, radii[Math.floor(radii.length / 2)]);
  const positions = [], colors = [], uvs = [], localUvs = [];
  const baseOcclusion = cache?.occlusion || (cache?.fast ? new Float32Array(rows * cols).fill(1) : terrainOcclusion(data));
  const occlusion = Array.from(baseOcclusion);
  let minHeight = Infinity, maxHeight = -Infinity;
  for (let i = 0; i < heights.length; i++) if (!measured || measured[i]) {
    minHeight = Math.min(minHeight, heights[i]); maxHeight = Math.max(maxHeight, heights[i]);
  }
  const add = (longitude, latitude, radius, height = minHeight, u = 0, v = 0) => {
    const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
    const scaledRadius = radius * SCALE, horizontal = scaledRadius * Math.cos(lat);
    positions.push(horizontal * Math.cos(lon) - center.x,
      scaledRadius * Math.sin(lat) - center.y, -horizontal * Math.sin(lon) - center.z);
    const t = THREE.MathUtils.clamp((height - minHeight) / Math.max(1, maxHeight - minHeight), 0, 1);
    colors.push(.34 + .19 * t, .20 + .13 * t, .14 + .08 * t);
    uvs.push((longitude + 180) / 360, (latitude + 90) / 180);
    localUvs.push(u, v);
  };
  for (let y = 0; y < rows; y++) {
    const v = rows > 1 ? 1 - y / (rows - 1) : 0;
    for (let x = 0; x < cols; x++) {
      const u = cols > 1 ? x / (cols - 1) : 0;
      add(west + (east - west) * x / (cols - 1), north - (north - south) * y / (rows - 1),
        radii[y * cols + x], heights[y * cols + x], u, v);
    }
  }
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
      const u = THREE.MathUtils.clamp(cols > 1 ? x / (cols - 1) : 0, 0, 1);
      const v = THREE.MathUtils.clamp(rows > 1 ? 1 - y / (rows - 1) : 0, 0, 1);
      const longitude = west + (east - west) * x / (cols - 1), latitude = north - (north - south) * y / (rows - 1);
      const outerLon = outer[0] + (outer[2] - outer[0]) * x / (cols - 1);
      const outerLat = outer[3] - (outer[3] - outer[1]) * y / (rows - 1);
      const lon = longitude + t * (outerLon - longitude), lat = latitude + t * (outerLat - latitude);
      current.push(positions.length / 3);
      occlusion.push(1 + (occlusion[index] - 1) * (1 - t));
      add(lon, lat, (1 - t) * radii[index] + t * (baseRadiusAt(lon, lat) + 2) - (ring === 3 ? 2000 : 0), heights[index], u, v);
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
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(localUvs, 2));
  geometry.setAttribute('terrainAO', new THREE.Float32BufferAttribute(occlusion, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const analysis = attachTerrainAnalysis(geometry, data, cache?.analysis);
  const normalTexture = cache?.normalTexture || (cache?.fast ? null : createTerrainNormalTexture(data));
  // Use the same basemap and grade as the globe at every zoom. Elevation still
  // shapes the geometry; it no longer recolors each window into a tan palette.
  const material = marsMaterial(texture, THREE.DoubleSide); material.vertexColors = true;
  if (normalTexture) {
    material.normalMap = normalTexture;
    material.normalMap.channel = 1;
    material.normalScale = new THREE.Vector2(1.0, 1.0);
  }
  const ownsNormalTexture = !cache?.normalTexture && !!normalTexture;
  const originalDispose = material.dispose.bind(material);
  material.dispose = () => {
    if (ownsNormalTexture) normalTexture?.dispose();
    originalDispose();
  };
  const marsMaterialCompile = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    marsMaterialCompile(shader);
    applyTerrainLighting(shader);
  };
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
  return { mesh, data, outer, occlusion: baseOcclusion, normalTexture, analysis };
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
