import test from 'node:test';
import assert from 'node:assert/strict';
import { routeTrack, replayPlan, sampleReplayRadius } from '../src/cinematic-path.js';
import { buildReplayGeometry, hydrateReplayGeometry } from '../src/cinematic-geometry.js';
import * as THREE from 'three';
import { renderRelative } from '../src/render-relative.js';
const radius=3396000;
const route={points:[[77.4422,18.4254,radius],[77.4475,18.4254,radius]],source_ids:[1]};
const result={sources:[{id:1,prepared_resolution_m:1.01,name:'HiRISE'}]};

test('cinematic path preserves endpoints and follows the short arc at the dateline',()=>{
  const track=routeTrack([[179.99,0,radius],[-179.99,0,radius]]);
  assert.ok(track.total<1300);
  assert.ok(Math.abs(Math.abs(track.at(track.total/2).longitude)-180)<1e-9);
  assert.ok(Math.abs(track.at(0).longitude-179.99)<1e-9);
  assert.ok(Math.abs(track.at(track.total).longitude+179.99)<1e-9);
  assert.throws(()=>routeTrack([[0,0,radius],[0,0,radius]]),/no replayable length/);
});
test('native HD plan covers complete route, deduplicates tiles and respects source detail',()=>{
  const plan=replayPlan(route,result);
  assert.equal(plan.z,18);assert.ok(plan.windows.size>1);
  assert.equal(plan.windows.get(plan.frameKey(0)).size,129);
  assert.equal(plan.windows.get(plan.frameKey(0)).context.size,65);
  assert.ok(plan.windows.has(plan.frameKey(plan.track.total)));
  for(let i=0;i<=100;i++){
    const distance=plan.track.total*i/100,p=plan.track.at(distance),window=plan.windows.get(plan.frameKey(distance));
    const [west,south,east,north]=window.bounds;
    assert.ok(p.longitude>=west&&p.longitude<=east&&p.latitude>=south&&p.latitude<=north);
  }
  const keys=[...plan.tiles.keys()];assert.equal(new Set(keys).size,keys.length);
  const coarse=replayPlan({...route,source_ids:[5]},{sources:[{id:5,prepared_resolution_m:200}]});
  assert.ok(coarse.z<plan.z);assert.ok(coarse.altitude>plan.altitude);
  assert.throws(()=>replayPlan(route,{sources:[]}),/resolution is missing/);
});
test('prepared geometry retains all grid cells, normals, shading and can be restored',()=>{
  const data={rows:3,cols:3,bounds:[77.44,18.42,77.441,18.421],radii:new Float64Array(9).fill(radius),heights:new Float64Array(9),measured:new Uint8Array(9).fill(1),sourceMetadata:[],z:18};
  const globe={grid:new Int16Array(8),width:4,height:2,offset:radius};
  const snapshot=buildReplayGeometry(data,globe);
  assert.ok(snapshot.attributes.position.array.length>27);
  assert.equal(snapshot.attributes.terrainAO.array.length,snapshot.attributes.position.array.length/3);
  assert.ok(snapshot.attributes.normal.array.every(Number.isFinite));
  const restored=hydrateReplayGeometry(snapshot,new THREE.Texture());
  assert.equal(restored.mesh.geometry.index.count,snapshot.index.length);
  assert.deepEqual(restored.data.radii,data.radii);
  assert.equal(sampleReplayRadius(data,77.4405,18.4205),radius);
  assert.equal(sampleReplayRadius(data,0,0),null);
  restored.mesh.geometry.dispose();restored.mesh.material.map.dispose();restored.mesh.material.dispose();
});
test('prepared context supplies fine collars and receives a matching hole mask',()=>{
  const globe={grid:new Int16Array(8),width:4,height:2,offset:radius};
  const data={rows:3,cols:3,bounds:[77.44,18.42,77.441,18.421],radii:new Float64Array(9).fill(radius),heights:new Float64Array(9),measured:new Uint8Array(9).fill(1),sourceMetadata:[],z:18};
  const context={...data,bounds:[77.43,18.41,77.45,18.43]};
  const snapshot=buildReplayGeometry(data,globe,context);
  assert.ok(snapshot.context);
  const mask=new THREE.Vector4(...data.bounds),texture=new THREE.Texture();
  const surface=hydrateReplayGeometry(snapshot.context,texture,mask);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  surface.mesh.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.replayBounds.value,mask);
  assert.ok(shader.fragmentShader.includes('discard;'));
  surface.mesh.geometry.dispose();surface.mesh.material.dispose();texture.dispose();
});
test('relative rendering preserves projection and restores geographic transforms on failure',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(200,100,180);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.position.set(199,99,178);scene.add(mesh);scene.updateMatrixWorld(true);
  const projected=mesh.getWorldPosition(new THREE.Vector3()).project(camera);
  const origin=camera.position.clone();
  assert.throws(()=>renderRelative({render(){
    assert.equal(camera.position.length(),0);
    assert.ok(mesh.getWorldPosition(new THREE.Vector3()).project(camera).distanceTo(projected)<1e-8);
    throw Error('Draw failed');
  }},scene,camera),/Draw failed/);
  assert.deepEqual(camera.position,origin);assert.equal(scene.position.length(),0);
  mesh.geometry.dispose();mesh.material.dispose();
});
