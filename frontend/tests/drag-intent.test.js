import test from 'node:test';
import assert from 'node:assert/strict';
import { dragIntent } from '../src/drag-intent.js';
test('drag pads ignore jitter, preserve direction and bound diagonal speed', () => {
  assert.deepEqual(dragIntent(1, 1), {x:0,y:0});
  assert.deepEqual(dragIntent(32, 0), {x:1,y:0});
  const diagonal = dragIntent(-100, 100);
  assert.ok(diagonal.x < 0 && diagonal.y > 0);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
  assert.ok(dragIntent(15, 0).x < dragIntent(25, 0).x);
});
