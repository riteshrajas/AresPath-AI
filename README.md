# Project AresPath: 3D Martian Terrain & Route Explorer

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026-red.svg)](https://www.spaceappschallenge.org)
[![Challenge](https://img.shields.io/badge/Challenge-Interplanetary%20Survival%20Guide%3A%20Martian%20Map-blue.svg)](https://www.spaceappschallenge.org)

> **Interplanetary Survival Guide: Martian Map**: NASA International Space Apps Challenge 2026

**AresPath** is an interactive 3D Mars globe and surface route planner built on real NASA, USGS, and ESA elevation datasets. It lets users explore Mars from orbit down to meter-scale terrain, analyze surface slopes, plan 3D routes, and experience ground-level views right in the browser.

---

## Key Features

- **Multi-Resolution 3D Mars Globe:** Streams real elevation data on demand as you zoom—combining global **MOLA** (~14.8 km), the **USGS HRSC/MOLA Global Blend** (200 m), and high-resolution **CTX** (20 m) & **HiRISE** (~1 m) terrain at **Jezero Crater**, **Gale Crater**, and **Olympus Mons**.
- **3D $A^*$ Route Planner:** Pick any two points (or search **2,051 official Mars landmarks**) to calculate and compare **Safest**, **Balanced**, and **Shortest** paths using real terrain slope constraints and an interactive elevation profile.
- **Cinematic Route Replay:** Pre-loads high-resolution terrain along your chosen route using Web Workers and IndexedDB for a smooth, terrain-following camera fly-through.
- **Surface 360° & GPU Path Tracing:** Stand 2.5 m above the Martian surface at any point with progressive multi-bounce GPU path-traced lighting.
- **Real-Time NASA Sky (`RT`) & 33 Visual Filters:** Uses NASA NAIF **SPICE** kernels (`spiceypy`) to render live Martian sun/star positions alongside real-time overlays for slope, elevation, roughness, contours, and data resolution.

---

## Tech Stack

- **Frontend:** JavaScript (ES Modules), Vite, Three.js, `three-gpu-pathtracer`, `three-mesh-bvh`, Web Workers, IndexedDB
- **Backend:** Python, FastAPI, Rasterio / GDAL, NumPy, SpiceyPy (NASA CSPICE)
- **Data Sources:** NASA MGS MOLA, USGS HRSC/MOLA 200m Blend, NASA MRO HiRISE & CTX DTMs, IAU/USGS Planetary Gazetteer, JPL DE440s & HEASARC BSC5P Star Catalog

---

## Quick Start

### 1. Install Dependencies
```powershell
python -m pip install -r backend/requirements.txt
cd frontend && npm ci && cd ..
```

### 2. Prepare Terrain & Sky Data (First Run)
```powershell
python -m pip install -r pipeline/requirements-terrain.txt
python pipeline/verified_terrain.py --sites jezero gale
python pipeline/stitch_globe.py
python pipeline/expand_gale.py
python pipeline/prepare_olympus_detail.py
python pipeline/prepare_sky.py
# Optional (~11.4 GB global 200 m layer):
# python pipeline/prepare_global_terrain.py
```

### 3. Run the App
```powershell
npm run dev
```
- **3D Mars Explorer:** `http://127.0.0.1:5173/`
- **Tile Inspector:** `http://127.0.0.1:5173/tiles.html`
- **API Docs:** `http://127.0.0.1:8001/docs`

### 4. Run Tests
```powershell
npm test
python -m pytest backend/tests -q
```

---

## Project Structure

- [`frontend/`](frontend/) — Vite + Three.js 3D globe, shaders, route UI, cinematic replay, and 360° surface viewer
- [`backend/`](backend/) — FastAPI tile server, $A^*$ route planner, and SPICE sky calculator
- [`pipeline/`](pipeline/) — Scripts to download and verify official NASA/USGS datasets
- [`docs/`](docs/) — Detailed notes on [framework setup](docs/FRAMEWORK.md), [routing](docs/ROUTING.md), [streaming](docs/GLOBE_STREAMING.md), [filters](docs/FILTERS.md), and [scientific limits](docs/TERRAIN_HANDOFF.md)

---

## Team AresPath AI
- **Ritesh Raj Arul Selvan** — Team Owner & Technical Lead
- **Rishabh Pandey** — Core Engineer
- **Ishan Sivamaran Rajesh** — Core Engineer
