# Mars terrain framework

The canonical applications are `frontend/` (Vite + Three.js) and `backend/`
(FastAPI + Rasterio). Shared measured terrain stays in `data/verified_terrain/`;
offline preparation stays in `pipeline/`. The older `web/` viewer remains available.
This is a local prototype foundation, not a deployed planetary high-resolution service.

## Run locally

From the repository root, in one terminal:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ for the globe, `/tiles.html` for arbitrary-coordinate
terrain tiles, and http://127.0.0.1:8001/docs for API documentation. Vite proxies
`/api` to port 8001. `ARESPATH_API_TARGET` changes that proxy target;
`VITE_API_BASE_URL` sets an explicit browser API origin when needed.
Python environment variables are `ARESPATH_DATA_ROOT` and `ARESPATH_CORS_ORIGINS`;
example files document them, but neither application automatically loads backend `.env`.

For a single-origin production build, run `npm run build` inside `frontend/`,
then restart the API. FastAPI serves `frontend/dist` when present at startup.
There is no cloud deployment, authentication, worker queue or distributed cache yet.

## Data preparation

On a fresh checkout the scientific arrays and rasters are absent (gitignored).
Follow [the original terrain handoff](TERRAIN_HANDOFF.md),
[MOLA preparation](GLOBE_STITCHING.md), and [Gale expansion](GALE_10KM.md).
An empty data directory produces an explicit unavailable response, not synthetic terrain.
`backend/catalog.json` declares regional source priority and attribution IDs.
Prepare new datasets offline, update that registry, and restart the API to rebuild
its catalog revision and clear its in-memory cache. This is manual ingestion.

## API contract

All routes below use `/api/v1`.

| Route | Result |
| --- | --- |
| `/health` | Readiness, revision and loaded region count |
| `/catalog` | Tile scheme, source metadata and prepared dataset footprints |
| `/coverage?longitude=138.3497866414&latitude=-4.9236258419` | Actual selected sample, source and elevation |
| `/tiles/12/3622/2160?size=65` | Gale tile with heights, radii and a source ID per node |
| `/globe/manifest` | Globe metadata and API links to existing prepared region grids |
| `/globe/radius.i16`, `/globe/areoid.i16` | Prepared global MOLA arrays |
| `/regions/gale/grid`, `/regions/jezero/grid` | Existing display meshes |
| `/regions/{site}/manifest` | Provenance for the selected prepared region |
| `/basemaps/mars-color` | Existing visual color basemap |

Coordinates are planetocentric degrees, east longitude in [-180,180], latitude
[-90,90]. Heights are meters above the prepared areoid; radii are meters from
Mars' center. The `mars-equirectangular-v1` scheme is **not Web Mercator**:
level z contains `2^z` tiles on each axis, with x west-to-east and y north-to-south.
Level 0 spans the full planet. Supported z is 0–18; node grids are 33, 65 or 129
per axis, inclusive edges, flattened row-major north-to-south.

MOLA supplies bilinear coarse global terrain (4 pixels/degree, approximately
14.8 km at the equator). Prepared regional rasters override it using nearest
native cells, with fine original HiRISE crops taking priority over the expanded
Gale mosaic. Per-node IDs preserve HiRISE/CTX/MOLA attribution. Additional output
nodes do not imply additional measured detail.

Tiles have a 128-entry per-worker memory cache, ETags and conditional HTTP 304
responses; the browser keeps 32 completed tiles. Revision changes require API
restart and page reload. There is no cache persistence or measured capacity claim.
The raster handlers are synchronous FastAPI routes, so their blocking work runs
in its worker thread pool rather than an async event loop.

## Verified behavior and remaining work

Six backend tests cover real-raster sample equality, global fallback, empty data,
input bounds, shared tile edges, conditional caching and registry geography.
Six frontend tests cover coordinate conversion, cache/cancellation, explicit
API failures, zoom planning, dateline/pole indices, grid assembly, mixed revisions
and bounded concurrency. The frontend production build passes; Vite reports its shared
Three.js chunk exceeds 500 kB minified (about 126 kB gzipped).

Browser checks observed the API-backed Gale globe, a Gale tile with HiRISE/CTX,
and a tile at 0 degrees longitude/latitude explicitly reporting 100% MOLA.
A browser-only fetch binding bug was corrected during this check.

The globe now selects terrain windows by view range around a selected surface
location. See [globe streaming](GLOBE_STREAMING.md). **A full visible-planet quadtree,
seam-free source harmonization, broader high-resolution ingestion and photometric
matching remain unfinished**. Both the globe and tile explorer use the global API.
The existing Gale source offsets and render collar are documented in the linked
scientific handoffs. The color basemap's registration has not been independently
validated. This is not a navigation safety product or new stereo reconstruction.
