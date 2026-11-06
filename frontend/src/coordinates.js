import { Raycaster, Sphere, Vector2, Vector3 } from 'three';

const degrees = 180 / Math.PI;
const wrapLongitude = value => ((value + 180) % 360 + 360) % 360 - 180;

// Same longitude convention as planetPoint: +X is 0°, -Z is 90° east.
// At either exact pole longitude is undefined; use the conventional 0°.
export function coordinatesForPoint(point) {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  const radius = Math.hypot(point.x, point.y, point.z);
  if (!Number.isFinite(radius) || radius === 0) return null;
  const longitude = point.x === 0 && point.z === 0 ? 0 : wrapLongitude(Math.atan2(-point.z, point.x) * degrees);
  const latitude = Math.asin(Math.max(-1, Math.min(1, point.y / radius))) * degrees;
  return { longitude: longitude || 0, latitude: latitude || 0 };
}

export const pointToCoordinates = coordinatesForPoint;

// Human-readable geographic direction, not elevation or a surveyed position.
export function formatCoordinates(coordinates, decimals = 4) {
  if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)
      || Math.abs(coordinates.latitude) > 90) return 'Looking at sky';
  const precision = Number.isFinite(decimals) ? Math.max(0, Math.min(6, Math.trunc(decimals))) : 4;
  const latitude = Number(coordinates.latitude.toFixed(precision));
  const longitude = Number(wrapLongitude(coordinates.longitude).toFixed(precision));
  return `${Math.abs(latitude).toFixed(precision)}° ${latitude < 0 ? 'S' : 'N'} · ${Math.abs(longitude).toFixed(precision)}° ${longitude < 0 ? 'W' : 'E'}`;
}

const raycaster = new Raycaster();
const sphere = new Sphere(new Vector3(), 280);
const hit = new Vector3();
const pointer = new Vector2();

// Analytic reference-sphere readout: no dense terrain raycasting. This is an
// approximation to the surface direction, not a DEM intersection. NDC is
// optional so a future cursor readout can share the center-view implementation.
export function raySphereCoordinates(camera, radius = 280, ndc = { x: 0, y: 0 }) {
  if (!camera || !Number.isFinite(radius) || radius <= 0
      || !Number.isFinite(ndc?.x) || !Number.isFinite(ndc?.y)) return null;
  camera.updateWorldMatrix(true, false);
  raycaster.setFromCamera(pointer.set(ndc.x, ndc.y), camera);
  sphere.radius = radius;
  const point = raycaster.ray.intersectSphere(sphere, hit);
  return point ? coordinatesForPoint(point) : null;
}
