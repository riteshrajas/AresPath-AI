# 🛰️ Global Martian Satellite & Mission Inventory

A complete, exhaustive catalog of all operational and historic Martian orbiters, landers, and rovers across international space agencies (**NASA, ESA, ISRO, CNSA, Roscosmos, and UAESA/MBRSC**), detailing their scientific payloads, spatial resolutions, spectral bands, and utility for the **AresPath AI** navigation engine.

---

## 🇺🇸 1. NASA (National Aeronautics and Space Administration)

### A. Active & Historic Orbiters

#### 1. Mars Reconnaissance Orbiter (MRO) — *Launched: 2005 | Active*
* **Orbit:** Sun-synchronous, ~250–320 km circular polar orbit.
* **Instruments & Sensors:**
  * **HiRISE (High Resolution Imaging Science Experiment):**
    * *Resolution:* **0.25 to 0.50 meters/pixel** (The gold standard for planetary optical reconnaissance).
    * *Swath:* 6 km width from 300 km altitude.
    * *Bands:* Red (570–830 nm), Blue-Green (400–600 nm), Near-IR (780–1000 nm).
    * *Stereo Capability:* Yields **1.0–2.0 m/pixel Digital Terrain Models (DTMs)** via stereo photogrammetry.
    * *AresPath Value:* Micro-hazard detection (boulders $> 0.5$ m, small fractures, rover wheel traps).
  * **CTX (Context Camera):**
    * *Resolution:* **6.0 meters/pixel**.
    * *Swath:* 30 km wide context strips.
    * *Coverage:* Over **99.7% of the entire Martian surface**.
    * *Stereo Capability:* Yields **18–20 m/pixel regional DTMs**.
    * *AresPath Value:* Regional macro-routing and seamless high-res base map tiling.
  * **CRISM (Compact Reconnaissance Imaging Spectrometer for Mars):**
    * *Resolution:* 18–36 m/pixel in targeted mode; hyperspectral (544 channels, 362–3920 nm).
    * *AresPath Value:* Locates surface resources (hydrated phyllosilicates, sulfates, water-ice signatures).
  * **SHARAD (Shallow Radar):**
    * *Depth Penetration:* Up to 1 km into the Martian regolith with 15-meter vertical resolution.
    * *Frequency:* 15–25 MHz chirp.
    * *AresPath Value:* Detection of subsurface glacial sheets and buried ice reserves.
  * **MCS (Mars Climate Sounder):**
    * *Bands:* 9 channels (visible to far-IR: 0.3–50 $\mu$m).
    * *Measurements:* Vertical profiles of temperature, dust opacity, water ice clouds up to 80 km.
    * *AresPath Value:* Regional atmospheric density and dust storm tracking.

#### 2. Mars Odyssey (2001 Mars Odyssey) — *Launched: 2001 | Active (Longest operating Mars spacecraft)*
* **Orbit:** ~400 km sun-synchronous circular orbit.
* **Instruments & Sensors:**
  * **THEMIS (Thermal Emission Imaging System):**
    * *Visible Resolution:* 18 meters/pixel (5 spectral bands).
    * *Infrared Resolution:* **100 meters/pixel (9 thermal IR bands: 6.8–14.9 $\mu$m)**.
    * *AresPath Value:* **Thermal Inertia Mapping.** High thermal inertia = exposed solid bedrock (safe, load-bearing); low thermal inertia = fine, unconsolidated dust drifts (slippage hazard / rover sinkage risk).
  * **GRS (Gamma Ray Spectrometer Suite / HEND / NS):**
    * *Measurements:* Global subsurface hydrogen distribution (proxy for water ice in top 1 meter).
    * *AresPath Value:* Resource extraction targeting for long-duration habitat life support.

