# Gale: ten-kilometer-radius expansion

User requested **everything within 10 km of the existing Gale patch center**, not a 10-km-wide map. The center remains **4.9236258419°S, 138.3497866414°E**. This expands the original 1.55-km patch to a **20.04 × 20.04 km square**, including a small buffer around the full 10-km geodesic disk. Square corners extend beyond the requested disk.

## Data actually used

The preparation script queries only the Mars collections in the [USGS planetary STAC API](https://stac.astrogeology.usgs.gov/docs/data/mars/ctxdtms/). It uses four overlapping, geoid-adjusted **CTX 20-m DTMs** to fill missing observations and then overlays valid data from two HiRISE DTMs:

- `DTEEC_008437_1750_008938_1750_U01`: the full source strip from which the initial small patch was cropped.
- `DTEEC_016520_1750_016375_1750_A01`: a neighboring strip to the southeast. Its catalog URL omitted the observation-pair directory and returned 404. The corrected URL was verified with HTTP 200 and is recorded alongside the original catalog URL in the manifest.

Inside the requested 10-km disk, **29.4838% of prepared cells are attributed to HiRISE and 70.5162% to CTX**. **100% have valid source data.** The coverage image uses orange for HiRISE and blue for CTX. Source products contain their own processing and interpolation; this percentage describes attribution to those published products, not independent ground observations at every cell.

## Resolution, joins, and limitations

- Scientific mosaic: **20-m grid**, 1,003 × 1,003 cells. Sources are bilinearly reprojected into a local Mars equirectangular CRS with true scale at the center latitude. CTX fills holes first, then valid HiRISE samples replace CTX. There is no generated terrain fill and no vertical bias correction.
- Display and OBJ mesh: **40-m spacing**, 502 × 502 nodes. Sampling high-resolution HiRISE into this map does **not** make the whole region a 1-m model. The original small 6.07-m-spaced Gale mesh and its files remain in `data/verified_terrain/gale/`.
- This is a source-derived mosaic, not new photogrammetry or neural depth inference.
- Overlaps show median HiRISE-minus-previous-mosaic differences of approximately **51–52 m** and 95th-percentile absolute differences of approximately **75–81 m**. Heights remain unshifted. Source-control/datum differences can create seams and misleading slopes at product boundaries; these boundaries must not be treated as validated navigation hazards. Relative alignment and uncertainty modeling are further work.
- Fine data still uses elevation colors, not high-resolution photographic texture. The surrounding globe uses coarse MOLA data, and the outer visual collar/skirt is display geometry rather than measured terrain.

## Reproduce and inspect

```powershell
cd P:\Projects\Hackthon\Nasa\AresPath-AI
python pipeline/expand_gale.py
python pipeline/stitch_globe.py
node scripts/test_globe_math.mjs
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/web/index.html?site=gale`. Jezero stays as its original small patch. `stitch_globe.py` uses the expanded Gale mosaic when its completed manifest exists; if absent, it uses the original patch.

The output folder is `data/verified_terrain/gale-10km/`:

- `elevation.tif`: georeferenced, mixed-source 20-m heights.
- `source_index.tif`: source identifier for every native mosaic cell; look up identifiers in `manifest.json`.
- `grid.json` and `terrain.obj`: 40-m display/export mesh. OBJ is local east/up/south in meters; add `origin_elevation_m` to vertex Y to recover height above the source datum.
- `source_coverage.png`: attribution overview (orange HiRISE, blue CTX).
- `manifest.json`: source identifiers and URLs, prepared-window hashes, overlap differences, bounds, dimensions, coverage, checks, runtime, and output hashes.

Source windows and STAC records remain in `data/verified_sources/gale_context/`. Remote cloud-optimized GeoTIFFs are accessed with range requests; recorded hashes cover the prepared local windows, not the complete remote files. Unchanged prepared windows are reused. Missing or geometrically mismatched caches fail rather than silently substitute another location.

## Verification

The script checks every attributed native mosaic cell against the corresponding prepared source window, reopens the output raster to verify exact preservation, and refuses to claim completion if any requested-disk cell lacks a source. The globe preparation additionally verifies inverse-projection consistency, and JavaScript checks cover geographic placement, meter scale, valid terrain triangles, and the expanded extent. These establish implementation consistency, not independent accuracy of the input DTMs.
