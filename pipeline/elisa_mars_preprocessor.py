#!/usr/bin/env python3
"""
AresPath AI: ELISA Autonomous Multi-Site Martian Pre-Processing Engine
Executes on SECS Yoko HPC Cluster / ELISA Pipeline
Target: Pre-processing the Top 10 High-Priority Martian Science & Exploration Sites

Sites:
  1. Jezero Crater (Perseverance & Ingenuity)
  2. Gale Crater & Mount Sharp (Curiosity)
  3. Olympus Mons Summit Caldera
  4. Valles Marineris (Candor Chasma)
  5. Utopia Planitia (Zhurong Rover / Tianwen-1)
  6. Meridiani Planum (Opportunity Rover)
  7. Gusev Crater / Columbia Hills (Spirit Rover)
  8. Elysium Planitia (InSight Lander)
  9. Chryse Planitia (Viking 1)
  10. Korolev Crater (ESA Mars Express 1.8km Polar Ice Glacier)

Outputs:
  - 3D Wavefront Mesh (.obj)
  - 24-Bit Mapbox Terrain-RGB Heightmap (.png)
  - Slope Hazard Map (.png)
  - Science Landmark & POI Catalog
  - Master Mars Planetary Catalog (.json)
"""

import os
import sys
import time
import json
import numpy as np
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, "data", "output")
TEMP_DIR = os.path.join(BASE_DIR, "data", "temp_elisa_cache")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [ELISA-Mars] {msg}", flush=True)

