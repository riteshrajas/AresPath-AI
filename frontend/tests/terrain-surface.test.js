import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { contextRadiusAt, createTerrainNormalTexture, createTerrainSurface } from '../src/terrain-surface.js';

test('context radius interpolates the wider grid and wraps the dateline', () => {
  const data = { bounds:[170, -10, 190, 10], cols:2, rows:2,
    radii:new Float64Array([100, 200, 300, 400]) };
  const fallback = () => -1;
  assert.equal(contextRadiusAt(data, 180, 0, fallback), 250);
  assert.equal(contextRadiusAt(data, -175, 5, fallback), 225);
  assert.equal(contextRadiusAt(data, 0, 0, fallback), -1);
  assert.equal(contextRadiusAt(data, 170, 10, fallback), 100);
  assert.equal(contextRadiusAt(data, -170, -10, fallback), 400);
});

test('createTerrainNormalTexture derives tangent-space normal maps from elevation differences', () => {
  const flatData = {
    rows: 3, cols: 3,
    bounds: [0, 0, 0.01, 0.01],
    radii: new Float64Array(9).fill(3396000),
    heights: new Float64Array(9).fill(100),
    measured: new Uint8Array(9).fill(1)
  };
  const flatTex = createTerrainNormalTexture(flatData);
  assert.equal(flatTex.channel, 1);
  assert.equal(flatTex.image.width, 3);
  assert.equal(flatTex.image.height, 3);
  const centerIdx = (1 * 3 + 1) * 4;
  assert.equal(flatTex.image.data[centerIdx], 128);
  assert.equal(flatTex.image.data[centerIdx + 1], 128);
  assert.equal(flatTex.image.data[centerIdx + 2], 255);
  flatTex.dispose();

  const slopeData = {
    rows: 3, cols: 3,
    bounds: [0, 0, 0.01, 0.01],
    radii: new Float64Array(9).fill(3396000),
    heights: new Float64Array([
      0, 50, 100,
      0, 50, 100,
      0, 50, 100
    ]),
    measured: new Uint8Array(9).fill(1)
  };
  const slopeTex = createTerrainNormalTexture(slopeData);
  const slopeCenterIdx = (1 * 3 + 1) * 4;
  assert.ok(slopeTex.image.data[slopeCenterIdx] < 128, 'Nx tilts West for Eastward slope');
  assert.equal(slopeTex.image.data[slopeCenterIdx + 1], 128, 'Ny is flat in North-South axis');
  slopeTex.dispose();
});

test('createTerrainSurface equips geometry with local UVs (uv1) and normalMap', () => {
  const data = {
    rows: 2, cols: 2,
    bounds: [0, 0, 0.01, 0.01],
    radii: new Float64Array(4).fill(3396000),
    heights: new Float64Array(4).fill(0),
    measured: new Uint8Array(4).fill(1)
  };
  const surface = createTerrainSurface(data, null, () => 3396000);
  assert.ok(surface.mesh.geometry.hasAttribute('uv1'), 'geometry contains uv1 attribute for normal mapping');
  assert.ok(surface.mesh.material.normalMap, 'material has normalMap attached');
  assert.equal(surface.mesh.material.normalMap.channel, 1);
  surface.mesh.geometry.dispose();
  surface.mesh.material.dispose();
});

test('createTerrainNormalTexture avoids cliff spikes across unmeasured boundaries and preserves one-sided slopes', () => {
  const data = {
    rows: 4, cols: 4,
    bounds: [0, 0, 0.03, 0.03],
    radii: new Float64Array(16).fill(3396000),
    heights: new Float64Array([
      4000, 4000, 4050, 4100,
      4000, 4000, 4050, 4100,
      4000, 4000, 4050, 4100,
      4000, 4000, 4050, 4100
    ]),
    measured: new Uint8Array([
      0, 1, 1, 1,
      0, 1, 1, 1,
      0, 1, 1, 1,
      0, 1, 1, 1
    ])
  };
  const tex = createTerrainNormalTexture(data);
  const unmeasuredIdx = (2 * 4 + 0) * 4;
  assert.equal(tex.image.data[unmeasuredIdx], 128);
  assert.equal(tex.image.data[unmeasuredIdx + 1], 128);
  assert.equal(tex.image.data[unmeasuredIdx + 2], 255);
  const borderIdx = (2 * 4 + 1) * 4;
  assert.ok(tex.image.data[borderIdx] < 128, 'measured border uses valid East slope without zero drop');
  assert.ok(tex.image.data[borderIdx] > 110, 'no false 4000m cliff spike on measured border');
  tex.dispose();
});

test('createTerrainSurface ref-counts cached normalTexture safely across restitch and disposal', () => {
  const data = {
    rows: 3, cols: 3,
    bounds: [0, 0, 0.01, 0.01],
    radii: new Float64Array(9).fill(3396000),
    heights: new Float64Array(9).fill(100),
    measured: new Uint8Array(9).fill(1)
  };
  const first = createTerrainSurface(data, null, () => 3396000);
  const sharedTex = first.normalTexture;
  let disposes = 0;
  sharedTex.addEventListener('dispose', () => { disposes++; });

  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  first.mesh.material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uTerrainCenter?.value instanceof THREE.Vector3);
  assert.ok(shader.fragmentShader.includes('vTerrainEast'));

  const replacement = createTerrainSurface(data, null, () => 3396000, null, {
    occlusion: first.occlusion,
    analysis: first.analysis,
    normalTexture: sharedTex
  });
  first.mesh.geometry.dispose();
  first.mesh.material.dispose();
  first.mesh.material.dispose();
  assert.equal(disposes, 0, 'restitched normalTexture stays alive while replacement references it');

  replacement.mesh.geometry.dispose();
  replacement.mesh.material.dispose();
  assert.equal(disposes, 1, 'shared normalTexture disposes cleanly once final owner disposes');
});
