import * as THREE from 'three';
import { createTerrainSurface, contextRadiusAt } from './terrain-surface.js';
import { marsMaterial } from './mars-material.js';
import { applyTerrainLighting } from './terrain-lighting.js';
import { sampleMola } from './globe-math.js';

export function buildReplayGeometry(data, globe, contextData) {
  const base=(lon,lat)=>sampleMola(globe.grid,globe.width,globe.height,lon,lat,globe.offset);
  const surface=createTerrainSurface(data,null,(lon,lat)=>contextData?contextRadiusAt(contextData,lon,lat,base):base(lon,lat));
  const geometry=surface.mesh.geometry;
  const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([key,attribute])=>[key,{array:attribute.array,itemSize:attribute.itemSize,normalized:attribute.normalized}]));
  const snapshot={data,outer:surface.outer,position:surface.mesh.position.toArray(),attributes,index:geometry.index.array};
  if(contextData)snapshot.context=buildReplayGeometry(contextData,globe);
  geometry.dispose();surface.mesh.material.dispose();return snapshot;
}
export function hydrateReplayGeometry(snapshot,texture,innerMask) {
  const geometry=new THREE.BufferGeometry();
  for(const [key,attribute]of Object.entries(snapshot.attributes))geometry.setAttribute(key,new THREE.BufferAttribute(attribute.array,attribute.itemSize,attribute.normalized));
  geometry.setIndex(new THREE.BufferAttribute(snapshot.index,1));
  const material=marsMaterial(texture,THREE.DoubleSide);material.vertexColors=true;
  const compile=material.onBeforeCompile;material.onBeforeCompile=shader=>{compile(shader);applyTerrainLighting(shader);};
  if(innerMask){const previous=material.onBeforeCompile;material.onBeforeCompile=shader=>{
    previous(shader);shader.uniforms.replayBounds={value:innerMask};
    shader.fragmentShader='uniform vec4 replayBounds;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float rl=vMapUv.x*360.0-180.0, rt=vMapUv.y*180.0-90.0, rm=(replayBounds.x+replayBounds.z)*0.5;
      rl=rm+mod(rl-rm+540.0,360.0)-180.0;
      if(replayBounds.z>replayBounds.x && rl>replayBounds.x && rl<replayBounds.z && rt>replayBounds.y && rt<replayBounds.w) discard;`);
  };}
  const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(snapshot.position);
  return {mesh,data:snapshot.data,outer:snapshot.outer};
}
