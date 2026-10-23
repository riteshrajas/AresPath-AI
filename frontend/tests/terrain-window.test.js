import test from 'node:test';
import assert from 'node:assert/strict';
import { planTerrainWindow, assembleTerrainWindow, fetchTerrainWindow } from '../src/terrain-window.js';

test('zoom selects finer level while dateline and pole tile requests stay valid', () => {
  const close = planTerrainWindow(138.35, -4.92, 1000), far = planTerrainWindow(138.35, -4.92, 300000);
  assert.ok(close.z > far.z); assert.equal(close.size, 65); assert.equal(far.size, 33);
  for (const [lon, lat] of [[180,0],[-180,0],[0,90],[0,-90]]) {
    const plan = planTerrainWindow(lon,lat,10000);
    assert.ok(plan.tiles.length <= 9);
    for (const tile of plan.tiles) assert.ok(tile.x >= 0 && tile.y >= 0 && tile.x < 2**tile.z && tile.y < 2**tile.z);
    assert.ok(plan.bounds[1] >= -90 && plan.bounds[3] <= 90);
  }
  assert.ok(planTerrainWindow(-180,0,10000).bounds[0] < -180);
});

const fixture = (tile, revision = 'fixture') => ({ revision, sources:[{id:0,kind:'MOLA'}],
  grid:{rows:2,cols:2,radii_m:[1,2,3,4],heights_m:[0,1,2,3],source_ids:[0,0,0,0]} });

test('assembly shares inclusive edges and rejects a catalog change mid-request', () => {
  const plan = planTerrainWindow(0,0,10000), tiles = plan.tiles.map(tile => fixture(tile));
  const grid = assembleTerrainWindow(plan,tiles);
  assert.equal(grid.cols,4); assert.equal(grid.rows,4); assert.equal(grid.radii.length,16);
  tiles[0].revision = 'changed';
  assert.throws(() => assembleTerrainWindow(plan,tiles), /catalog revisions/);
});

test('window limits visible-ring concurrency and abort never publishes a partial result', async () => {
  let active = 0, maximum = 0;
  const api = { tile: async () => { active++; maximum = Math.max(maximum,active);
    await new Promise(resolve => setTimeout(resolve,1)); active--; return fixture(); } };
  const plan = planTerrainWindow(0,0,10000), controller = new AbortController();
  const result = await fetchTerrainWindow(api,plan,controller.signal);
  assert.equal(result.cols,4); assert.ok(maximum <= 6);
  controller.abort();
  await assert.rejects(fetchTerrainWindow(api,plan,controller.signal), {name:'AbortError'});
});
