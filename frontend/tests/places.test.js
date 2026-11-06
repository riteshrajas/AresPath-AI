import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchPlaces, spacedLabels, placeViewRange } from '../src/places-data.js';
const catalog = JSON.parse(readFileSync(new URL('../public/data/mars-places.json', import.meta.url)));

test('offline catalog has unique official IDs and normalized valid coordinates', () => {
  assert.equal(catalog.features.length, catalog.count);
  assert.ok(catalog.count > 2000);
  assert.equal(new Set(catalog.features.map(place => place.id)).size, catalog.count);
  for (const place of catalog.features) {
    assert.ok(place.name && place.source_url.endsWith(`/Feature/${place.id}`));
    assert.ok(place.longitude >= -180 && place.longitude < 180);
    assert.ok(place.latitude >= -90 && place.latitude <= 90);
    assert.ok(Number.isFinite(place.diameter_km) && place.diameter_km >= 0);
  }
});
test('search finds official landmarks with case-independent category filtering', () => {
  const olympus = searchPlaces(catalog.features, 'OLYMPUS', 'mountains');
  assert.ok(olympus.some(place => place.name === 'Olympus Mons'));
  assert.equal(searchPlaces(catalog.features, 'Olympus Mons', 'craters').length, 0);
  assert.equal(searchPlaces(catalog.features, 'Jezero')[0].name, 'Jezero');
  assert.equal(searchPlaces(catalog.features, 'place-that-does-not-exist').length, 0);
  for (const place of catalog.features) assert.ok(placeViewRange(place) >= 3000 && placeViewRange(place) <= 800000);
});
test('label layout limits density and excludes overlapping labels', () => {
  const spaced = spacedLabels([{x:100,y:100,width:80},{x:110,y:105,width:80},{x:400,y:100,width:80}], 2);
  assert.equal(spaced.length, 2); assert.equal(spaced[1].x, 400);
});
