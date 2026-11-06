import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMotionAxis, moveOnPlanet, releaseNavigationInput, northHeadingRotation } from '../src/navigation-motion.js';

test('held navigation and short taps travel equally at different frame rates', () => {
  const simulate = fps => {
    const axis = createMotionAxis(); let distance = 0;
    axis.impulse(.09);
    for (let frame = 0; frame < fps * 3; frame++) distance += axis.advance(frame < fps ? 1 : 0, 1 / fps);
    return distance;
  };
  assert.ok(Math.abs(simulate(30) - simulate(144)) < 1e-8);
  assert.ok(Math.abs(simulate(60) - 1.09) < 1e-7);
});

test('cancelled input stops immediately instead of drifting after tab blur', () => {
  const axis = createMotionAxis(); axis.impulse(.1); axis.advance(1, .1); axis.stop();
  assert.equal(axis.advance(0, 1), 0);
});

test('pointer cancellation stops the axis, while pointerup then lost-capture keeps normal deceleration', () => {
  const axes = { panX: createMotionAxis() }, actions = { 'pan-right': ['panX', 1] };
  const held = new Map([['pointer-1', 'pan-right']]);
  axes.panX.impulse(.1);
  releaseNavigationInput(held, actions, axes, 'pointer-1', true);
  assert.equal(held.size, 0);
  assert.equal(axes.panX.advance(0, .016), 0);
  held.set('pointer-1', 'pan-right'); axes.panX.impulse(.1);
  releaseNavigationInput(held, actions, axes, 'pointer-1');
  releaseNavigationInput(held, actions, axes, 'pointer-1', true);
  assert.ok(axes.panX.advance(0, .016) > 0);
});

test('surface travel preserves range and follows the viewing direction through a pole', () => {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3(0, 279.99, 1).normalize().multiplyScalar(280);
  camera.up.copy(target).normalize(); camera.position.copy(target).addScaledVector(camera.up, 1);
  const controls = new OrbitControls(camera);
  controls.target.copy(target); controls.minPolarAngle = .03; controls.maxPolarAngle = Math.PI / 2 - .12; controls.update();
  const range = camera.position.distanceTo(controls.target), radius = controls.target.length();
  for (let frame = 0; frame < 600; frame++) {
    moveOnPlanet(camera, controls, .015, .02); controls.update(); camera.updateMatrixWorld(true);
    assert.ok(camera.position.toArray().every(Number.isFinite));
    assert.ok(Math.abs(camera.position.distanceTo(controls.target) - range) < 1e-9);
    assert.ok(Math.abs(controls.target.length() - radius) < 1e-9);
    assert.ok(controls._quat.clone().invert().angleTo(controls._quatInverse) < 1e-6);
  }
  assert.ok(controls.target.distanceTo(target) > .1);
});

test('movement axes follow visible heading independently of the orbit target', () => {
  const controls = { target: new THREE.Vector3(), _quat: new THREE.Quaternion(), _quatInverse: new THREE.Quaternion() };
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, 400); camera.lookAt(controls.target);
  const original = camera.position.clone(), heading = camera.quaternion.clone();
  moveOnPlanet(camera, controls, .1, 0, heading);
  assert.ok(camera.position.x > 0);
  camera.position.copy(original);
  heading.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  moveOnPlanet(camera, controls, .1, 0, heading);
  assert.ok(camera.position.x < 0);
  assert.deepEqual(controls.target, new THREE.Vector3());
});

test('north preserves orbital longitude and only turns around the current ground target locally', () => {
  const camera = new THREE.PerspectiveCamera(); camera.position.set(110, 70, 380);
  const orbitalPosition = camera.position.clone();
  assert.equal(northHeadingRotation(camera, new THREE.Vector3()), null);
  assert.deepEqual(camera.position, orbitalPosition);
  const target = new THREE.Vector3(280, 0, 0), originalTarget = target.clone();
  camera.position.copy(target).add(new THREE.Vector3(10, 5, 10));
  const offset = camera.position.clone().sub(target), range = offset.length();
  const rotation = northHeadingRotation(camera, target);
  offset.applyQuaternion(rotation);
  assert.ok(Math.abs(offset.length() - range) < 1e-10);
  assert.ok(Math.abs(offset.z) < 1e-10);
  assert.ok(offset.y < 0); // South of the anchor, facing north.
  assert.deepEqual(target, originalTarget);
});