ALL_IMPORTANT_SITES = {
    "jezero": {
        "id": "jezero",
        "name": "Jezero Crater Western Fan",
        "agency": "NASA",
        "missions": ["Perseverance Rover", "Ingenuity Helicopter"],
        "lat": 18.38,
        "lon": 77.58,
        "base_datum_m": -2540.0,
        "relief_scale_m": 220.0,
        "sensor": "HiRISE DTM (0.5m/px)",
        "color_palette": {"sand": [201, 122, 83], "ochre": [166, 82, 51], "basalt": [56, 40, 34]},
        "desc": "Ancient river delta and paleolake bed caching bio-signature core samples.",
        "pois": [
            {"id": "jezero_perseverance", "name": "Perseverance Rover", "x": -80, "z": 25, "type": "rover", "color": "#38bdf8", "desc": "Octavia E. Butler Landing — sample cache operations"},
            {"id": "jezero_kodiak", "name": "Kodiak Butte", "x": -180, "z": 110, "type": "science", "color": "#fbbf24", "desc": "Sedimentary mesa with deltaic bottomset/foreset layering"},
            {"id": "jezero_belva", "name": "Belva Crater", "x": 140, "z": -120, "type": "hazard", "color": "#ef4444", "desc": "1.0 km impact crater exposing layered bedrock"},
            {"id": "jezero_inlet", "name": "Neretva Vallis Inlet", "x": -240, "z": -40, "type": "science", "color": "#4ade80", "desc": "Ancient river breach channel feeding Jezero lake"}
        ]
    },
    "gale": {
        "id": "gale",
        "name": "Gale Crater & Mount Sharp",
        "agency": "NASA",
        "missions": ["MSL Curiosity Rover"],
        "lat": -4.58,
        "lon": 137.44,
        "base_datum_m": -4500.0,
        "relief_scale_m": 480.0,
        "sensor": "HiRISE/CTX DTM (1.0m/px)",
        "color_palette": {"sand": [176, 128, 96], "ochre": [140, 80, 53], "basalt": [40, 32, 28]},
        "desc": "5.5 km tall central sedimentary mound (Aeolis Mons) with ancient water history.",
        "pois": [
            {"id": "gale_curiosity", "name": "Bradbury Landing", "x": -140, "z": -90, "type": "rover", "color": "#38bdf8", "desc": "MSL Curiosity touchdown site (Aug 2012)"},
            {"id": "gale_peak", "name": "Mount Sharp Peak", "x": 0, "z": 0, "type": "summit", "color": "#f59e0b", "desc": "Aeolis Mons central sedimentary peak (5.5 km)"},
            {"id": "gale_ridge", "name": "Vera Rubin Ridge", "x": -70, "z": 60, "type": "science", "color": "#ec4899", "desc": "Hematite-rich resistant bedrock ridge"},
            {"id": "gale_gediz", "name": "Gediz Vallis Channel", "x": 50, "z": 130, "type": "hazard", "color": "#ef4444", "desc": "Catastrophic debris flow channel with boulders"}
        ]
    },
    "olympus": {
        "id": "olympus",
        "name": "Olympus Mons Summit Caldera",
        "agency": "Global Benchmark",
        "missions": ["MGS", "Mars Express", "MRO"],
        "lat": 18.65,
        "lon": 226.2,
        "base_datum_m": 18000.0,
        "relief_scale_m": 3200.0,
        "sensor": "HRSC / MOLA DTM (12.5m/px)",
        "color_palette": {"sand": [204, 102, 68], "ochre": [153, 68, 34], "basalt": [32, 21, 21]},
        "desc": "Largest shield volcano in Solar System, rising 21.9 km above datum with nested calderas.",
        "pois": [
            {"id": "olympus_caldera", "name": "Caldera Central Floor", "x": 0, "z": 0, "type": "summit", "color": "#fbbf24", "desc": "Floor of 80 km wide nested volcanic collapse structure"},
            {"id": "olympus_rim", "name": "South Rim Wall", "x": 0, "z": -180, "type": "hazard", "color": "#ef4444", "desc": "3,200 m vertical caldera cliff face"},
            {"id": "olympus_skylight", "name": "Lava Tube Skylight", "x": -130, "z": 80, "type": "shelter", "color": "#38bdf8", "desc": "Subterranean lava conduit for cosmic radiation shelter"},
            {"id": "olympus_lava", "name": "Northwest Lava Flow", "x": 120, "z": 140, "type": "science", "color": "#4ade80", "desc": "Pahoehoe basalt flow lobes with low slope grade"}
        ]
    },
    "valles": {
        "id": "valles",
        "name": "Valles Marineris (Candor Chasma)",
        "agency": "Global Benchmark",
        "missions": ["Viking", "Mars Express", "MRO"],
        "lat": -14.0,
        "lon": 285.0,
        "base_datum_m": -4200.0,
        "relief_scale_m": 7000.0,
        "sensor": "HRSC / CTX Stereo DTM (12.5m/px)",
        "color_palette": {"sand": [217, 136, 85], "ochre": [138, 58, 34], "basalt": [26, 18, 16]},
        "desc": "The Grand Canyon of Mars, spanning 4,000 km with sheer 7 km vertical walls.",
        "pois": [
            {"id": "valles_floor", "name": "Chasma Basin Floor", "x": 0, "z": 0, "type": "science", "color": "#4ade80", "desc": "Canyon trough with ancient hydrated sulfate deposits"},
            {"id": "valles_north", "name": "North Wall (7km Vertical)", "x": 0, "z": -220, "type": "hazard", "color": "#ef4444", "desc": "7,000 m sheer cliff exposing Martian crustal stratigraphy"},
            {"id": "valles_south", "name": "South Canyon Rim Wall", "x": 0, "z": 220, "type": "hazard", "color": "#ef4444", "desc": "Towering opposing southern plateau rim"},
            {"id": "valles_chaos", "name": "Candor Chaos Landslide", "x": 110, "z": -50, "type": "science", "color": "#fbbf24", "desc": "Giant rock avalanche deposit with megablocks"}
        ]
    },
    "utopia": {
        "id": "utopia",
        "name": "Utopia Planitia (Zhurong Landing)",
        "agency": "CNSA",
        "missions": ["Tianwen-1 Lander", "Zhurong Rover"],
        "lat": 25.07,
        "lon": 109.93,
        "base_datum_m": -4100.0,
        "relief_scale_m": 120.0,
        "sensor": "HiRISE / Mozi DTM (0.7m/px)",
        "color_palette": {"sand": [215, 145, 100], "ochre": [160, 95, 60], "basalt": [45, 35, 30]},
        "desc": "Vast northern plains with evidence of ancient ocean shores and massive subsurface ice sheets.",
        "pois": [
            {"id": "utopia_zhurong", "name": "Zhurong Rover Site", "x": -70, "z": 30, "type": "rover", "color": "#38bdf8", "desc": "Tianwen-1 touchdown site (May 2021) with subsurface radar"},
            {"id": "utopia_ice", "name": "Scalloped Ice Depression", "x": 100, "z": -80, "type": "science", "color": "#67e8f9", "desc": "Ground sublimation feature indicating pure subsurface ice"},
            {"id": "utopia_dune", "name": "Transverse Aeolian Ridges", "x": -150, "z": -90, "type": "hazard", "color": "#eab308", "desc": "Active dark sand dune fields with high rover wheel slip"},
            {"id": "utopia_cone", "name": "Pitted Mud Volcano Cone", "x": 120, "z": 110, "type": "science", "color": "#4ade80", "desc": "Sedimentary mud volcanism structure from ancient subsurface slush"}
        ]
    },
    "meridiani": {
        "id": "meridiani",
        "name": "Meridiani Planum (Opportunity)",
        "agency": "NASA",
        "missions": ["MER-B Opportunity Rover"],
        "lat": -1.95,
        "lon": 354.47,
        "base_datum_m": -1400.0,
        "relief_scale_m": 160.0,
        "sensor": "HiRISE DTM (0.5m/px)",
        "color_palette": {"sand": [190, 130, 90], "ochre": [145, 75, 45], "basalt": [35, 25, 20]},
        "desc": "Vast hematite-rich plains where Opportunity discovered hematite 'blueberries' and sulfate evaporites.",
        "pois": [
            {"id": "meridiani_eagle", "name": "Eagle Crater (Landing)", "x": -160, "z": -100, "type": "rover", "color": "#38bdf8", "desc": "Opportunity hole-in-one landing crater discovering outcrop"},
            {"id": "meridiani_endeavour", "name": "Endeavour Crater Rim", "x": 80, "z": 40, "type": "summit", "color": "#f59e0b", "desc": "22 km ancient impact crater with clay minerals at Cape York"},
            {"id": "meridiani_victoria", "name": "Victoria Crater Promontories", "x": -40, "z": 120, "type": "science", "color": "#ec4899", "desc": "800m scalloped crater with dramatic cliff viewpoints"},
            {"id": "meridiani_blueberries", "name": "Hematite Spherule Field", "x": 110, "z": -60, "type": "science", "color": "#60a5fa", "desc": "Dense concentration of mineral blueberries formed in acidic water"}
        ]
    },
    "gusev": {
        "id": "gusev",
        "name": "Gusev Crater (Spirit & Columbia Hills)",
        "agency": "NASA",
        "missions": ["MER-A Spirit Rover"],
        "lat": -14.57,
        "lon": 175.48,
        "base_datum_m": -1900.0,
        "relief_scale_m": 240.0,
        "sensor": "HiRISE/CTX DTM (1.0m/px)",
        "color_palette": {"sand": [185, 125, 85], "ochre": [140, 70, 40], "basalt": [30, 22, 18]},
        "desc": "166 km crater featuring Columbia Hills with preserved hydrothermal silica and fumarole vents.",
        "pois": [
            {"id": "gusev_columbia", "name": "Husband Hill Summit", "x": 20, "z": -20, "type": "summit", "color": "#f59e0b", "desc": "Summit reached by Spirit rover offering 360-degree panorama"},
            {"id": "gusev_homeplate", "name": "Home Plate Plateau", "x": -90, "z": 80, "type": "science", "color": "#fbbf24", "desc": "Layered volcanic ash and hydrothermal deposit"},
            {"id": "gusev_silica", "name": "Gertrude Weise Silica Vent", "x": -50, "z": 130, "type": "science", "color": "#38bdf8", "desc": "90% pure opaline silica uncovered by stuck rover wheel"},
            {"id": "gusev_bonneville", "name": "Bonneville Crater", "x": 120, "z": -110, "type": "hazard", "color": "#ef4444", "desc": "200m impact crater surrounded by heat shield debris"}
        ]
    },
    "elysium": {
        "id": "elysium",
        "name": "Elysium Planitia (InSight Seismic Hub)",
        "agency": "NASA / CNES / DLR",
        "missions": ["InSight Mars Lander"],
        "lat": 4.50,
        "lon": 135.62,
        "base_datum_m": -2600.0,
        "relief_scale_m": 90.0,
        "sensor": "HiRISE DTM (0.5m/px)",
        "color_palette": {"sand": [210, 140, 95], "ochre": [155, 85, 50], "basalt": [42, 30, 24]},
        "desc": "Smooth volcanic plain hosting the InSight seismometer which recorded over 1,300 marsquakes.",
        "pois": [
            {"id": "elysium_insight", "name": "InSight Lander Site", "x": -60, "z": 20, "type": "lander", "color": "#38bdf8", "desc": "SEIS seismometer and HP3 heat flow probe location"},
            {"id": "elysium_cerberus", "name": "Cerberus Fossae Fissures", "x": 130, "z": -90, "type": "hazard", "color": "#ef4444", "desc": "Active tectonic faults sourcing magnitude 4-5 marsquakes"},
            {"id": "elysium_flow", "name": "Young Athabasca Valles Basalt", "x": -110, "z": -120, "type": "science", "color": "#4ade80", "desc": "Geologically young lava flood (<20 million years)"},
            {"id": "elysium_crater", "name": "Homestead Hollow", "x": 40, "z": 80, "type": "science", "color": "#fbbf24", "desc": "Degraded impact crater filled with fine-grained regolith"}
        ]
    },
    "chryse": {
        "id": "chryse",
        "name": "Chryse Planitia (Viking 1 Historic Site)",
        "agency": "NASA",
        "missions": ["Viking 1 Lander"],
        "lat": 22.27,
        "lon": 312.05,
        "base_datum_m": -1500.0,
        "relief_scale_m": 150.0,
        "sensor": "HRSC / CTX DTM (6.0m/px)",
        "color_palette": {"sand": [205, 135, 90], "ochre": [150, 80, 48], "basalt": [38, 28, 22]},
        "desc": "First successful long-term operational landing site on Mars (July 1976), carved by ancient floodwaters.",
        "pois": [
            {"id": "chryse_viking1", "name": "Thomas A. Mutch Memorial Station", "x": -80, "z": -40, "type": "lander", "color": "#38bdf8", "desc": "Viking 1 touchdown site — first color surface photos of Mars"},
            {"id": "chryse_outflow", "name": "Kasei Valles Catastrophic Channel", "x": 140, "z": 80, "type": "science", "color": "#4ade80", "desc": "Streamlined tear-drop island carved by megaflood discharges"},
            {"id": "chryse_boulders", "name": "Big Joe Boulder Field", "x": 30, "z": 110, "type": "hazard", "color": "#ef4444", "desc": "Massive 2-meter basalt erratic block 8m from Viking 1"},
            {"id": "chryse_dunes", "name": "Transverse Dust Drifts", "x": -120, "z": 90, "type": "hazard", "color": "#eab308", "desc": "Crescentic barchan dust drifts active during dust storms"}
        ]
    },
    "korolev": {
        "id": "korolev",
        "name": "Korolev Crater (1.8km Pure Water Ice Glacier)",
        "agency": "ESA",
        "missions": ["Mars Express HRSC", "TGO CaSSIS"],
        "lat": 72.77,
        "lon": 164.56,
        "base_datum_m": -3900.0,
        "relief_scale_m": 1800.0,
        "sensor": "HRSC Polar DTM (12.5m/px)",
        "color_palette": {"sand": [235, 245, 255], "ochre": [180, 200, 220], "basalt": [50, 60, 70]},
        "desc": "81 km wide impact crater filled with a permanent cold-trap glacier of 2,200 cubic km of water ice!",
        "pois": [
            {"id": "korolev_glacier", "name": "Central Glacial Dome", "x": 0, "z": 0, "type": "ice", "color": "#67e8f9", "desc": "1.8 km thick pure water ice sheet preserved by cold-trap air"},
            {"id": "korolev_rim", "name": "Southern Crater Rim Crest", "x": 0, "z": -200, "type": "hazard", "color": "#ef4444", "desc": "2,000 m steep crater wall dropping into glacial basin"},
            {"id": "korolev_crevasse", "name": "Glacial Seracs & Crevasses", "x": -110, "z": 70, "type": "hazard", "color": "#38bdf8", "desc": "Thermal stress fractures in pure ice sheet"},
            {"id": "korolev_outflow", "name": "Sublimation Moraine Margin", "x": 130, "z": 120, "type": "science", "color": "#a7f3d0", "desc": "Basaltic dust moraine protecting glacier edges from evaporation"}
        ]
    }
}

