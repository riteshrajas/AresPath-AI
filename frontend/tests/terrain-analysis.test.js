import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  analyzeTerrain,
  attachTerrainAnalysis,
  TERRAIN_MODES,
} from "../src/terrain-analysis.js";
import {
  buildRouteProfile,
  profileAt,
  formatDistance,
} from "../src/route-profile.js";
import { createFilterRegistry } from "../src/filter-registry.js";
import {
  applyViewPreset,
  VIEW_PRESETS,
  loadLocalList,
  validPin,
} from "../src/filter-presets.js";

const grid = () => ({
  rows: 3,
  cols: 3,
  bounds: [0, 0, 0.002, 0.002],
  radii: new Float64Array(9).fill(3396000),
  heights: new Float64Array(9),
  sources: new Uint16Array(9).fill(1),
  measured: new Uint8Array(9).fill(1),
  sourceMetadata: [{ id: 1, prepared_resolution_m: 2 }],
});
test("terrain analysis measures slope in metres, keeps flat cells flat, and leaves input unchanged", () => {
  const data = grid(),
    dx = ((0.001 * Math.PI) / 180) * 3396000;
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++)
      data.heights[y * 3 + x] = x * dx * Math.tan(Math.PI / 6);
  const before = Array.from(data.heights),
    result = analyzeTerrain(data);
  assert.ok(Math.abs(result.metrics[4 * 4 + 1] - 30) < 0.001);
  assert.ok(result.metrics[4 * 4 + 2] < 1e-6);
  assert.equal(result.metrics[4 * 4 + 3], 2);
  assert.deepEqual(Array.from(data.heights), before);
  const flat = analyzeTerrain(grid());
  assert.equal(flat.metrics[17], 0);
  assert.equal(flat.metrics[18], 0);
});
test("terrain roughness calculates same-source 3x3 neighborhood residual and attachTerrainAnalysis marks collar vertices invalid", () => {
  const data = grid();
  data.heights[4] = 90;
  const result = analyzeTerrain(data);
  // Center cell (index 4) has height 90 and 8 same-source neighbors at 0 => 3x3 mean = 10, residual = 80.
  assert.ok(Math.abs(result.metrics[4 * 4 + 2] - 80) < 1e-5);
  assert.equal(result.quality[4 * 2], 1);
  assert.equal(result.quality[4 * 2 + 1], 0);

  const geometry = new THREE.BufferGeometry();
  // 9 grid vertices + 3 extra collar vertices = 12 vertices
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(12 * 3), 3),
  );
  attachTerrainAnalysis(geometry, data);
  const qualityAttr = geometry.getAttribute("terrainQuality");
  assert.equal(qualityAttr.getX(4), 1);
  assert.equal(qualityAttr.getX(9), 0);
  assert.equal(qualityAttr.getX(11), 0);
});
test("unloaded cells and source seams do not create fake cliffs or blend source height offsets", () => {
  const data = grid();
  for (let y = 0; y < 3; y++) {
    data.sources[y * 3 + 2] = 2;
    data.heights[y * 3 + 2] = 10000;
  }
  data.measured[0] = 0;
  data.heights[0] = 1e6;
  const result = analyzeTerrain(data);
  assert.equal(result.quality[0], 0);
  assert.equal(result.quality[4 * 2 + 1], 1);
  assert.equal(result.metrics[4 * 4 + 1], 0);
  assert.equal(result.metrics[4 * 4 + 2], 0);
  assert.equal(result.metrics[2 * 4 + 3], -1);
});
test("dateline and polar terrain gradients use unwrapped local spacing safely", () => {
  const unwrapped = grid();
  unwrapped.bounds = [179.999, 0, 180.001, 0.002];
  unwrapped.heights.set([0, 10, 20, 0, 10, 20, 0, 10, 20]);
  const resUnwrapped = analyzeTerrain(unwrapped);
  assert.ok(resUnwrapped.metrics[17] > 9 && resUnwrapped.metrics[17] < 10);

  const wrapped = grid();
  wrapped.bounds = [179.999, 0, -179.999, 0.002];
  wrapped.heights.set([0, 10, 20, 0, 10, 20, 0, 10, 20]);
  const resWrapped = analyzeTerrain(wrapped);
  assert.ok(Math.abs(resWrapped.metrics[17] - resUnwrapped.metrics[17]) < 1e-5);

  const polar = grid();
  polar.bounds = [-180, 89.9, 180, 90];
  polar.heights.set([0, 5, 10, 0, 5, 10, 0, 5, 10]);
  const resPolar = analyzeTerrain(polar);
  assert.ok(resultIsFinite(resPolar.metrics));
});
function resultIsFinite(arr) {
  return arr.every((v) => Number.isFinite(v));
}
test("route profiles and profile cursor interpolation stay aligned with source elevations and coordinates", () => {
  assert.equal(buildRouteProfile(null), null);
  assert.equal(buildRouteProfile({ points: [] }), null);
  const points = [
    [179.999, 0, 3396000],
    [-180, 0, 3396005],
    [-179.999, 0, 3396010],
  ];
  const profile = buildRouteProfile({
    points,
    heights_m: [-2500, -2450, -2400],
  });
  assert.equal(profile.min, -2500);
  assert.equal(profile.max, -2400);
  assert.ok(profile.total > 100 && profile.total < 130);
  const mid = profileAt(profile, 0.5);
  assert.ok(Math.abs(mid.height - -2450) < 0.5);
  assert.ok(Math.abs(Math.abs(mid.longitude) - 180) < 0.001);
  assert.ok(Math.abs(mid.radius - 3396005) < 0.5);
  const quarter = profileAt(profile, 0.25);
  assert.ok(Math.abs(quarter.height - -2475) < 0.5);
  assert.equal(profileAt(profile, -2).distance, 0);
  assert.equal(profileAt(profile, 5).distance, profile.total);
  assert.equal(profileAt(profile, NaN).distance, 0);
  assert.equal(buildRouteProfile({ points }).max, 10);
  assert.match(buildRouteProfile({ points }).datum, /Radial change/);
  assert.equal(formatDistance(450), "450 m");
  assert.equal(formatDistance(2500), "2.50 km");
  assert.equal(formatDistance(25000), "25.0 km");
});
test("presets validate select values, clear prior settings, ignore unknown keys and cannot enable unavailable data", () => {
  const registry = createFilterRegistry();
  registry.register({
    id: "terrain-mode",
    type: "select",
    default: "natural",
    options: TERRAIN_MODES,
  });
  registry.register({ id: "contours", type: "toggle", default: false });
  registry.register({ id: "coordinates", type: "toggle", default: false });
  registry.register({ id: "data-info", type: "toggle", default: false });
  registry.register({ id: "places", type: "toggle", default: true });
  registry.register({ id: "route-lines", type: "toggle", default: true });
  registry.register({ id: "route-endpoints", type: "toggle", default: true });
  registry.register({ id: "compass", type: "toggle", default: true });
  registry.register({
    id: "science",
    type: "toggle",
    default: false,
    disabled: true,
  });
  registry.set("contours", true);
  applyViewPreset(registry, {
    values: { "terrain-mode": "slope", unknown: 5, science: true },
  });
  assert.equal(registry.get("terrain-mode"), "slope");
  assert.equal(registry.get("contours"), false);
  assert.equal(registry.get("science"), false);
  const terrainStudy = VIEW_PRESETS.find((p) => p.name === "Terrain study");
  applyViewPreset(registry, terrainStudy);
  assert.equal(registry.get("terrain-mode"), "slope");
  assert.equal(registry.get("contours"), true);
  assert.equal(registry.get("data-info"), true);
  assert.equal(registry.get("places"), false);
  const clean = VIEW_PRESETS.find((p) => p.name === "Clean");
  applyViewPreset(registry, clean);
  assert.equal(registry.get("terrain-mode"), "natural");
  assert.equal(registry.get("contours"), false);
  assert.equal(registry.get("places"), false);
  assert.equal(registry.get("compass"), false);
  registry.restore({ "terrain-mode": "<script>" });
  assert.equal(registry.get("terrain-mode"), "natural");
  assert.throws(
    () =>
      registry.register({
        id: "bad",
        type: "select",
        default: "x",
        options: [],
      }),
    /Invalid/,
  );
});
test("saved locations reject invalid coordinates or empty names, enforce limits, and tolerate malformed storage", () => {
  assert.ok(validPin({ name: "Dateline", longitude: -180, latitude: 90 }));
  assert.equal(validPin({ name: "   ", longitude: 0, latitude: 0 }), false);
  assert.equal(
    validPin({ name: "x".repeat(81), longitude: 0, latitude: 0 }),
    false,
  );
  assert.equal(validPin({ name: "Out", longitude: 185, latitude: 0 }), false);
  const manyPins = Array.from({ length: 60 }, (_, i) => ({
    name: `Pin ${i}`,
    longitude: 77,
    latitude: 18,
  }));
  const storage = {
    getItem: () =>
      JSON.stringify([
        ...manyPins,
        { name: "Bad", longitude: NaN, latitude: 95 },
      ]),
  };
  assert.equal(loadLocalList(storage, "pins", validPin, 50).length, 50);
  assert.deepEqual(
    loadLocalList({ getItem: () => "{bad" }, "pins", validPin),
    [],
  );
  assert.deepEqual(
    loadLocalList(
      {
        getItem() {
          throw Error();
        },
      },
      "pins",
      validPin,
    ),
    [],
  );
});
test("responsive filter styles define narrow-screen breakpoints, focus visibility, and cinematic HUD hiding", () => {
  const css = readFileSync(
    new URL("../src/view-filters.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /\.filters-panel\s*:focus-visible/);
  assert.match(css, /body\.cinematic-playing\s+\.terrain-legend/);
  assert.match(css, /\.compass-heading\[hidden\]/);
});
