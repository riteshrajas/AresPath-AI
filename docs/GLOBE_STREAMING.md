# Zoom-driven terrain on the globe

**Global data update:** [The 200 m HRSC/MOLA layer](GLOBAL_TERRAIN.md) now supplies
zoom terrain outside Jezero/Gale when prepared. The verification table below
records the earlier streaming milestone before this global dataset was ingested.

The main frontend now keeps the measured MOLA globe as its global context and
requests regional terrain tiles after selecting a point. The former eager Jezero
and Gale grid overlays are removed from this frontend; the older `web/` viewer
and scientific files remain available.

Open http://127.0.0.1:5173/ (development) or http://127.0.0.1:8001/ (built app).
Use Jezero/Gale, enter east longitude and latitude, or double-click the globe.
Drag to orbit the selected point and scroll to zoom. Mars returns to orbit;
zooming out past 1,200 km view range also returns to planet-centered controls.

## Implementation

- `frontend/src/terrain-window.js` selects a level from camera range, aspect and
  field of view, and requests a 3 by 3 window (clipped to two rows at a pole).
  Levels are bounded to 2–18 and tile nodes to 65 per axis. At most three tile
  requests run concurrently. Dateline columns wrap; geometry uses unwrapped angles.
- Adjacent tiles share one edge row/column when assembled into a 193 by 193
  surface. A window replaces its predecessor only after every tile completes and
  its catalog revision matches. Changed views abort previous loads. Existing
  terrain remains visible on errors, with an explicit message and delayed retry.
- Local geometry positions are relative to the window center to retain float
  precision. Retired geometry/materials are disposed; browser tile cache stays
  bounded at 32 completed tiles. There is one active terrain window.
- `terrain-surface.js` joins the window to the coarse globe with a one-cell
  visual collar and subsurface skirt. These vertices are interpolated display
  geometry, not scientific measurements. The MOLA globe stays below the collar;
  only the inner window is masked to avoid overlapping surfaces.
- MOLA uses the existing color basemap. Regional source cells use elevation
  colors, not a new satellite orthoimage. Illumination is illustrative. Geometry
  has 1x vertical scale. A radial camera clearance check is a viewing aid, not
  a collision or navigation safety guarantee.
- UI reports approximate east-west display grid spacing at the equator separately
  from the actual point source's native/prepared resolution. Resampling dense
  MOLA grids cannot create fine measured relief.

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
