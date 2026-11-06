import * as THREE from 'three';
import { SCALE } from './globe-math.js';
import { terrainShading } from './terrain-lighting.js';

// One filtered directional shadow map, reused until the terrain, focus, zoom
// or Sun direction changes. There is no progressive sampling or second scene.
export function createTerrainShadows(renderer, scene, sun, ambient, inspection, turbo = false) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  sun.shadow.mapSize.set(turbo ? 1024 : 2048, turbo ? 1024 : 2048);
  sun.shadow.bias = -.00015;
  sun.shadow.intensity = .85;
  scene.add(sun.target);
  const direction = new THREE.Vector3(), normal = new THREE.Vector3();
  const east = new THREE.Vector3(), north = new THREE.Vector3();
  let previousKey = '';
  return { update({ terrain, context, target, range, liveSun = false }) {
    const active = !!terrain && terrainShading.value === 1;
    sun.castShadow = active;
    if (terrain) { terrain.mesh.castShadow = active; terrain.mesh.receiveShadow = active; }
    // Context masks are fragment-only; do not cast its uncut parent through
    // the fine terrain. The visible fine grid is the shadow caster.
    if (context) { context.mesh.castShadow = false; context.mesh.receiveShadow = active; }
    if (!active) {
      sun.target.position.set(0, 0, 0);
      if (terrain && !liveSun) inspection.intensity = .42;
      previousKey = '';
      return;
    }
    if (liveSun) direction.copy(sun.position).normalize();
    else {
      normal.copy(target).normalize();
      east.set(0, 1, 0).cross(normal);
      if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
      east.normalize(); north.crossVectors(normal, east).normalize();
      direction.copy(normal).multiplyScalar(.55).addScaledVector(east, .57).addScaledVector(north, .6).normalize();
      ambient.intensity = .28;
      inspection.intensity = .12;
    }
    // Quantize zoom so tiny damping changes don't redraw a stationary map.
    const extent = 2 ** (Math.ceil(Math.log2(Math.max(200, range * 1.25)) * 4) / 4) * SCALE;
    const distance = Math.max(extent * 4, 20000 * SCALE);
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(direction, distance);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -extent;
    shadowCamera.right = shadowCamera.top = extent;
    shadowCamera.near = Math.max(.001, distance - extent * 3);
    shadowCamera.far = distance + extent * 3;
    shadowCamera.updateProjectionMatrix();
    sun.shadow.normalBias = extent / sun.shadow.mapSize.x * .8;
    const key = [terrain.mesh.geometry.uuid, context?.mesh.geometry.uuid, extent,
      ...target.toArray(), ...direction.toArray()].join('/');
    if (key !== previousKey) {
      renderer.shadowMap.needsUpdate = true;
      previousKey = key;
    }
  } };
}