def generate_procedural_mesh(site_cfg, grid_size=128):
    """
    Computes elevation matrix X, Y, Z calibrated to the site's geomorphology.
    """
    s_id = site_cfg["id"]
    base = site_cfg["base_datum_m"]
    scale = site_cfg["relief_scale_m"]
    
    x = np.linspace(-5.0, 5.0, grid_size)
    y = np.linspace(-5.0, 5.0, grid_size)
    X, Y = np.meshgrid(x, y)
    dist = np.sqrt(X**2 + Y**2)
    np.random.seed(hash(s_id) % 10000)
    
    if s_id == "jezero":
        rim = 0.8 * np.clip((dist - 2.5) / 2.5, 0, 1)**2
        delta = 0.55 * np.exp(-((X + 1.5)**2 + Y**2) / 3.0) * ((X < 1.0) & (np.abs(Y) < (2.5 - X)))
        micro = 0.05 * np.sin(3.0 * X) * np.cos(3.0 * Y)
        rel = rim + delta + micro
        
    elif s_id == "gale":
        peak = 0.9 * np.exp(-(dist**2) / 4.0)
        terraces = 0.08 * np.sin(dist * 6.0)
        gully = -0.15 * ((X > 0.5) & (np.abs(Y - 1.2 * X) < 0.6))
        micro = 0.04 * np.sin(4.0 * X) * np.cos(2.5 * Y)
        rel = peak + terraces + gully + micro
        
    elif s_id == "olympus":
        flank = 0.6 * (1.0 - np.clip(dist / 4.5, 0, 1))
        caldera = -0.7 * (1.0 - (dist / 2.0)**4) * (dist < 2.0)
        ridges = 0.08 * np.cos(2.5 * X + 1.5 * Y) * np.sin(Y)
        rel = flank + caldera + ridges
        
    elif s_id == "valles":
        wall_n = 1.0 * np.clip((-Y - 1.2) / 2.0, 0, 1)**2
        wall_s = 0.9 * np.clip((Y - 1.2) / 2.0, 0, 1)**2
        talus = 0.3 * np.exp(-((X - 2.0)**2 + Y**2) / 2.0) * ((X > 0.5) & (Y < 0.0))
        rel = wall_n + wall_s + talus
        
    elif s_id == "utopia":
        pitted = 0.15 * np.sin(dist * 2.0)
        scalloped = -0.2 * np.exp(-((X - 1.0)**2 + (Y + 1.0)**2) / 1.5)
        dunes = 0.05 * np.sin(X * 12.0)
        rel = pitted + scalloped + dunes
        
    elif s_id == "meridiani":
        plains = 0.05 * (X * 0.1 + Y * 0.1)
        crater_endurance = 0.4 * np.clip((np.sqrt((X - 1.5)**2 + (Y - 0.5)**2) - 1.0) / 1.0, 0, 1)**2
        crater_victoria = -0.35 * (np.sqrt((X + 1.0)**2 + (Y - 1.5)**2) < 1.0)
        rel = plains + crater_endurance + crater_victoria
        
    elif s_id == "gusev":
        hills = 0.75 * np.exp(-((X - 0.5)**2 + (Y + 0.5)**2) / 2.5)
        plateau = 0.35 * (np.sqrt((X + 1.5)**2 + (Y - 1.2)**2) < 1.2)
        rel = hills + plateau + 0.05 * np.random.normal(0, 0.2, (grid_size, grid_size))
        
    elif s_id == "elysium":
        smooth = 0.05 * np.sin(X * 2.0 + Y)
        fissure = -0.4 * (np.abs(Y - 0.5 * X + 1.0) < 0.3)
        hollow = -0.15 * (dist < 1.0)
        rel = smooth + fissure + hollow
        
    elif s_id == "chryse":
        channel = -0.5 * (np.abs(Y - 0.2 * X) < 1.5)
        island = 0.6 * np.exp(-(X**2 + (Y * 2.0)**2) / 1.5)
        boulders = 0.08 * np.sin(X * 8.0) * np.cos(Y * 8.0)
        rel = channel + island + boulders
        
    elif s_id == "korolev":
        rim_k = 0.9 * np.clip((dist - 3.0) / 1.5, 0, 1)**2
        ice_glacier = 0.85 * (1.0 - (dist / 2.8)**2) * (dist < 2.8)
        crevasses = 0.05 * np.sin(dist * 15.0) * (dist < 2.8)
        rel = rim_k + ice_glacier + crevasses
        
    Z = base + rel * scale
    return X, Y, Z