#### 3. Mars Global Surveyor (MGS) — *Operated: 1996–2006*
* **Instruments & Sensors:**
  * **MOLA (Mars Orbiter Laser Altimeter):**
    * *Measurements:* Over 640 million individual laser range measurements (1064 nm Nd:YAG laser, 10 Hz pulse).
    * *Vertical Accuracy:* **$< 1$ meter absolute vertical precision**.
    * *Spatial Grid:* Global digital elevation model at **128 pixels/degree (~463 meters/pixel)** at the equator.
    * *AresPath Value:* The universally recognized baseline datum for global Mars elevations (Areoid reference frame).
  * **MOC (Mars Orbiter Camera):** Narrow-Angle (1.5 m/px) and Wide-Angle global mosaics.
  * **TES (Thermal Emission Spectrometer):** Mineralogy and atmospheric dust opacity baseline.

#### 4. MAVEN (Mars Atmosphere and Volatile EvolutioN) — *Launched: 2013 | Active*
* **Orbit:** Highly elliptical (150 km periapsis to 6,200 km apoapsis).
* **Instruments & Sensors:**
  * **SWEA, SWIA, STATIC, MAG:** Solar wind ion interactions, magnetic field topology, upper atmospheric ion escape.
  * **AresPath Value:* Space weather monitoring (solar energetic particle events / coronal mass ejections) to issue astronaut radiation shelter alerts.

---

### B. Surface Landers & Rovers

