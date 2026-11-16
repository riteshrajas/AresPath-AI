# AresPath AI

**NASA Space Apps Challenge 2026** — *Interplanetary Survival Guide: Martian Map*

AresPath AI is an interactive 3D Mars globe and surface route planner built around real elevation data from NASA, USGS, and ESA. Instead of using procedural noise or guessed heights from satellite photos, the app streams measured topography so you can zoom from orbit down to meter-scale crater floors, inspect slopes, plan routes across the surface, and stand at ground level in the browser.

## What's Inside

- **Continuous 3D Mars Globe:** Starts with global MOLA laser altimetry (~14.8 km) and loads finer terrain tiles as you zoom in, pulling from the USGS 200 m HRSC/MOLA global blend, 20 m CTX mosaics, and ~1 m HiRISE stereo terrain models at Jezero Crater, Gale Crater, and Olympus Mons.
- **Terrain Route Planner:** Pick any two points on the surface—or search an offline catalog of 2,051 official Mars landmarks—to run a 3D A* search over the elevation grid. It compares three route profiles side by side (*Safest*, *Balanced*, and *Shortest*) with custom slope limits and a scrubbable elevation chart.
- **Cinematic Replay:** Pre-builds high-density terrain meshes along a finished route using Web Workers and IndexedDB, then flies a camera smoothly over the path without stuttering or running out of GPU memory.
- **Surface 360° View:** Places the camera 2.5 meters above the local ground triangle and uses a WebGL GPU path tracer (`three-gpu-pathtracer` + `three-mesh-bvh`) to render multi-bounce sunlight and terrain shadows.
- **Real-Time Martian Sky & Visual Filters:** Connects to NASA NAIF SPICE kernels (`spiceypy`) to calculate live Sun, planet, and star positions from Mars, alongside 33 shader controls for slope, elevation, local roughness, contour lines, and sensor coverage.

## Tech Stack

- **Frontend:** JavaScript (ES Modules), Vite, Three.js, `three-gpu-pathtracer`, `three-mesh-bvh`, Web Workers, IndexedDB
- **Backend:** Python, FastAPI, Rasterio / GDAL, NumPy, SpiceyPy (CSPICE)
- **Data:** NASA MGS MOLA, USGS HRSC/MOLA 200m Blended DEM v2, NASA MRO HiRISE & CTX DTMs, IAU/USGS Planetary Gazetteer, JPL DE440s Ephemerides, HEASARC Bright Star Catalog

## Running Locally

### 1. Install dependencies
```powershell
python -m pip install -r backend/requirements.txt
cd frontend && npm ci && cd ..
```

### 2. Prepare the datasets (first run)
Raw rasters and SPICE kernels are kept out of git and built locally into `data/`:
```powershell
python -m pip install -r pipeline/requirements-terrain.txt
python pipeline/verified_terrain.py --sites jezero gale
python pipeline/stitch_globe.py
python pipeline/expand_gale.py
python pipeline/prepare_olympus_detail.py
python pipeline/prepare_sky.py

# Optional: full 200 m global DEM (~11.4 GB resumable download)
# python pipeline/prepare_global_terrain.py
```

### 3. Start the app
```powershell
npm run dev
```
- **Mars Globe:** `http://127.0.0.1:5173/`
- **Tile Inspector:** `http://127.0.0.1:5173/tiles.html`
- **API Docs:** `http://127.0.0.1:8001/docs`

### 4. Run tests
```powershell
npm test
python -m pytest backend/tests -q
```

## Project Layout

- [`frontend/`](frontend/) — Three.js globe, tile streaming, shaders, route planner UI, cinematic replay, and 360° surface view
- [`backend/`](backend/) — FastAPI tile server, 3D A* route solver, and SPICE sky endpoints
- [`pipeline/`](pipeline/) — Scripts that fetch, crop, and checksum-verify official NASA/USGS datasets
- [`docs/`](docs/) — Engineering notes covering the [API framework](docs/FRAMEWORK.md), [route planner](docs/ROUTING.md), [globe streaming](docs/GLOBE_STREAMING.md), [filters](docs/FILTERS.md), and [data limits](docs/TERRAIN_HANDOFF.md)

## Team

- **Ritesh Raj Arul Selvan** — Team Owner & Technical Lead
- **Rishabh Pandey** — Core Engineer
- **Ishan Sivamaran Rajesh** — Core Engineer
