import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFreeLook } from '../src/free-look.js';

test('look can face sky and turn around without moving camera or terrain anchor', () => {
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 10);
  const target = new THREE.Vector3(); camera.lookAt(target);
  const look = createFreeLook(camera), position = camera.position.clone();
  look.turn(0, Math.PI / 2); look.apply();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).y > .999);
  assert.deepEqual(camera.position, position);
  for (let frame = 0; frame < 10; frame++) { look.beginFrame(); camera.lookAt(target); look.apply(); }
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).y > .999);
  look.beginFrame(); look.reset(); camera.lookAt(target); look.turn(Math.PI, 0); look.apply();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).z > .999);
  look.beginFrame(); look.reset(); camera.lookAt(target); look.apply();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).z < -.999);
  assert.deepEqual(camera.position, position);
  assert.deepEqual(target, new THREE.Vector3());
});

test('refocus eases to the terrain without moving or immediately snapping the camera', () => {
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 10); camera.lookAt(new THREE.Vector3());
  const look = createFreeLook(camera); look.turn(.5, 1); look.apply();
  const before = camera.quaternion.clone();
  look.beginFrame(); look.easeReset(.15); look.apply();
  assert.ok(camera.quaternion.angleTo(before) > 0);
  assert.ok(camera.quaternion.angleTo(new THREE.Quaternion()) > .1);
  for (let step = 0; step < 100; step++) { look.beginFrame(); camera.lookAt(new THREE.Vector3()); look.easeReset(.15); look.apply(); }
  assert.ok(camera.quaternion.angleTo(new THREE.Quaternion()) < .001);
  assert.deepEqual(camera.position, new THREE.Vector3(0, 0, 10));
});

test('mouse orbit changes the base pose without discarding a sky-facing look offset', () => {
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 10); camera.lookAt(new THREE.Vector3());
  const look = createFreeLook(camera); look.turn(.4, 1.2); look.apply();
  // OrbitControls' pointer handler updates the orbit pose between animation frames.
  camera.position.set(5, 1, 8); camera.lookAt(new THREE.Vector3());
  const nextBase = camera.quaternion.clone();
  look.beginFrame(); camera.lookAt(new THREE.Vector3()); look.apply();
  const expected = nextBase.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, .4, 0, 'YXZ')));
  assert.ok(camera.quaternion.angleTo(expected) < 1e-7);
  assert.deepEqual(camera.position, new THREE.Vector3(5, 1, 8));
});
