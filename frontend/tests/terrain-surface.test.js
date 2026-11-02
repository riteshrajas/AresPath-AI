import test from 'node:test';
import assert from 'node:assert/strict';
import { contextRadiusAt } from '../src/terrain-surface.js';

test('context radius interpolates the wider grid and wraps the dateline', () => {
  const data = { bounds:[170, -10, 190, 10], cols:2, rows:2,
    radii:new Float64Array([100, 200, 300, 400]) };
  const fallback = () => -1;
  assert.equal(contextRadiusAt(data, 180, 0, fallback), 250);
  assert.equal(contextRadiusAt(data, -175, 5, fallback), 225);
  assert.equal(contextRadiusAt(data, 0, 0, fallback), -1);
  assert.equal(contextRadiusAt(data, 170, 10, fallback), 100);
  assert.equal(contextRadiusAt(data, -170, -10, fallback), 400);
});