#### 1. Mars 2020: Perseverance Rover & Ingenuity Helicopter — *Landed: Feb 2021 | Active @ Jezero Crater*
* **Instruments & Sensors:**
  * **MEDA (Mars Environmental Dynamics Analyzer):**
    * *Sensors:* Air temperature, ground surface temperature, atmospheric pressure (0.1 Pa precision), relative humidity, wind speed & direction (2D booms), solar radiation (Radiation and Dust Sensor — RDS).
    * *Cadence:* Records continuous meteorological telemetry 24 hours/sol.
    * *AresPath Value:* Ground-truth microclimate inputs for EVA operational planning.
  * **Mastcam-Z & Navcams:** Dual stereoscopic zoom cameras (sub-millimeter resolution up close; panoramic stereo pairs for terrain mesh reconstruction).
  * **SuperCam:** Remote micro-imaging (RMI) + Raman/LIBS spectroscopy for mineral identification.
  * **RIMFAX (Radar Imager for Mars' Subsurface Experiment):** Ground-penetrating radar (150–1200 MHz) probing 10+ meters deep.
  * **Ingenuity Telemetry:** Aerial orthomosaics and obstacle maps from 5–20 m flight altitude.

#### 2. Mars Science Laboratory: Curiosity Rover — *Landed: Aug 2012 | Active @ Gale Crater*
* **Instruments & Sensors:**
  * **REMS (Rover Environmental Monitoring Station):** Continuous surface pressure, temperature, wind, and UV radiation flux.
  * **Hazcams & Navcams:** 1024x1024 black-and-white stereo pairs capturing immediate 3D terrain geometry and wheel slippage dynamics.
  * **DAN (Dynamic Albedo of Neutrons):** Pulsed neutron generator detecting hydrogen/water within 1 meter beneath the wheels.

#### 3. InSight Lander — *Operated: 2018–2022 @ Elysium Planitia*
* **Instruments:**
  * **TWINS (Temperature and Wind for InSight):** High-frequency wind and air temperature monitoring.
  * **SEIS (Seismic Experiment for Interior Structure):** Marsquake catalog (identifies active tectonic faults and subsurface stability).

#### 4. Historic Ground Truth:
* **Spirit (MER-A) & Opportunity (MER-B):** Microscopic Imagers, Pancams, Navcams over 45+ km of Martian driving, establishing wheel slip mechanics in duricrust and dune ripples.
* **Viking Landers 1 & 2 (1976):** First in-situ surface pressure curves and atmospheric baseline.

---

## 🇪🇺 2. ESA (European Space Agency)

### 1. Mars Express (MEX) — *Launched: 2003 | Active*
* **Orbit:** Polar elliptical orbit (~300 km periapsis to 10,000 km apoapsis).
* **Instruments & Sensors:**
  * **HRSC (High Resolution Stereo Camera):**
    * *Resolution:* **10 to 12.5 meters/pixel optical imagery; 50 meters/pixel DTMs**.
    * *Optics:* 9 CCD line sensors aligned at different viewing angles (stereo, color, photometry in a single pass).
    * *Coverage:* Over **85% of Mars covered in full 3D stereo elevation**.
    * *AresPath Value:* The premier bridge between global MOLA altimetry (~463 m) and localized HiRISE DTMs (~1 m).
  * **OMEGA (Visible and Infrared Mineralogical Mapping Spectrometer):** Global maps of hydrated minerals and CO₂/H₂O ice caps.
  * **MARSIS (Sub-Surface Sounding Radar/Altimeter):** Detected putative subglacial liquid water lakes beneath the South Polar Layered Deposits (SPLD).

### 2. ExoMars Trace Gas Orbiter (TGO) — *Launched: 2016 | Active*
* **Orbit:** ~400 km circular orbit.
* **Instruments & Sensors:**
  * **CaSSIS (Colour and Stereo Surface Imaging System):**
    * *Resolution:* **4.6 meters/pixel in full color stereo**.
    * *Mechanism:* Rapid rotation mechanism allows taking forward and backward stereo images during a single orbital pass.
    * *AresPath Value:* Superb multi-spectral color texture mapping and slope evaluation.
  * **NOMAD & ACS:** High-precision atmospheric spectrometers measuring trace gases (methane, ozone, water vapor isotopes).
  * **FREND (Fine Resolution Epithermal Neutron Detector):** Subsurface hydrogen mapping at ~10-fold higher spatial resolution than Odyssey GRS.

---

## 🇮🇳 3. ISRO (Indian Space Research Organisation)

### 1. Mars Orbiter Mission (MOM / Mangalyaan-1) — *Operated: 2013–2022*
* **Orbit:** Highly elliptical (421 km x 76,993 km).
* **Instruments & Sensors:**
  * **MCC (Mars Colour Camera):**
    * *Optics:* Tri-color Bayer pattern CCD camera.
    * *Resolution:* 19.5 meters/pixel at periapsis to 4 km/pixel at apoapsis.
    * *Unique Advantage:* Due to its high elliptical orbit, MCC captured **full-disk synoptic color images of Mars**, tracking global dust storm genesis, regional dust front propagation, and seasonal polar ice cap recession.
  * **TIS (Thermal Infrared Spectrometer):** Measures thermal emissions to calculate surface composition and thermal inertia.
  * **MSM (Methane Sensor for Mars):** Differential radiometer tracking column-averaged methane.
  * **LAP (Lyman Alpha Photometer):** Upper atmospheric deuterium/hydrogen ratio measurements.
  * *AresPath Value:* Global synoptic weather modeling and macro-scale dust storm warning feeds.

---

## 🇨🇳 4. CNSA (China National Space Administration)

### 1. Tianwen-1 Orbiter & Zhurong Rover — *Arrived: Feb 2021 | Active / Hibernated @ Utopia Planitia*
* **Orbiter Instruments:**
  * **HiRIC (High Resolution Imaging Camera):**
    * *Resolution:* **0.5 meters/pixel in panchromatic mode**; 2.0 m/pixel in color from 265 km orbit.
    * *Capability:* High-resolution stereo imaging comparable to NASA's HiRISE.
  * **MoRIC (Moderate Resolution Imaging Camera):** 100 m/pixel global color context imaging.
  * **MOSIR (Mars Subsurface Exploration Radar):** Dual-frequency radar mapping subsurface structures up to 100 meters deep.
  * **MMS (Mars Mineralogical Spectrometer):** Hyperspectral visible/near-IR mineral mapping.
* **Zhurong Rover Instruments:**
  * **NaTeCam (Navigation and Terrain Camera):** Stereo 3D point cloud generation of Martian terrain at centimeter precision.
  * **RoPeR (Subsurface Penetrating Radar):** 15–35 MHz and 350–840 MHz radar probing Utopia Planitia sediment layers.
  * **MCS (Mars Climate Station):** Air temperature, pressure, wind velocity, and acoustic sound telemetry.
  * *AresPath Value:* Alternative source of sub-meter orbital imagery (HiRIC) and unique northern lowland surface ground truth.

---

## 🇦🇪 5. UAESA & MBRSC (United Arab Emirates Space Agency)

### 1. Emirates Mars Mission (Hope Probe / Al-Amal) — *Arrived: Feb 2021 | Active*
* **Orbit:** Unique high-altitude elliptical orbit (20,000 km x 43,000 km, 55-hour period).
* **Instruments & Sensors:**
  * **EXI (Emirates eXploration Imager):**
    * *Optics:* 12-megapixel multi-band camera with 6 UV/visible spectral filters.
    * *Resolution:* 2 to 4 km/pixel covering the **entire planetary disk**.
    * *AresPath Value:* Diurnal atmospheric dynamics: tracks water-ice clouds, ozone variations, and dust opacity transitions **across the entire planet every 12 days at all times of day**.
  * **EMIRS (Emirates Mars Infrared Spectrometer):**
    * *Measurements:* Thermal IR spectra (6–40 $\mu$m) measuring vertical temperature profiles, surface temperature, and optical depth of water ice and dust.
  * **EMUS (Emirates Mars Ultraviolet Spectrometer):** Thermospheric oxygen, carbon monoxide, and hydrogen dissipation.

---

## 🇷🇺 6. Roscosmos (State Space Corporation Roscosmos)

### 1. Collaborative ExoMars TGO Payloads & Historical Missions
* **ACS (Atmospheric Chemistry Suite):** Russian-built infrared spectrometers on ESA's TGO measuring atmospheric structure, CO₂ isotopes, and aerosols.
* **FREND (Fine Resolution Epithermal Neutron Detector):** Russian collimated neutron detector on TGO mapping hydrogen distribution down to 1 meter depth at 60 km spatial resolution (revealing high-water-content zones in Valles Marineris).
* **Historical Data (Mars-3, Mars-5, Phobos-2):** Archival baseline measurements in the Russian Academy of Sciences Space Research Institute (IKI) archives.

---

## 📊 Planetary Data Comparison Matrix for AresPath AI

| Agency | Orbiter / Rover | Instrument | Spatial Resolution | Primary Output | AresPath AI Core Function |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **NASA** | MRO | **HiRISE** | **0.25 – 0.5 m/px** | Panchromatic / Stereo DTM | Micro-obstacle detection, boulder fields, slope breaks |
| **NASA** | MRO | **CTX** | **6.0 m/px** | Context Grayscale | Regional terrain basemap, 99.7% Mars coverage |
| **NASA** | Odyssey | **THEMIS** | **100 m/px (IR)** | Thermal Inertia Map | Bedrock vs loose sand/dust drift classification |
| **NASA** | MGS | **MOLA** | **~463 m/px** | Laser Altimetry DEM | Absolute elevation datum & planetary geoid anchor |
| **NASA** | Perseverance | **MEDA** | Ground station | 24/7 Atmospheric Telemetry | Live pressure, temp, wind, UV & dust opacity (tau) |
| **ESA** | Mars Express | **HRSC** | **12.5 m (50 m DEM)** | 3D Color Topography | High-coverage regional 3D meshes (85% of planet) |
| **ESA** | ExoMars TGO | **CaSSIS** | **4.6 m/px** | Color Stereo | Multi-spectral geologic features, fresh impact hazards |
| **ISRO** | MOM (Mangalyaan) | **MCC** | 19.5 m to 4 km | Synoptic Color Disk | Global dust storm tracking, regional weather fronts |
| **CNSA** | Tianwen-1 | **HiRIC** | **0.5 m/px** | Sub-meter Panchromatic | Alternative sub-meter optical verification |
| **UAESA**| Hope Probe | **EXI / EMIRS** | 2 – 4 km | Diurnal Global Weather | Full-planet diurnal temperature & dust cycle maps |
