import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planetPoint } from '../src/globe-math.js';
import { coordinatesForPoint, pointToCoordinates, formatCoordinates, raySphereCoordinates } from '../src/coordinates.js';

test('coordinates use the globe longitude convention and wrap the dateline', () => {
  for (const [longitude, latitude] of [[0, 0], [90, 0], [-90, 0], [137.4, -4.5], [-179.99, 82], [179.99, -82]]) {
    const [x, y, z] = planetPoint(longitude, latitude, 3396000);
    const result = coordinatesForPoint({ x, y, z });
    assert.ok(Math.abs(result.longitude - longitude) < 1e-10);
    assert.ok(Math.abs(result.latitude - latitude) < 1e-10);
  }
  assert.deepEqual(pointToCoordinates(new THREE.Vector3(-1, 0, 0)), { longitude: -180, latitude: 0 });
  assert.deepEqual(coordinatesForPoint({ x: 0, y: 10, z: 0 }), { longitude: 0, latitude: 90 });
  assert.deepEqual(coordinatesForPoint({ x: 0, y: -10, z: 0 }), { longitude: 0, latitude: -90 });
  for (const point of [null, {}, { x: 0, y: 0, z: 0 }, { x: Infinity, y: 1, z: 1 }, { x: NaN, y: 1, z: 1 }]) {
    assert.equal(coordinatesForPoint(point), null);
  }
});

test('coordinate labels round consistently and avoid negative zero', () => {
  assert.equal(formatCoordinates({ latitude: -4.12345, longitude: 137.23456 }), '4.1235° S · 137.2346° E');
  assert.equal(formatCoordinates({ latitude: -0.000001, longitude: -0.000001 }), '0.0000° N · 0.0000° E');
  assert.equal(formatCoordinates({ latitude: 0, longitude: 540 }, 2), '0.00° N · 180.00° W');
  assert.equal(formatCoordinates(null), 'Looking at sky');
  assert.equal(formatCoordinates({ latitude: NaN, longitude: 0 }), 'Looking at sky');
});

test('center-view sphere intersection follows camera orientation and rejects empty sky', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 30000);
  camera.position.set(0, 0, 1000); camera.lookAt(0, 0, 0);
  assert.deepEqual(raySphereCoordinates(camera), { longitude: -90, latitude: 0 });
  camera.lookAt(0, 1000, 1000);
  assert.equal(raySphereCoordinates(camera), null);
  camera.lookAt(0, 0, 2000);
  assert.equal(raySphereCoordinates(camera), null);
  camera.position.set(0, 0, 0); camera.lookAt(1, 0, 0);
  const inside = raySphereCoordinates(camera);
  assert.ok(Math.abs(inside.longitude) < 1e-10 && Math.abs(inside.latitude) < 1e-10);
  assert.equal(raySphereCoordinates(camera, 0), null);
});

test('optional cursor direction and parent transforms use world-space camera rays', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 30000);
  const rig = new THREE.Group(); rig.position.set(1000, 0, 0); rig.add(camera);
  camera.lookAt(-1, 0, 0);
  const center = raySphereCoordinates(camera);
  assert.ok(Math.abs(center.longitude) < 1e-10 && Math.abs(center.latitude) < 1e-10);
  assert.equal(raySphereCoordinates(camera, 280, { x: 1, y: 1 }), null);
});