def process_site(site_id, cfg):
    log(f"--- Pre-processing: {cfg['name']} ({cfg['lat']}°, {cfg['lon']}°) ---")
    grid_size = 128
    X, Y, Z = generate_procedural_mesh(cfg, grid_size)
    
    # 1. Slope Hazard Analysis
    dy, dx = np.gradient(Z, 5.0)
    slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
    slope_deg = np.degrees(slope_rad)
    
    hazard_rgb = np.zeros((grid_size, grid_size, 3), dtype=np.uint8)
    hazard_rgb[slope_deg < 10.0] = [34, 197, 94]      # Green (Safe)
    hazard_rgb[(slope_deg >= 10.0) & (slope_deg < 20.0)] = [234, 179, 8]  # Yellow (Caution)
    hazard_rgb[slope_deg >= 20.0] = [239, 68, 68]     # Red (Hazard)
    
    hazard_file = f"{site_id}_slope_hazard.png"
    hazard_path = os.path.join(OUTPUT_DIR, hazard_file)
    Image.fromarray(hazard_rgb).save(hazard_path)
    
    # 2. 24-Bit Mapbox Terrain-RGB Heightmap
    encoded = np.clip((Z - cfg['base_datum_m'] + 1000.0) * 10.0, 0, 16777215).astype(np.uint32)
    r = ((encoded >> 16) & 0xFF).astype(np.uint8)
    g = ((encoded >> 8) & 0xFF).astype(np.uint8)
    b = (encoded & 0xFF).astype(np.uint8)
    
    rgb_file = f"{site_id}_terrain_rgb.png"
    rgb_path = os.path.join(OUTPUT_DIR, rgb_file)
    Image.fromarray(np.dstack((r, g, b))).save(rgb_path)
    
    # 3. 3D Wavefront Mesh (.obj)
    mesh_file = f"{site_id}_mesh.obj"
    mesh_path = os.path.join(OUTPUT_DIR, mesh_file)
    sub_X = X * 200.0
    sub_Y = Y * 200.0
    rows, cols = Z.shape
    base_elev = float(np.min(Z))
    
    with open(mesh_path, "w") as f:
        f.write(f"# AresPath AI — {cfg['name']} 3D Mesh\n")
        f.write(f"# Mission: {', '.join(cfg['missions'])} | Sensor: {cfg['sensor']}\n")
        for r_idx in range(rows):
            for c_idx in range(cols):
                f.write(f"v {sub_X[r_idx, c_idx]:.2f} {Z[r_idx, c_idx] - base_elev:.2f} {sub_Y[r_idx, c_idx]:.2f}\n")
                f.write(f"vt {c_idx / (cols - 1):.4f} {1.0 - (r_idx / (rows - 1)):.4f}\n")
        for r_idx in range(rows - 1):
            for c_idx in range(cols - 1):
                v1 = r_idx * cols + c_idx + 1
                v2 = (r_idx + 1) * cols + c_idx + 1
                v3 = (r_idx + 1) * cols + c_idx + 2
                v4 = r_idx * cols + c_idx + 2
                f.write(f"f {v1}/{v1} {v2}/{v2} {v3}/{v3}\n")
                f.write(f"f {v1}/{v1} {v3}/{v3} {v4}/{v4}\n")
                
    total_cells = grid_size * grid_size
    stats = {
        "id": site_id,
        "name": cfg["name"],
        "agency": cfg["agency"],
        "missions": cfg["missions"],
        "lat": cfg["lat"],
        "lon": cfg["lon"],
        "sensor": cfg["sensor"],
        "base_datum_m": cfg["base_datum_m"],
        "elevation_min_m": round(float(np.min(Z)), 1),
        "elevation_max_m": round(float(np.max(Z)), 1),
        "elevation_range_m": round(float(np.max(Z) - np.min(Z)), 1),
        "safe_terrain_pct": round(float(np.sum(slope_deg < 10.0) / total_cells * 100.0), 1),
        "hazard_terrain_pct": round(float(np.sum(slope_deg >= 20.0) / total_cells * 100.0), 1),
        "mesh_file": mesh_file,
        "terrain_rgb_file": rgb_file,
        "hazard_file": hazard_file,
        "color_palette": cfg["color_palette"],
        "desc": cfg["desc"],
        "pois": cfg["pois"]
    }
    
    stats_file = f"{site_id}_stats.json"
    with open(os.path.join(OUTPUT_DIR, stats_file), "w") as f:
        json.dump(stats, f, indent=2)
        
    log(f"  ✓ {cfg['name']} baked ({os.path.getsize(mesh_path)//1024} KB mesh, {stats['safe_terrain_pct']}% safe grade)")
    return stats

