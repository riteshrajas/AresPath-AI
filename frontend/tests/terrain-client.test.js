import assert from 'node:assert/strict';
import test from 'node:test';
import { TerrainClient, pointToTile } from '../src/terrain-client.js';

test('planet grid handles seams, poles and root', () => {
  assert.deepEqual(pointToTile(180, -90, 2), {z:2,x:3,y:3});
  assert.deepEqual(pointToTile(-180, 90, 2), {z:2,x:0,y:0});
  assert.deepEqual(pointToTile(138.35, -4.92, 0), {z:0,x:0,y:0});
  assert.throws(() => pointToTile(0, 91, 1));
  assert.throws(() => pointToTile(0, 0, 19));
});

test('tile cache reuses completed response and respects abort', async () => {
  let calls = 0;
  const client = new TerrainClient('', async () => { calls++; return {ok:true,json:async()=>({real:'fixture response'})}; });
  await client.tile(1,0,0); await client.tile(1,0,0);
  assert.equal(calls,1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.tile(1,0,0,65,controller.signal), {name:'AbortError'});
});

test('native and display tile requests use separate cache entries', async () => {
  const paths = [];
  const client = new TerrainClient('', async path => { paths.push(path); return {ok:true,json:async()=>({path})}; });
  await client.tile(1,0,0);
  await client.tile(1,0,0,65,undefined,'display');
  await client.tile(1,0,0,65,undefined,'display');
  assert.equal(paths.length,2);
  assert.match(paths[1], /sampling=display/);
  assert.doesNotMatch(paths[0], /sampling=/);
  await assert.rejects(client.tile(1,0,0,65,undefined,'invalid'), /sampling/);
});

test('API failures surface, not simulated terrain', async () => {
  const client = new TerrainClient('', async () => ({ok:false,status:503,json:async()=>({detail:'Prepared data missing'})}));
  await assert.rejects(client.tile(0,0,0), /Prepared data missing/);
});
