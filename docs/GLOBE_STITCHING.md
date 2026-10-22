# Georeferenced Mars globe and HiRISE patches

The globe page now renders both scientific patches in the same planetary scene. **Mars**, **Jezero**, and **Gale** move the camera; they do not swap to unrelated local models. Patch centers come from the actual crop CRS and affine transform, not the rover landing locations:

| Patch | Planetocentric latitude | East longitude |
| --- | --- | --- |
| Jezero | 18.4268726388° | 77.4422140115° |
| Gale layered outcrop | −4.9236258419° | 138.3497866414° |

## Placement and data

- `pipeline/stitch_globe.py` inverse-projects every sampled vertex with Rasterio/GDAL, checks the inverse transform back to source XY, and exports compact longitude/latitude axes. Both source projections are equirectangular; separability is asserted before using the compact representation.
- The global backdrop uses the [MOLA MEGDR planetary radius product](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megr90n000cb.lbl). This is the actual 4-pixels/degree global data, not a high-resolution reconstruction. Its grid is 1,440 × 720; the globe geometry samples it on a 720 × 360 angular mesh.
- HiRISE elevation values are heights above an equipotential surface. The renderer adds the interpolated [MOLA areoid radius](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/mega90n000cb.lbl) at each coordinate to obtain a radial position. Both MOLA products store big-endian signed 16-bit values with a 3,396,000-meter offset; preparation validates their labels and exports little-endian arrays.
- Both globe and patch coordinates use the same planetocentric east-longitude frame and uniform scale, with 3,396 km represented by 280 scene units. Vertical exaggeration is **1×**. A local origin for each fine mesh preserves float precision.
- The renderer masks the coarse triangles beneath each patch. A narrow interpolated collar and a downward skirt cover the coarse-to-fine boundary. The collar joins to the actual rendered coarse triangle via ray/triangle intersection, not merely a sample from the source grid.

## Practical limits

The central HiRISE grid retains the source elevations. **The edge collar and skirt are display geometry, not measured terrain**, and are not exported back into the scientific rasters or meshes. The coarse MOLA grid contains interpolated bins and cannot support local route safety claims. The HiRISE Mars 2000 height datum is treated as compatible with the MOLA areoid; residual inter-product datum offsets have not been independently calibrated.

The global color map is the existing image asset; its registration has not been independently surveyed. Fine patches use **elevation colors**, not a high-resolution photographic texture. A soft inspection light makes each patch visible; lighting is illustrative, not a date-specific simulation of sunlight.

## Reproduce

Use Python dependencies from `pipeline/requirements-terrain.txt`. The browser source imports Three.js 0.173 from the local `node_modules`; if missing, install it in this existing repository with `npm install --no-save three@0.173.0`.

```powershell
cd P:\Projects\Hackthon\Nasa\AresPath-AI
python pipeline/verified_terrain.py --sites jezero gale
python pipeline/stitch_globe.py
node scripts/test_globe_math.mjs
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/web/index.html`. The `?site=jezero` and `?site=gale` query parameters open directly at a patch. Sources, SHA-256 values, placement coordinates, and projection check results are in `data/verified_terrain/globe/manifest.json`; a snapshot is kept in `docs/terrain_results/globe.json`. Data remains local and gitignored; the preparation scripts regenerate it.

## Checks

Projection checks recover the original map XY with errors under 0.001 m. JavaScript checks cover coordinate-axis orientation, meter scale, MOLA pixel centers, longitude wrap, pole clamping, missing-data triangles, geographic placement, and both 131,072-triangle scientific grids. These are numerical implementation checks, not independent surveys of source accuracy. Browser verification covers both patches, their camera transitions, and return to the global view.
