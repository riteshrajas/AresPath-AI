import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTerrainShadows } from '../src/terrain-shadows.js';
import { terrainShading } from '../src/terrain-lighting.js';

test('local shadows are cached, invalidate for new terrain, and turn off cleanly', () => {
  const renderer = { shadowMap: {} }, scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(), ambient = new THREE.AmbientLight(), inspection = new THREE.DirectionalLight();
  const controller = createTerrainShadows(renderer, scene, sun, ambient, inspection, true);
  const state = { terrain: { mesh: new THREE.Mesh(new THREE.PlaneGeometry()) },
    target: new THREE.Vector3(-200, -20, -190), range: 2000 };
  terrainShading.value = 1;
  controller.update(state);
  assert.equal(renderer.shadowMap.needsUpdate, true);
  assert.equal(sun.castShadow, true);
  assert.equal(sun.shadow.mapSize.x, 1024);
  assert.ok(sun.position.clone().sub(state.target).normalize().dot(state.target.clone().normalize()) > .5);
  renderer.shadowMap.needsUpdate = false;
  controller.update(state);
  assert.equal(renderer.shadowMap.needsUpdate, false);
  state.terrain = { mesh: new THREE.Mesh(new THREE.PlaneGeometry()) };
  controller.update(state);
  assert.equal(renderer.shadowMap.needsUpdate, true);
  terrainShading.value = 0;
  controller.update(state);
  assert.equal(sun.castShadow, false);
  assert.equal(state.terrain.mesh.receiveShadow, false);
  assert.equal(sun.target.position.length(), 0);
  terrainShading.value = 1;
});

test('live sky retains catalog sunlight direction and fill levels', () => {
  const renderer = { shadowMap: {} }, scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(), ambient = new THREE.AmbientLight(), inspection = new THREE.DirectionalLight();
  const controller = createTerrainShadows(renderer, scene, sun, ambient, inspection);
  const direction = new THREE.Vector3(1, -2, 3).normalize();
  sun.position.copy(direction).multiplyScalar(10000);
  ambient.intensity = .08; inspection.intensity = 0;
  const target = new THREE.Vector3(280, 0, 0);
  controller.update({ terrain: { mesh: new THREE.Mesh(new THREE.PlaneGeometry()) }, target, range: 500, liveSun: true });
  assert.ok(sun.position.clone().sub(target).normalize().distanceTo(direction) < 1e-12);
  assert.equal(ambient.intensity, .08);
  assert.equal(inspection.intensity, 0);
});

test('shadow map invalidates when render-relative origin shifts', () => {
  const renderer = { shadowMap: {} }, scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(), ambient = new THREE.AmbientLight(), inspection = new THREE.DirectionalLight();
  const controller = createTerrainShadows(renderer, scene, sun, ambient, inspection, true);
  const target = new THREE.Vector3(280, 0, 0);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry());
  const origin = new THREE.Vector3(280, 0, 0);
  terrainShading.value = 1;
  controller.update({ terrain: { mesh }, target, range: 2000, origin });
  renderer.shadowMap.needsUpdate = false;
  controller.update({ terrain: { mesh }, target, range: 2000, origin });
  assert.equal(renderer.shadowMap.needsUpdate, false);
  controller.update({ terrain: { mesh }, target, range: 2000, origin: new THREE.Vector3(281, 0, 0) });
  assert.equal(renderer.shadowMap.needsUpdate, true);
});
