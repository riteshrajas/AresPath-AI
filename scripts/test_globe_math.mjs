import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCALE, sampleMola, planetPoint, terrainIndices } from '../web/globe-math.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const zero = planetPoint(0, 0, 3396000);
near(zero[0], 280); near(zero[1], 0); near(zero[2], 0);
near(planetPoint(90, 0, 3396000)[2], -280);
near(planetPoint(0, 90, 3396000)[1], 280);
near(planetPoint(0, 0, 3396010)[0] - zero[0], 10 * SCALE);
const grid = new Int16Array([1, 3, 5, 7, 11, 13, 15, 17]);
near(sampleMola(grid, 4, 2, 45, 45, 0), 1);
near(sampleMola(grid, 4, 2, 0, 45, 0), 4);
near(sampleMola(grid, 4, 2, 360, 45, 0), 4);
near(sampleMola(grid, 4, 2, -315, 45, 0), 1);
near(sampleMola(grid, 4, 2, 45, 90, 0), 1);
assert.deepEqual(terrainIndices([0, 1, 2, 3], 2, 2), [0, 2, 1, 1, 2, 3]);
assert.deepEqual(terrainIndices([0, null, 2, 3], 2, 2), []);
const metadata = JSON.parse(fs.readFileSync(new URL('../data/verified_terrain/globe/manifest.json', import.meta.url)));
for (const patch of metadata.patches) {
  assert.ok(patch.inverse_projection_max_error_m < 0.001);
  const g = JSON.parse(fs.readFileSync(new URL(`../data/verified_terrain/globe/${patch.grid}`, import.meta.url)));
  assert.equal(patch.longitudes.length, g.cols);
  assert.equal(patch.latitudes.length, g.rows);
  const triangleCount = terrainIndices(g.elevations_m, g.rows, g.cols).length / 3;
  if (!patch.coverage_label) assert.equal(triangleCount, 131072);
  else {
    assert.ok(g.rows >= 501 && g.cols >= 501);
    assert.ok(patch.display_span_m.every(span => span >= 20000));
    assert.equal(triangleCount, (g.rows-1)*(g.cols-1)*2);
  }
  const [lon, lat] = patch.center, p = planetPoint(lon, lat, 3396000);
  near(Math.atan2(-p[2], p[0]) * 180 / Math.PI, lon);
  near(Math.asin(p[1] / 280) * 180 / Math.PI, lat);
}
console.log('Passed: cardinal axes, meter scale, MOLA pixel centers/seam/poles, nodata faces, both patch placements and triangle counts.');
