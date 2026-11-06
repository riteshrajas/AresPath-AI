import test from 'node:test';
import assert from 'node:assert/strict';
import {subtractRect,tracingGeometry} from '../src/trace-mask.js';
import * as THREE from 'three';
import {PathTracingSceneGenerator} from 'three-gpu-pathtracer';
const area=poly=>Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
test('geometric mask preserves outside area without overlapping pieces',()=>{
  const square=[[0,0],[1,0],[1,1],[0,1]];
  const outside=subtractRect(square,[.25,.25,.75,.75]);
  assert.ok(Math.abs(outside.reduce((s,p)=>s+area(p),0)-.75)<1e-12);
  assert.equal(subtractRect(square,[-1,-1,2,2]).length,0);
  assert.equal(subtractRect(square,[2,2,3,3]).reduce((s,p)=>s+area(p),0),1);
});

test('tracing globe and RGB-tinted terrain can merge in either mesh order',()=>{
  for(const reverse of [false,true]){
    const source=new THREE.PlaneGeometry(1,1,3,3);
    source.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position.count*3).fill(.5),3));
    const globe=tracingGeometry(new THREE.SphereGeometry(2,8,4),[-10,-10,10,10]);
    const terrain=tracingGeometry(source);
    const meshes=[new THREE.Mesh(globe,new THREE.MeshStandardMaterial()),new THREE.Mesh(terrain,new THREE.MeshStandardMaterial())];
    meshes[0].uuid=reverse?'b':'a';meshes[1].uuid=reverse?'a':'b';
    const scene=new THREE.Scene();scene.add(...meshes);
    const result=new PathTracingSceneGenerator(scene).generate();
    assert.ok(result.geometry.attributes.position.count>0);
    assert.equal(result.geometry.attributes.color.itemSize,4);
    assert.ok(result.geometry.attributes.position.array.every(Number.isFinite));
  }
});
