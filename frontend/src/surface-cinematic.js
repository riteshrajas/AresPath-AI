import * as THREE from 'three';
import { planetPoint, SCALE } from './globe-math.js';
import { VIEW_PRESETS } from './filter-presets.js';
import { tracingGeometry } from './trace-mask.js';

export const SURFACE_EYE_HEIGHT = 2.5;

export function surfaceEyePosition(mesh, longitude, latitude) {
  const up = new THREE.Vector3(...planetPoint(longitude, latitude, 1)).normalize();
  mesh.updateWorldMatrix(true, false);
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const bounds = mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
  const startRadius = bounds.center.dot(up) + bounds.radius + 10 * SCALE;
  const ray = new THREE.Raycaster(up.clone().multiplyScalar(startRadius), up.clone().negate());
  const hit = ray.intersectObject(mesh, false)[0];
  if (!hit) throw Error('Could not locate the ground beneath this viewpoint. Choose another point.');
  // Use the actual triangle underfoot, including its measured elevation and
  // slope, rather than bilinear grid interpolation or a planet datum.
  return hit.point.clone().addScaledVector(up, SURFACE_EYE_HEIGHT * SCALE);
}

export const SURFACE_CINEMATIC = Object.freeze({
  ...VIEW_PRESETS.find(preset => preset.name === 'Cinematic').values,
  bounces: 5, samples: 256, renderScale: 1,
});

// Full measured detail underfoot; wider windows use distance LOD for BVH
// memory. Raster terrain and all downloaded source grids remain unchanged.
export function surfaceTracingGeometry(data, origin, innerBounds, level = 0) {
  const stride = level === 0 ? 1 : level === 1 ? 2 : 4;
  const xs = [], ys = [];
  for (let x = 0; x < data.cols - 1; x += stride) xs.push(x);
  for (let y = 0; y < data.rows - 1; y += stride) ys.push(y);
  xs.push(data.cols - 1); ys.push(data.rows - 1);
  const positions = [], uvs = [], indices = [];
  const [west, south, east, north] = data.bounds;
  for (const y of ys) for (const x of xs) {
    const lon = west + (east - west) * x / (data.cols - 1);
    const lat = north - (north - south) * y / (data.rows - 1);
    const p = planetPoint(lon, lat, data.radii[y * data.cols + x]);
    positions.push(p[0] - origin.x, p[1] - origin.y, p[2] - origin.z);
    uvs.push((lon + 180) / 360, (lat + 90) / 180);
  }
  for (let y = 0; y < ys.length - 1; y++) for (let x = 0; x < xs.length - 1; x++) {
    const i = y * xs.length + x;
    indices.push(i, i + xs.length, i + 1, i + 1, i + xs.length, i + xs.length + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const result = tracingGeometry(geometry, innerBounds); geometry.dispose();
  return result;
}

export function applySurfaceCinematic(renderer) {
  const exposure = renderer.toneMappingExposure, filter = renderer.domElement.style.filter;
  renderer.toneMappingExposure = SURFACE_CINEMATIC.exposure;
  renderer.domElement.style.filter = `contrast(${SURFACE_CINEMATIC.contrast}) saturate(${SURFACE_CINEMATIC.saturation})`;
  return () => { renderer.toneMappingExposure = exposure; renderer.domElement.style.filter = filter; };
}
