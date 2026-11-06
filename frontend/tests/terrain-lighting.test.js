import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { terrainOcclusion, terrainShading, setupTerrainShading, applyTerrainLighting } from '../src/terrain-lighting.js';
import { createTerrainSurface } from '../src/terrain-surface.js';

const grid = () => ({ rows: 9, cols: 9, bounds: [0, 0, .001, .001],
  radii: new Float64Array(81).fill(3396000), heights: new Float32Array(81) });

test('flat terrain stays open; a hollow has bounded ambient occlusion without mutating radii', () => {
  const data = grid();
  assert.ok(terrainOcclusion(data).every(value => value === 1));
  data.radii[40] -= 50;
  const before = data.radii.slice(), ao = terrainOcclusion(data);
  assert.ok(ao[40] < .5);
  assert.ok(ao.every(value => Number.isFinite(value) && value >= .4 && value <= 1));
  assert.deepEqual(data.radii, before);
});

test('AO covers collars and composes with material grading and context masks', () => {
  const data = grid(); data.radii[40] -= 50;
  const { mesh } = createTerrainSurface(data, new THREE.Texture(), () => 3396000, new THREE.Vector4());
  assert.equal(mesh.geometry.attributes.terrainAO.count, mesh.geometry.attributes.position.count);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  mesh.material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('marsGrain'));
  assert.ok(shader.fragmentShader.includes('innerTerrainBounds'));
  assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse *= mix'));
  assert.equal(shader.uniforms.terrainShading, terrainShading);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('toggle updates existing and future shaders through the shared uniform', () => {
  let click;
  const button = { classList: { toggle() {} }, setAttribute(key, value) { this[key] = value; }, addEventListener(_, handler) { click = handler; } };
  terrainShading.value = 1;
  setupTerrainShading(button); click();
  assert.equal(terrainShading.value, 0);
  assert.equal(button['aria-pressed'], 'false');
  const shader = { uniforms: {}, vertexShader: '', fragmentShader: '' };
  applyTerrainLighting(shader);
  assert.equal(shader.uniforms.terrainShading.value, 0);
  click(); assert.equal(shader.uniforms.terrainShading.value, 1);
});
