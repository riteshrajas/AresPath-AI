# Zoom-driven terrain on the globe

**Global data update:** [The 200 m HRSC/MOLA layer](GLOBAL_TERRAIN.md) now supplies
zoom terrain outside Jezero/Gale when prepared. The verification table below
records the earlier streaming milestone before this global dataset was ingested.

The main frontend now keeps the measured MOLA globe as its global context and
requests regional terrain tiles after selecting a point. The former eager Jezero
and Gale grid overlays are removed from this frontend; the older `web/` viewer
and scientific files remain available.

Open http://127.0.0.1:5173/ (development) or http://127.0.0.1:8001/ (built app).
The header is now minimal: ARESPATH, the explorer subtitle and a Mars globe label.
Scroll toward the surface to select the center of the view automatically and load
terrain. Double-click remains an optional way to select another point. Legacy
`?site=jezero` and `?site=gale` links still work, and coordinate entry is available
in `/tiles.html`. Drag to orbit the selected point. Zooming out past 1,200 km view
range returns to planet-centered controls.

**October 22 zoom fix:** the previous streaming path required an explicit selected
point, so scrolling alone never entered it and stopped at the orbital minimum
distance. The globe now raycasts its view center once the estimated surface
altitude drops below 550 km, obtains source coverage, and adopts that surface
target while retaining the current camera position. A request guard and 2-second
retry delay prevent overlapping automatic selections; the separate 1,200 km exit
threshold prevents mode oscillation. Existing source-resolution limits remain.
Browser verification used only scrolling from the initial 12,562.3 km orbital
range to local ranges of 119.2, 57.0 and 18.8 km. API logs confirmed coverage
selection and terrain tile levels 7, 8 and 10 (200/validated-304 responses), with
no browser rendering errors. Six frontend tests and the production build passed.

## Implementation

- `frontend/src/terrain-window.js` selects a level from camera range, aspect and
  field of view, and requests a 3 by 3 visible ring (clipped to two rows at a
  pole). Levels are bounded to 2–18 and tile nodes to 65 per axis. Only genuinely
  far views request 33-node previews; mid-range and close views request 65-node tiles. Six visible tile
  requests run concurrently, with the previous window retained until the new ring
  is complete. Dateline columns wrap; geometry uses unwrapped angles.
- Adjacent tiles share one edge row/column when assembled into a 193 by 193
  surface. A window replaces its predecessor only after every tile completes and
  its catalog revision matches. Changed views abort previous loads. Existing
  terrain remains visible on errors, with an explicit message and delayed retry.
- Local geometry positions are relative to the window center to retain float
  precision. Retired geometry/materials are disposed; browser tile cache stays
  bounded at 96 completed tiles. There is one active terrain window.
- `terrain-surface.js` joins the window to the coarse globe with a one-cell
  visual collar and subsurface skirt. These vertices are interpolated display
  geometry, not scientific measurements. The MOLA globe stays below the collar;
  only the inner window is masked to avoid overlapping surfaces.
- The globe and regional terrain windows use the same existing color basemap and
  a restrained display grade, so zooming does not switch to a tan elevation
  palette. Illumination and color are illustrative display choices, not calibrated
  true color or a new satellite orthoimage. At close range the renderer adds a
  deterministic, restrained regolith grain to keep the finite-resolution image
  from reading as a magnified flat bitmap. Terrain windows also use a subtle
  DEM-derived tint to keep measured relief legible. These are display enhancements;
  they do not invent measured features or replace source imagery.
  Geometry has 1x vertical scale. A radial camera clearance check is a viewing aid,
  not a collision or navigation safety guarantee.
- The minimal globe header keeps the product label only. Source provenance and
  native/prepared resolution remain available through the API and tile explorer;
  resampling dense MOLA grids cannot create fine measured relief.

## Verification, October 21, 2026

Six frontend tests passed and Vite production build passed. The shared Three.js
bundle still triggers the existing >500 kB minified warning (~126 kB gzipped).
Actual backend requests through the client assembler returned finite 193 by 193
windows for:

| Point / view range | Selected level | Tiles | Source kinds observed |
| --- | --- | --- | --- |
| Gale / 25 km (aspect 1.6) | 10 | 9 | MOLA, HiRISE, CTX |
| Gale / 1 km (aspect 1.6) | 14 | 9 | HiRISE |
| 0 degrees east, 0 degrees north / 30 km | 10 | 9 | MOLA |
| Dateline at -180 degrees / 30 km | 10 | 9 | MOLA |

Browser observations confirmed the orbital globe, Gale window, Jezero window,
coordinate navigation, correct MOLA provenance away from the prepared regions,
and a zoom-driven level change. Browser console was checked for rendering errors.
Backend logs showed HTTP 200 tile/coverage responses. The six existing backend
tests were passed for the preceding API implementation; backend code is unchanged
in this globe change.

## Remaining limitations

This is a local window around the selected point, not frustum-wide quadtree LOD.
Dragging orbits that point; use another double-click/coordinate selection to
relocate. The coarse globe supplies context outside the window. At extreme
latitudes the rectangular window covers a narrow longitude wedge; the global
base continues to provide the rest of the view. Polar and dateline indices are
unit-tested, but all polar camera angles have not been browser-verified.

Level changes are atomic and can visibly pop. Source boundaries and vertical
offsets can appear as steps or steep walls, and joins can remain visible. There
is no claim of seamless scientific blending. HiRISE/CTX coverage is still limited
to the prepared Jezero/Gale datasets. The later global blend ingestion does not
expand HiRISE/CTX footprints. The inherited
8k basemap becomes blurry close to the ground and its geographic registration
has not been independently validated. High-resolution imagery streaming, source
harmonization, a full quadtree and cloud deployment remain future work.
