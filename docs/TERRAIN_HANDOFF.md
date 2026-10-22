# AresPath: Jezero + Gale terrain deliverable

Prepared October 21, 2026 (America/New_York). Target: before Friday October 23; exact team submission time was not specified. User approved Jezero and Gale and use of published elevation models.

## What actually works

The pipeline reads **published, stereo-derived HiRISE digital terrain models**, crops a small central window, retains the native elevation GeoTIFF, and triangulates a decimated grid into a 3D mesh. These heights are not generated from image brightness. No neural model or new raw-image photogrammetry ran for this deliverable.

| Result | Jezero patch | Gale layered-outcrop patch |
| --- | --- | --- |
| Footprint between mesh nodes | 1,550.84 × 1,550.84 m | 1,554.03 × 1,554.03 m |
| Mesh grid | 257 × 257 | 257 × 257 |
| Mesh spacing | 6.058 m | 6.070 m |
| Vertices / triangles | 66,049 / 131,072 | 66,049 / 131,072 |
| Elevation range, Mars datum | −2,592.73 to −2,544.20 m | −3,829.65 to −3,152.27 m |
| Source samples preserved in crop | Exact match | Exact match |

These are selected **patches within the named craters**, not complete crater reconstructions. Native source spacing is approximately 1.01 m; the mesh samples every sixth source pixel. Pixel spacing is not a claim of vertical accuracy.

## Algorithm

1. Download the identified PDS `.IMG` product with its attached scientific label. Preserve the source and record SHA-256.
2. Read the Mars coordinate reference system, affine transform, elevation values, and missing-data mask with Rasterio/GDAL.
3. Extract a central 1,537 × 1,537 native-pixel window. Reject insufficient valid coverage; never invent missing elevations.
4. Save the native window as a georeferenced elevation GeoTIFF with the source validity mask.
5. Select every sixth pixel for mesh vertices. For column `c`, row `r`, and source affine `T`, the projected coordinate is `T(c+0.5, r+0.5)`.
6. Build two triangles per four-node cell, omitting any triangle touching missing data. OBJ uses local east/up/south coordinates in meters. Add `origin_elevation_m` back to vertex Y to recover datum elevation; projected origin and CRS are in the manifest.
7. Compute geometric slope as `atan(sqrt((dz/dx)^2 + (dz/dy)^2))`, in degrees, using meter spacing and masking invalid neighbors. Decimation affects slope detail; this is not a certified hazard model.
8. Export JSON for the interactive viewer, an OBJ mesh, elevation-color PNG, and a run manifest containing sources, window, CRS, checksums, environment, command, limitations, and measured runtime.

## Reproduce in the repository

```powershell
cd P:\Projects\Hackthon\Nasa\AresPath-AI
python -m pip install -r pipeline/requirements-terrain.txt
python pipeline/verified_terrain.py --sites jezero gale
python -m unittest discover -s pipeline -p test_verified_terrain.py
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/web/verified-terrain.html`. This source viewer uses the repository's installed Three.js package. If npm dependencies are absent, use `npm ci` or use the portable viewer below.

Outputs are in `data/verified_terrain/{jezero,gale}/`. Source products remain in `data/verified_sources/` (about 720 MB total); data is gitignored. Re-running reuses those downloads. Large native rasters are not uploaded to GitHub.

## Portable viewer and team handoff

After generating both sites, run `node scripts/package_verified_terrain.mjs` from the repository. This bundles the existing Three.js dependency into `data/verified_terrain/viewer.js`; the accompanying `index.html` needs no npm installation or internet to view the generated terrain.

Extract `AresPath-Jezero-Gale-terrain.zip`, open a terminal in the extracted folder containing `index.html`, and run:

```powershell
python -m http.server 8766 --bind 127.0.0.1
```

Open `http://127.0.0.1:8766/`. Python is needed only to serve files; Blender or another OBJ viewer can open `jezero/terrain.obj` and `gale/terrain.obj` directly. Start with **1× vertical exaggeration**. The 3× and 5× options are display transformations only. Colors represent elevation, not photographic texture.

## Provenance

- Jezero: [HiRISE candidate landing-site DTM](https://www.uahirise.org/dtm/ESP_045994_1985), product `DTEEC_045994_1985_046060_1985_U01`, source observations `ESP_045994_1985` and `ESP_046060_1985`.
- Gale: [HiRISE layered-outcrop DTM](https://www.uahirise.org/dtm/PSP_008437_1750), product `DTEEC_008437_1750_008938_1750_U01`, source observations `PSP_008437_1750` and `PSP_008938_1750`.
- Credit: NASA/JPL-Caltech/University of Arizona; see the product labels for producer and datum details.
- For later original stereo reconstruction, follow the [NASA Ames Stereo Pipeline HiRISE workflow](https://stereopipeline.readthedocs.io/en/stable/examples/hirise.html). It requires appropriate EDR preparation and camera geometry; two arbitrary JPEGs do not suffice. That workflow has not been run here.

## Verification and limits

The pipeline reopens each written GeoTIFF and asserts exact equality of all valid source-window samples and preservation of the mask. Analytical unit tests cover zero slope, a known 45-degree plane with unequal X/Y spacing, and missing-data behavior. Both locations were rendered and switched in the browser; the mesh-edge checkbox was exercised. No frame-rate benchmark, independent terrain survey, rover navigation validation, or stereo-reconstruction evaluation was performed.

Existing `thor_satellite_to_terrain.py`, `yoko_multisite_pipeline.py`, the DepthPro placeholder server, and the procedural React terrain generator are **prototype paths** and are not evidence for this deliverable. In particular, the Thor script uses brightness filters and hard-coded model/hardware timings. The new verified viewer is separate so that those paths cannot be mistaken for its data sources.

Suggested team explanation: “I built a reproducible pipeline that converts published HiRISE stereo-derived elevation data into georeferenced terrain patches and browser-ready 3D meshes for Jezero and Gale. It preserves measured source values and provenance. Reconstruction from raw orbital stereo images is a future stage.”
