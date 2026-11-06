import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTerrain } from "../src/terrain-analysis.js";
import { buildRouteProfile, profileAt } from "../src/route-profile.js";
import { createFilterRegistry } from "../src/filter-registry.js";
import {
  applyViewPreset,
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
test("dateline terrain gradients use unwrapped local spacing", () => {
  const data = grid();
  data.bounds = [179.999, 0, 180.001, 0.002];
  data.heights.set([0, 10, 20, 0, 10, 20, 0, 10, 20]);
  const result = analyzeTerrain(data);
  assert.ok(result.metrics[17] > 9 && result.metrics[17] < 10);
});
test("route profiles use source elevation separately from planetary radius, including legacy fallback", () => {
  const points = [
    [179.999, 0, 3396000],
    [-180, 0, 3396005],
    [-179.999, 0, 3396010],
  ];
  const profile = buildRouteProfile({
    points,
    heights_m: [-2500, -2500, -2500],
  });
  assert.equal(profile.min, -2500);
  assert.equal(profile.max, -2500);
  assert.ok(profile.total > 100 && profile.total < 130);
  assert.equal(profileAt(profile, 0.5).height, -2500);
  assert.equal(profileAt(profile, 5).distance, profile.total);
  assert.equal(buildRouteProfile({ points }).max, 10);
  assert.match(buildRouteProfile({ points }).datum, /Radial change/);
});
test("presets validate select values, clear prior settings, ignore unknown keys and cannot enable unavailable data", () => {
  const registry = createFilterRegistry();
  registry.register({
    id: "mode",
    type: "select",
    default: "natural",
    options: [{ value: "natural" }, { value: "slope" }],
  });
  registry.register({ id: "grid", type: "toggle", default: false });
  registry.register({
    id: "science",
    type: "toggle",
    default: false,
    disabled: true,
  });
  registry.set("grid", true);
  applyViewPreset(registry, {
    values: { mode: "slope", unknown: 5, science: true },
  });
  assert.deepEqual(registry.snapshot(), {
    mode: "slope",
    grid: false,
    science: false,
  });
  registry.restore({ mode: "<script>" });
  assert.equal(registry.get("mode"), "natural");
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
test("saved locations reject invalid coordinates and tolerate malformed or blocked storage", () => {
  assert.ok(validPin({ name: "Dateline", longitude: -180, latitude: 90 }));
  const storage = {
    getItem: () =>
      JSON.stringify([
        { name: "Good", longitude: 77, latitude: 18 },
        { name: "Bad", longitude: NaN, latitude: 95 },
      ]),
  };
  assert.equal(loadLocalList(storage, "pins", validPin).length, 1);
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
