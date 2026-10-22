# 🔴 AresPath AI: Next-Gen Autonomous Martian EVA Navigation Platform

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Universal%20Event-red.svg)](https://www.spaceappschallenge.org)
[![Challenge](https://img.shields.io/badge/Challenge-Interplanetary%20Survival%20Guide%3A%20Martian%20Map-blue.svg)](https://www.spaceappschallenge.org)
[![Team](https://img.shields.io/badge/Team-AresPath%20AI-orange.svg)](https://www.spaceappschallenge.org)
[![Status](https://img.shields.io/badge/Status-Active%20R%26D-success.svg)](#)

> **Interplanetary Survival Guide: Martian Map**  
> NASA International Space Apps Challenge 2026 | Universal Event

---

## 🚀 Mission Overview

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
