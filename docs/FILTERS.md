# Filters and overlays

The Filters button opens a searchable layer library with collapsible Terrain,
Routes, Coordinates, Data quality, Lighting, Places and Future science groups.
Active-setting chips reset individual preferences. Clear overlays removes map
annotations and analytical coloring; Reset restores all defaults. Six built-in
presets (Clean, Explore, Terrain study, Route planning, Data quality, Cinematic)
start from defaults, so previously enabled settings cannot leak into a preset.
Up to 20 named custom presets can be saved, replaced by name, and removed.

The surface selector offers natural imagery, elevation colors, slope, local
roughness, source resolution, loaded-data coverage and shaded relief. Contours,
steep-slope highlighting, source transition edges, a geographic grid and wireframe
can be combined with it. Exposure, contrast, saturation, imagery, cast shadows,
exploration light direction/elevation and RT star visibility are adjustable.
Real-time sky overrides the illustrative exploration light; Terrain lighting in
the header must be on for local cast shadows and the exploration light controls.

Route layers include selected/all paths, endpoint labels, direction arrows,
distance markers, the planning corridor and a scrubbable elevation profile.
These are display preferences: hiding a layer or changing the pink slope
threshold never changes route constraints or recalculates a path. The profile
uses the route API's `heights_m` array, separate from planetary radii. Legacy
results explicitly show radial change from start instead. A profile cursor shows
the inspected point on the map. Unavailable routes have no fabricated profile.

Saved pins support naming the view-center point, fly-to, deletion, and optional
map labels (up to 50). Pins and presets use `arespath.pins.v1` and
`arespath.presets.v1` in localStorage. Storage failure leaves session-only entries
with a visible explanation. Coordinates, approximate camera altitude, an
approximate view-center scale bar, a compass/north reference toggle, and a live
FPS / frame-time counter in the bottom-right corner are also available. Reference
lines follow the surface shader; the scale bar uses two rays on a sphere at the
center's sampled radius, and both the scale bar and camera altitude display hide
when the camera is aimed at sky or terrain data is unavailable.

## Interpretation and performance

Analysis attributes are baked once per incoming mesh, including worker-prepared
cinematic geometry; preference changes update shared uniforms. There is no new
full-screen render pass or ray tracing. Source fields are not modified. Slope
uses finite differences in metres, and roughness is the absolute difference
from the available same-source 3 × 3 neighborhood mean. These describe the
displayed DEM grid, not individual rocks, sand, traction or verified safety.

Neighbor samples from another source or an unloaded tile are excluded. Source
transitions, unavailable samples and display-only collars are gray in analytical
color layers; contours and steep highlights are suppressed there. Optional
magenta marks source transitions. Resolution colors use prepared source pixel
size, not displayed vertex spacing; the information card lists both separately.
The coverage view classifies loaded samples by source resolution, not imagery
coverage or instrument attribution. Contours fade when too dense on screen.

The global overview uses a 720 × 360 mesh over the 1440 × 720 MOLA grid:
approximately 29.6 km display spacing vs 14.8 km source spacing at the equator.
Its heights are radii relative to the 3,396 km reference sphere. Local source
heights use the source areoid datum. Legends label this distinction; global
and local contours should not be interpreted as one continuous elevation datum.
The source-info card describes the fine loaded window, not every visible pixel.

Map annotations are bounded and updated at 20 Hz; readouts update at 5 Hz.
Route geometries are reused until the result or relevant preferences change.
DOM markers use spherical horizon culling, not per-label fine DEM raycasts, so
they are approximate annotations and may remain visible behind local ridges.
Replay hides the analytical HUD while retaining the chosen surface appearance.
The compact source card is hidden on narrow phones; source details remain in
the route results and legends. No additional runtime dependency was added.

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
  type: 'toggle',   // toggle, range, or select
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
datasets: bookmarks are implemented locally; landing sites and traverses are
disabled until official mission data is curated. Geological units, dune/sand
maps, thermal inertia, ice evidence, and dated dust/weather products have
disabled, searchable extension slots explaining their data requirements.
Do not enable them by relabeling procedural effects or terrain roughness.

The panel and registry are created once for the lifetime of this viewer page.
An application that mounts multiple viewers should add teardown for its DOM,
subscriptions, overlays and listeners before reusing this UI in a router.

## Navigation hooks

The animation loop calls `navigation.beginFrame(now)` before OrbitControls,
`navigation.applyView()` after camera clearance, then `navigation.update()` after
rendering. These hooks keep free-looking separate from the surface travel anchor.
Keep this ordering when adding effects or overlays. Panels and their sliders
should consume their own keyboard input rather than moving the camera.
