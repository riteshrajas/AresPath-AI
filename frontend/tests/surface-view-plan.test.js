import test from 'node:test';
import assert from 'node:assert/strict';
import { planSurfaceView } from '../src/surface-view-plan.js';

test('surface view matches local source spacing and covers all azimuths independently of turbo', () => {
  const fine = planSurfaceView(77.4, 18.4, 1.01), coarse = planSurfaceView(77.4, 18.4, 200);
  assert.ok(fine[0].z > coarse[0].z);
  const spacing = 21344000 / (2 ** fine[0].z * 128);
  assert.ok(spacing <= 1.01);
  assert.equal(fine[0].tiles.length, 9);
  assert.equal(fine.at(-1).z, 8);
  assert.ok(fine.every(plan => plan.size === 129 && plan.concurrency === 4));
  globalThis.__ARESPATH_TURBO__ = true;
  try { assert.deepEqual(planSurfaceView(77.4, 18.4, 1.01), fine); }
  finally { delete globalThis.__ARESPATH_TURBO__; }
});

test('surface rings nest across the dateline and stay bounded at both poles', () => {
  for (const [lon, lat] of [[180,0],[-180,0],[179.999,18.4],[-179.999,-18.4],[0,90],[0,-90],[90,85]]) {
    const plans = planSurfaceView(lon, lat, .25);
    assert.ok(plans.length <= 7);
    assert.ok(plans.reduce((n, plan) => n + plan.tiles.length, 0) <= 159);
    for (const plan of plans) {
      assert.ok(plan.tiles.every(tile => tile.x >= 0 && tile.y >= 0 && tile.x < 2 ** tile.z && tile.y < 2 ** tile.z));
      assert.ok(plan.bounds[1] >= -90 && plan.bounds[3] <= 90);
    }
    for (let i = 1; i < plans.length; i++) {
      const inner = plans[i - 1].bounds, outer = plans[i].bounds;
      // Compare equivalent longitudes around the same unwrapped center.
      const shift = Math.round(((outer[0] + outer[2]) - (inner[0] + inner[2])) / 720) * 360;
      assert.ok(inner[0] + shift >= outer[0] && inner[2] + shift <= outer[2]);
      assert.ok(inner[1] >= outer[1] && inner[3] <= outer[3]);
    }
  }
});

test('missing or invalid source resolution uses a finite fallback plan', () => {
  for (const resolution of [undefined, null, NaN, Infinity, -1, 0])
    assert.deepEqual(planSurfaceView(0, 0, resolution), planSurfaceView(0, 0, 200));
  assert.throws(() => planSurfaceView(181, 0));
});
