import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planVisibleTerrain } from '../src/view-render-plan.js';

function cameraAt(position, target, up = [0, 1, 0]) {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.001, 10000);
  camera.position.set(...position); camera.up.set(...up); camera.lookAt(...target);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return camera;
}

test('view plan bounds requests and reports when detail is budget limited', () => {
  const plan = planVisibleTerrain(cameraAt([350, 0, 0], [0, 0, 0]), { targetZ: 16, maxTiles: 36 });
  assert.ok(plan); assert.ok(plan.tiles.length <= 36); assert.ok(plan.coverage.limitedByBudget);
  assert.equal(plan.columns * plan.rows, plan.tiles.length);
  assert.ok(plan.tiles.every(tile => tile.x >= 0 && tile.x < 2 ** tile.z && tile.y >= 0 && tile.y < 2 ** tile.z));
  assert.ok(plan.coverage.approximate); assert.ok(plan.coverage.sampleHits > 0);
});

test('view planning handles dateline and a visible pole without invalid tiles', () => {
  const dateline = planVisibleTerrain(cameraAt([-300, 0, 0], [-280, 0, 0]), { targetZ: 12 });
  assert.ok(dateline.bounds[2] > 180 || dateline.bounds[0] < -180);
  assert.ok(dateline.tiles.length <= 36);
  const pole = planVisibleTerrain(cameraAt([0, 300, 0], [0, 280, 0], [0, 0, -1]), { targetZ: 12 });
  assert.equal(pole.bounds[1] >= -90, true); assert.equal(pole.bounds[3], 90);
  assert.ok(pole.tiles.length <= 36); assert.equal(pole.columns, 2 ** pole.z);
});

test('view including sky still captures horizon, while pointing away returns null', () => {
  const horizonCamera = cameraAt([281, 0, 0], [280, 0, -50]);
  const plan = planVisibleTerrain(horizonCamera, { targetZ: 12 });
  assert.ok(plan); assert.ok(plan.coverage.sampleHits > 0); assert.ok(plan.tiles.length <= 36);
  assert.equal(planVisibleTerrain(cameraAt([300, 0, 0], [500, 0, 0])), null);
});
