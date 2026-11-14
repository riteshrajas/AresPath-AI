import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SURFACE_EYE_HEIGHT, SURFACE_CINEMATIC, applySurfaceCinematic, surfaceTracingGeometry, surfaceEyePosition } from '../src/surface-cinematic.js';
import { VIEW_PRESETS } from '../src/filter-presets.js';
import { SCALE } from '../src/globe-math.js';

test('surface uses 2.5 m clearance and the existing Cinematic grade, restoring the map on exit', () => {
  assert.equal(SURFACE_EYE_HEIGHT, 2.5);
  const preset = VIEW_PRESETS.find(p => p.name === 'Cinematic').values;
  for (const key of ['exposure', 'contrast', 'saturation']) assert.equal(SURFACE_CINEMATIC[key], preset[key]);
  const renderer = { toneMappingExposure: .75, domElement: { style: { filter: 'contrast(1.3)' } } };
  const restore = applySurfaceCinematic(renderer);
  assert.equal(renderer.toneMappingExposure, 1.1);
  assert.equal(renderer.domElement.style.filter, 'contrast(1.1) saturate(0.9)');
  restore(); assert.equal(renderer.toneMappingExposure, .75); assert.equal(renderer.domElement.style.filter, 'contrast(1.3)');
});

test('ray geometry keeps every nearby source cell and physically removes covered parent terrain', () => {
  const rows = 9, cols = 9;
  const data = { rows, cols, bounds: [-.001,-.001,.001,.001], radii: new Float64Array(rows * cols).fill(3396000) };
  const origin = new THREE.Vector3((3396000 + SURFACE_EYE_HEIGHT) * SCALE, 0, 0);
  const full = surfaceTracingGeometry(data, origin);
  assert.equal(full.index.count, (rows - 1) * (cols - 1) * 6);
  const center = 4 * cols + 4;
  assert.ok(Math.abs(full.attributes.position.getX(center) / SCALE + 2.5) < 1e-5);
  const masked = surfaceTracingGeometry(data, origin, [-.002,-.002,.002,.002], 1);
  assert.equal(masked.attributes.position.count, 0);
  const distant = surfaceTracingGeometry(data, origin, null, 2);
  assert.ok(distant.index.count < full.index.count);
  assert.ok(distant.attributes.position.array.every(Number.isFinite));
  full.dispose(); masked.dispose(); distant.dispose();
});

test('eye height follows actual land triangles on mountains and crater floors', () => {
  for (const elevation of [-8000, 0, 21000]) {
    const geometry = new THREE.BufferGeometry();
    // A sloped triangle: the longitude/latitude ray intersects x=10 m,
    // independently of the base radius and the other triangle vertices.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -10*SCALE,-20*SCALE,-20*SCALE,
      30*SCALE,-20*SCALE,20*SCALE,
      10*SCALE,20*SCALE,0,
    ],3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.position.x = (3396000 + elevation) * SCALE;
    const eye = surfaceEyePosition(mesh, 0, 0);
    assert.ok(Math.abs(eye.x / SCALE - (3396000 + elevation + 10 + 2.5)) < 1e-5);
    const groundRay = new THREE.Raycaster(eye, new THREE.Vector3(-1,0,0));
    assert.ok(Math.abs(groundRay.intersectObject(mesh)[0].distance / SCALE - 2.5) < 1e-6);
    assert.equal(eye.y, 0); assert.equal(eye.z, 0);
    mesh.position.y = 100 * SCALE;
    assert.throws(() => surfaceEyePosition(mesh, 0, 0), /ground beneath/);
    geometry.dispose(); mesh.material.dispose();
  }
});
