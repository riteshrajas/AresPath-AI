import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilterRegistry } from '../src/filter-registry.js';

const toggle = { id: 'coordinates', type: 'toggle', default: false };
const range = { id: 'exposure', type: 'range', min: .4, max: 2, step: .05, default: 1.05 };
test('registering later filters publishes and applies stored, validated preferences', () => {
  let stored = '{"coordinates":true,"exposure":99,"places":true}', applied;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const registry = createFilterRegistry({ storage });
  registry.register({ ...range, apply: value => { applied = value; } });
  assert.equal(applied, 2);
  let changes = 0; registry.subscribe(() => changes++);
  registry.register(toggle);
  assert.equal(changes, 1);
  assert.equal(registry.get('coordinates'), true);
  registry.register({ id: 'places', type: 'toggle', default: false, disabled: true });
  assert.equal(registry.get('places'), false);
  registry.set('places', true); assert.equal(registry.get('places'), false);
  registry.set('exposure', 1.12); assert.equal(applied, 1.1);
  assert.equal(JSON.parse(stored).exposure, 1.1);
  registry.reset(); assert.equal(applied, 1.05); assert.equal(registry.get('coordinates'), false);
});
test('unavailable storage and malformed values leave usable filters', () => {
  const registry = createFilterRegistry({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } } });
  registry.register(toggle).register(range);
  registry.set('coordinates', true); registry.set('exposure', NaN);
  assert.equal(registry.get('coordinates'), true); assert.equal(registry.get('exposure'), 1.05);
  registry.set('coordinates', 'false'); assert.equal(registry.get('coordinates'), false);
  assert.throws(() => registry.register(toggle), /Duplicate/);
  assert.throws(() => registry.set('missing', true), /Unknown/);
  assert.throws(() => registry.register({ ...range, id: 'bad-step', step: Infinity }), /Invalid filter range/);
  registry.register({ ...range, id: 'clamped-default', default: 99 });
  registry.set('clamped-default', NaN); assert.equal(registry.get('clamped-default'), 2);
});
