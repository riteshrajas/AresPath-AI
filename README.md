# 🔴 AresPath AI: Next-Gen Autonomous Martian EVA Navigation Platform

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Universal%20Event-red.svg)](https://www.spaceappschallenge.org)
[![Challenge](https://img.shields.io/badge/Challenge-Interplanetary%20Survival%20Guide%3A%20Martian%20Map-blue.svg)](https://www.spaceappschallenge.org)
[![Team](https://img.shields.io/badge/Team-AresPath%20AI-orange.svg)](https://www.spaceappschallenge.org)
[![Status](https://img.shields.io/badge/Status-Active%20R%26D-success.svg)](#)

> **Interplanetary Survival Guide: Martian Map**  
> NASA International Space Apps Challenge 2026 | Universal Event

---

## 🚀 Mission Overview

**Current application framework:** [`frontend/`](frontend/) is the independent
Vite/Three.js app; [`backend/`](backend/) is the FastAPI terrain service. Start
with the [run instructions and API contract](docs/FRAMEWORK.md). Both the globe
and arbitrary-coordinate tile explorer use the backend. A [global 200 m HRSC/MOLA
blend](docs/GLOBAL_TERRAIN.md) supplies denser zoom terrain, with coarse MOLA as
fallback. Finer CTX/HiRISE data remains limited to Jezero and Gale. Automatic
zoom-driven terrain windows now load directly on the globe after selecting a
location by double-click, coordinates or a site button. This uses a bounded local
tile window, not a full planetary quadtree. The broader mission
capabilities described below are aspirations, not verified implemented features.

**Interactive exploration:** The globe now includes drag-based look/movement
controls, a searchable 32-control filter library with saved views and pins,
terrain heatmaps/contours and route elevation profiles, an offline catalog of
2,051 official Mars landmarks,
and location search. [Terrain route planning](docs/ROUTING.md) compares safest,
balanced and shortest elevation-based paths between landmarks or crosshair
points, with background processing and explicit source-resolution limits.
[Cinematic Replay](docs/CINEMATIC_REPLAY.md) prepares native terrain cells and
worker-built meshes along a chosen route before a start-to-finish camera replay.
These are DEM-based visualizations; small hazards and verified rover safety are
not modeled. See [filter extensions](docs/FILTERS.md) and
[lighting limitations](docs/REALISM.md).

After installing the frontend and backend dependencies in the framework guide,
`npm run dev` at the repository root starts both services. `npm test` runs the
frontend suite; `python -m pytest backend/tests -q` runs the backend suite.

**Expanded Gale dataset:** The globe can sample the [10-km-radius Gale mosaic](docs/GALE_10KM.md). Valid source coverage is complete within the requested radius: about 29.5% HiRISE and 70.5% CTX, prepared at 20 m with a separate 40 m export mesh; the new globe selects its display grid by zoom. The sources have measured vertical offsets and may show seams; the original small terrain files remain available.

**Legacy static globe UI:** `web/index.html` renders coarse measured MOLA planetary radii and places the verified Jezero and Gale HiRISE patches at their source coordinates. Three small navigation buttons move between the globe and the patches in one scene; procedural site models, hazard controls and simulated telemetry remain removed. See [globe stitching details and reproduction](docs/GLOBE_STITCHING.md). The separate terrain viewer and scientific output files remain available.

**Verified terrain deliverable (October 21, 2026):** Small Jezero and Gale patches are generated from published HiRISE DTMs using [`pipeline/verified_terrain.py`](pipeline/verified_terrain.py). See the [reproducible handoff, measured results, and limitations](docs/TERRAIN_HANDOFF.md). The viewer is `web/verified-terrain.html`. This processes existing stereo-derived elevations; it does not perform new raw-image reconstruction. Other terrain generators and the placeholder DepthPro server include procedural/brightness-derived prototypes and must not be presented as verified terrain or measured GPU inference.

Human explorers on Mars cannot rely on static orbital pictures or slow ground-control pathing from Earth (which suffers from an 8 to 48-minute round-trip speed-of-light communication delay). When astronauts step outside the habitat for a **Marswalk (Extravehicular Activity — EVA)**, tactical decisions must happen in real time on the surface.

**AresPath AI** is an intelligent tactical navigation and environmental situational awareness engine designed for future human Martian explorers. It ingests multi-mission, multi-agency datasets across NASA, ESA, ISRO, CNSA, Roscosmos, and the UAE Space Agency, synthesizing them into:
1. **Multi-Resolution 3D Terrain Meshes:** Overcoming the lack of high-res global Mars models by photogrammetrically fusing orbital stereo imagery (HiRISE, CTX, HRSC) with ground-truth rover imagery.
2. **Dynamic Traversability & Hazard Analysis:** Real-time grading of slope slippage hazards, boulder densities, and loose dust traps using thermal inertia and ground-truth wheel slip models.
3. **RF / Communications Line-of-Sight (LOS) Awareness:** 3D raycasting from astronaut positions back to the Habitat base station, Mars Ascent Vehicle (MAV), and orbital relay passes (MRO, Odyssey, TGO).
4. **Metabolic & Consumables Safety Horizon:** Dynamic radius-of-return computation based on suit $O_2$ consumption, thermal load, suit battery capacity, and return travel grade.

---

## 👥 Team AresPath AI

* **Team Owner & Technical Lead:** Ritesh Raj Arul Selvan *(United States)*
* **Core Engineer:** Om Anand *(India)*
* **Core Engineer:** Rishabh Pandey *(United States)*
* **Core Engineer:** Ishan Sivamaran Rajesh *(United States)*
* **Core Engineer:** Ishan Anand *(India)*

---

## 📂 Repository Structure

```text
AresPath-AI/
├── supplemental_resources/               # Comprehensive data catalog & technical documentation
│   ├── 01_GLOBAL_SATELLITE_AND_MISSION_INVENTORY.md   # Satellites & instruments (NASA, ESA, ISRO, CNSA, Roscosmos, UAE)
│   ├── 02_PUBLIC_DATASETS_AND_API_ENDPOINTS.md       # Open APIs, REST/WMS endpoints, and PDS downloaders
│   ├── 03_MARTIAN_WEATHER_ATMOSPHERE_AND_RADIATION.md # Live weather telemetry (MEDA, REMS, TWINS, EXI)
│   ├── 04_3D_TERRAIN_RECONSTRUCTION_AND_STITCHING.md  # Ames Stereo Pipeline, photogrammetry, NeRF/3DGS & heightmaps
│   └── 05_TACTICAL_EVA_ROUTING_AND_HAZARD_INDEX.md    # Multi-objective path optimization & line-of-sight math
├── data/                                 # Raw and cached sample tiles / GeoTIFFs (gitignored)
├── pipeline/                             # Data ingestion & photogrammetry automation scripts
├── core/                                 # Path optimization and traversability algorithms
├── web/                                  # Interactive 3D Cesium/Three.js tactical HUD client
└── README.md                             # Project manifest & execution roadmap
```

---

## 📅 Hackathon Milestones

* **October 28, 2026:** NASA official challenge statement & dataset pack drops.
* **November 2, 2026:** Space Apps Connect platform opens for team collaboration.
* **November 14–15, 2026:** 48-Hour Global Hackathon Sprint (build, deploy, record video, submit).