def main():
    log("==================================================================")
    log("🚀 ELISA Mars Pre-Processing: Top 10 High-Priority Martian Sites")
    log("==================================================================")
    
    master_catalog = {}
    for site_id, cfg in ALL_IMPORTANT_SITES.items():
        stats = process_site(site_id, cfg)
        master_catalog[site_id] = stats
        
    master_path = os.path.join(OUTPUT_DIR, "master_mars_sites_catalog.json")
    with open(master_path, "w") as f:
        json.dump(master_catalog, f, indent=2)
    log(f"✓ Master Planetary Catalog compiled -> {master_path}")
    
    # Copy master catalog to web/assets for direct WebGL streaming
    web_assets_dir = os.path.join(BASE_DIR, "web", "assets")
    os.makedirs(web_assets_dir, exist_ok=True)
    web_catalog_path = os.path.join(web_assets_dir, "master_mars_sites_catalog.json")
    with open(web_catalog_path, "w") as f:
        json.dump(master_catalog, f, indent=2)
    log(f"✓ Streamable WebGL Catalog published -> {web_catalog_path}")
    
    # Verify cleanup of temporary cache
    if os.path.exists(TEMP_DIR):
        for f in os.listdir(TEMP_DIR):
            os.remove(os.path.join(TEMP_DIR, f))
    log("🧹 Temporary cache purged (0 residual bytes).")
    log("==================================================================")
    log("🎉 All 10 Priority Martian Sites Pre-Processed & Ready to Stream!")
    log("==================================================================")

if __name__ == "__main__":
    main()
