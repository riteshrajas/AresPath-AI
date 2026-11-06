import test from 'node:test';
import assert from 'node:assert/strict';
import { planTerrainWindow, planOuterTerrainWindow, assembleTerrainWindow, fetchTerrainWindow } from '../src/terrain-window.js';

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

test('Turbo ring metadata matches its five-by-five tile layout', () => {
  globalThis.__ARESPATH_TURBO__ = true;
  try {
    const plan = planTerrainWindow(138.35, -4.92, 67000);
    assert.equal(plan.ring, 2); assert.equal(plan.columns, 5); assert.equal(plan.rows, 5);
    assert.equal(plan.tiles.length, 25); assert.equal(plan.size, 129);
  } finally { delete globalThis.__ARESPATH_TURBO__; }
});

test('Turbo biases the same source window toward finer LOD', () => {
  const normal = planTerrainWindow(138.35, -4.92, 5100);
  globalThis.__ARESPATH_TURBO__ = true;
  try { assert.equal(planTerrainWindow(138.35, -4.92, 5100).z, Math.min(18, normal.z + 1)); }
  finally { delete globalThis.__ARESPATH_TURBO__; }
});

test('Turbo doubles close-up mesh density while keeping wide context inexpensive',()=>{
  const normal=planTerrainWindow(138.35,-4.92,67000);
  globalThis.__ARESPATH_TURBO__=true;
  try{
    const close=planTerrainWindow(138.35,-4.92,67000);
    assert.equal(close.size-1,2*(normal.size-1));
    assert.equal(planOuterTerrainWindow(close).size,33);
    assert.equal(planTerrainWindow(0,0,2000000).size,33);
  }finally{delete globalThis.__ARESPATH_TURBO__;}
});

test('Turbo terrain covers the near-view width at a representative 30 km range', () => {
  globalThis.__ARESPATH_TURBO__ = true;
  try {
    const range = 29800, aspect = 16 / 9, fov = 45;
    const plan = planTerrainWindow(0, 0, range, aspect, fov);
    const viewWidth = 2 * range * Math.tan(fov * Math.PI / 360) * aspect;
    const patchWidth = (plan.bounds[2] - plan.bounds[0]) / 360 * 2 * Math.PI * 3396000;
    assert.ok(patchWidth >= viewWidth, `patch ${patchWidth} m is narrower than view ${viewWidth} m`);
    assert.equal(plan.tiles.length, 25);
  } finally { delete globalThis.__ARESPATH_TURBO__; }
});

test('Turbo prioritizes the actual center at the poles', async () => {
  globalThis.__ARESPATH_TURBO__ = true;
  try {
    for (const latitude of [-90, 90]) {
      const plan = planTerrainWindow(0, latitude, 30000);
      let first;
      const api = { tile: async (z, x, y) => {
        first ??= { z, x, y };
        return fixture();
      } };
      await fetchTerrainWindow(api, plan, new AbortController().signal);
      const primary = plan.tiles.find(tile => tile.column === plan.centerColumn && tile.row === plan.centerRow);
      assert.deepEqual(first, { z: primary.z, x: primary.x, y: primary.y });
    }
  } finally { delete globalThis.__ARESPATH_TURBO__; }
});

test('outer context contains the fine window at seams and poles with bounded resources', () => {
  globalThis.__ARESPATH_TURBO__ = true;
  try {
    for (const [longitude, latitude] of [[0, 0], [179.99, 0], [-179.99, 0], [0, 90], [0, -90]]) {
      const fine = planTerrainWindow(longitude, latitude, 29800, 16 / 9), outer = planOuterTerrainWindow(fine);
      assert.equal(outer.z, fine.z - 2);
      assert.equal(outer.size, 33);
      assert.ok(outer.tiles.length <= 25);
      assert.ok(outer.bounds[0] <= fine.bounds[0] && outer.bounds[2] >= fine.bounds[2]);
      assert.ok(outer.bounds[1] <= fine.bounds[1] && outer.bounds[3] >= fine.bounds[3]);
      assert.ok(outer.tiles.every(tile => tile.x >= 0 && tile.y >= 0 && tile.x < 2 ** outer.z && tile.y < 2 ** outer.z));
      assert.equal(outer.key, planOuterTerrainWindow(fine).key);
    }
  } finally { delete globalThis.__ARESPATH_TURBO__; }
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
  const progress = [];
  const partials = [];
  const result = await fetchTerrainWindow(api,plan,controller.signal, (done, total) => progress.push([done, total]), partial => partials.push(partial));
  assert.equal(result.cols,4); assert.ok(maximum <= (plan.concurrency || 6));
  assert.equal(progress.at(-1)[0], plan.tiles.length);
  assert.ok(partials.length >= 1);
  controller.abort();
  await assert.rejects(fetchTerrainWindow(api,plan,controller.signal), {name:'AbortError'});
});

test('progressive tiles start at the center, assemble out-of-order results, and only fill missing nodes', async () => {
  const plan = planTerrainWindow(0, 0, 10000);
  plan.concurrency = 3;
  const started = [], snapshots = [], modes = [];
  const api = { tile: async (_z, x, y, _size, _signal, sampling) => {
    modes.push(sampling);
    const index = plan.tiles.findIndex(tile => tile.x === x && tile.y === y);
    started.push(index);
    await new Promise(resolve => setTimeout(resolve, index === 4 ? 1 : 8));
    const value = 3396000 + index;
    return { revision:'same', sources:[{id:5}], grid:{rows:2,cols:2,
      radii_m:[value,value,value,value], heights_m:[index,index,index,index], source_ids:[5,5,5,5]} };
  } };
  let fallbackCalls = 0;
  const grid = await fetchTerrainWindow(api, plan, new AbortController().signal, () => {},
    data => snapshots.push(data), () => { fallbackCalls++; return 3395990; });
  assert.equal(started[0], 4);
  assert.ok(modes.every(mode => mode === 'display'));
  assert.equal(snapshots[0].measured.reduce((a, b) => a + b, 0), 4);
  assert.equal(snapshots[0].heights[0], -10);
  assert.ok(fallbackCalls > 0);
  assert.ok(grid.measured.every(Boolean));
  assert.equal(grid.radii[0], 3396000);
  assert.equal(grid.radii[grid.radii.length - 1], 3396008);
});

test('aborted or failed requests never publish late partial terrain', async () => {
  const plan = planTerrainWindow(0, 0, 10000);
  plan.concurrency = 2;
  const controller = new AbortController();
  let release, partials = 0, progress = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const api = { tile: async () => { await gate; return fixture(); } };
  const result = fetchTerrainWindow(api, plan, controller.signal, () => progress++, () => partials++);
  controller.abort(); release();
  await assert.rejects(result, { name:'AbortError' });
  assert.equal(progress, 0); assert.equal(partials, 0);

  let calls = 0, releaseFailed;
  const failureGate = new Promise(resolve => { releaseFailed = resolve; });
  const failingApi = { tile: async () => {
    if (++calls === 1) throw Error('tile failed');
    await failureGate; return fixture();
  } };
  const failure = fetchTerrainWindow(failingApi, plan, new AbortController().signal, () => progress++, () => partials++);
  await assert.rejects(failure, /tile failed/);
  releaseFailed();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(progress, 0); assert.equal(partials, 0);
});
