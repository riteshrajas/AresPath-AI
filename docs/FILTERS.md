# Filters and overlays

The Filters button opens display controls organized into Map overlays, Visual
effects and Places. Coordinate readout, crosshair, exposure, contrast, saturation
and terrain wireframe work now. Places has official USGS/IAU landmark search,
category filters, collision-limited map labels and fly-to-center selection. Saved
locations remains Planned until bookmark storage and UI are implemented.

Preferences use the versioned `arespath.filters.v1` localStorage key. Missing,
malformed or inaccessible storage falls back to defaults. Reset filters restores
defaults. Exposure uses the renderer's tone mapping; contrast and saturation use
canvas compositing. These effects don't modify scientific data or UI colors.
Wireframe also applies to terrain tiles that arrive after enabling it.

Coordinates describe the view center, not the camera position. The orbital view
uses an inexpensive reference-sphere intersection; surface exploration shares
the terrain focus raycast cache. The readout is approximate and reports Looking
at sky when the view center misses Mars. No extra raycast runs when it is hidden.

## Add a filter

`createViewFilters` in `frontend/src/view-filters.js` returns `{ registry, update }`.
Register a new filter there alongside the built-ins, or through that registry at
initialization. The panel builds its inputs from definitions, including later
registrations. IDs must be unique and stable for persisted preferences.

```js
viewFilters.registry.register({
  id: 'my-overlay',
  group: 'overlays', // overlays, effects, places, or a new group
  type: 'toggle',   // toggle or range
  label: 'My overlay',
  description: 'Explain what this changes for an explorer.',
  default: false,
  apply: visible => { myOverlay.visible = visible; },
});

viewFilters.registry.register({
  id: 'effect-strength', group: 'effects', type: 'range',
  label: 'Effect strength', default: 1, min: 0, max: 2, step: .05,
  format: value => `${Math.round(value * 100)}%`,
  apply: value => { myShader.uniforms.strength.value = value; },
});
```

Use `registry.get(id)`, `registry.set(id, value)`, `registry.reset()` and
`registry.subscribe(callback)` to connect other controls. Subscriptions return
an unsubscribe function. Apply handlers run once on registration and on changes;
per-frame overlay work belongs in `update`, gated by its setting. Avoid rebuilding
geometry or adding full-screen passes when a uniform or visibility flag suffices.

## Places data and updates

`frontend/public/data/mars-places.json` is a committed, offline snapshot of the
official IAU/USGS Gazetteer. Refresh it with `python pipeline/prepare_places.py`.
The script records retrieval time, upstream URL, SHA-256 and attribution, converts
east longitudes to [-180,180), and retains stable official feature IDs. Identical
duplicates are removed; conflicting duplicates abort rather than overwrite data.
The inspected upstream file has 2052 rows, including two identical Bohar records;
the shipped catalog has 2051 unique approved features.

`places-data.js` handles category search, fly range and label spacing. `places.js`
loads the local snapshot, builds the browser and projects at most 22 labels.
Planetary horizon culling hides the far side, with label size/distance thresholds
for detail by zoom. It does not raycast every landmark against the fine DEM;
labels mark approximate feature centers and do not trace feature boundaries.
Catalog size is the upstream diameter/extent field, not a uniform physical width
for every feature type. Naming origin is explicitly labeled; it is not a geology
summary. The website makes no upstream requests to search or view the catalog.

Official landing sites/rover traverses and personal bookmarks remain separate
future layers. Implement saved locations before enabling that planned definition.

The panel and registry are created once for the lifetime of this viewer page.
An application that mounts multiple viewers should add teardown for its DOM,
subscriptions, overlays and listeners before reusing this UI in a router.

## Navigation hooks

The animation loop calls `navigation.beginFrame(now)` before OrbitControls,
`navigation.applyView()` after camera clearance, then `navigation.update()` after
rendering. These hooks keep free-looking separate from the surface travel anchor.
Keep this ordering when adding effects or overlays. Panels and their sliders
should consume their own keyboard input rather than moving the camera.
