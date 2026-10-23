# Global 200 m elevation layer

The new source is the **USGS HRSC/MOLA Blended DEM, global 200 m v2**,
Fergason, Hare and Laura (2018). The [USGS foundational data inventory](https://fdp.astrogeology.usgs.gov/fdp/mars/)
lists it as a global elevation product. See the [product metadata](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m)
and [original GeoTIFF](https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif).
Retain the upstream NASA/MGS MOLA and ESA/Mars Express HRSC attribution and reuse
terms when distributing the dataset; this repository does not relicense it.

This is a published blend of stereo-derived HRSC elevations and laser-altimetry
MOLA data. Its 200 m grid does **not** imply uniform 200 m HRSC stereo detail or
HiRISE coverage. There is no per-cell instrument provenance mask in this integration.
No imagery-to-height estimation, generated relief or new stereo reconstruction runs.

## Prepare

From the repository root:

```powershell
python -m pip install -r pipeline/requirements-terrain.txt
python pipeline/prepare_global_terrain.py
```

The source is 11,384,463,908 bytes, 106,694 columns by 53,347 rows, signed int16
meters with -32768 nodata. The original GeoTIFF is uncompressed and row-striped,
with no overviews. This pipeline downloads it once for local sampling rather than
making a series of large remote row reads during user navigation.

Downloads use six workers and 32 MiB HTTP ranges. Each response must match its
requested range, byte count and pinned source ETag. Per-range SHA-256 values and
completion are recorded in `data/verified_terrain/global-200m/download.json`.
Interrupted runs recheck completed ranges from disk before resuming. A partial
file is never registered as a usable dataset.

After download, the entire file is hashed and every raster cell is scanned in
bounded-memory strips for coverage and plausible elevations. Only then is the
scientific manifest published. Restart the API after preparation and reload the
frontend to clear old cached revisions. The generated scientific manifest and a
small tracked results snapshot record actual counts, min/max, source ETag and hash.
The multi-gigabyte raster remains gitignored; a fresh checkout must prepare it.

## Runtime behavior

`backend/catalog.json` gives source ID 5 to `HRSC/MOLA`. It is sampled after the
coarse 4-pixels/degree MOLA fallback and before the existing Gale CTX/HiRISE and
original fine Jezero/Gale crops. Valid finer cells retain priority. A global
[-180,-90,180,90] lookup extent is declared explicitly so longitude normalization
does not collapse a full-world footprint to a zero-width line.

The API returns unmodified nearest native elevation cells. The existing areoid
grid supplies the elevation-to-radius conversion. Small source-grid edge gaps
(including the extreme south-polar boundary) keep explicit coarse-MOLA attribution.
The catalog identifies an unavailable global layer if its raster or manifest is
absent. The application does not claim new detail from an incomplete download.

The orbital context mesh remains coarse MOLA. When a location is selected, the
globe's zoom-driven tile window uses the new global layer, including areas outside
Jezero/Gale. The globe and terrain windows share the existing basemap and a
display-only color grade; this does not make the imagery calibrated true color.
The API and tile explorer expose source provenance and resolution. The product is
`HRSC/MOLA`, not HiRISE, and coarse-MOLA fallback remains explicitly attributed.

## Coverage and limits

A USGS STAC lookup in a 0.1-degree box around the user's previously selected
location (11.692614 degrees west, 50.495743 degrees south) returned zero products
from both `mro_ctx_controlled_usgs_dtms` and `mro_hirise_socet_dtms` during this work.
This does not establish absence from every other archive; it establishes absence
from those queried catalogs/footprints. The global blend is the new layer there.

The data is real global terrain on a denser grid, not a global meter-resolution
survey. Fine HiRISE/CTX data remains limited to prepared regions. No additional
photographic basemap was ingested. Existing color imagery can remain blurry close
to the surface. Vertical source harmonization, scientific datum calibration,
seam-free transitions, a planetary quadtree and cloud deployment remain unfinished.

## Verified result

The real preparation run finished in 411.0 seconds. All 340 HTTP ranges completed;
5,691,764,861 of 5,691,804,818 raster cells are valid (39,957 nodata cells).
The valid elevation range is -8,528 to 21,226 m. The downloaded file SHA-256 is
`e8bfe4c3b9dee9d5fdb8c4d49798869654e552e7b154712c9e12d6d117464419`.
The [tracked manifest](terrain_results/global_200m.json) records the source revision.

Five cells, spread across the prior selected point, the equator, Olympus Mons,
Gale and Jezero, were independently read from the official remote raster and
matched the downloaded local values exactly. See [sample results](terrain_results/global_200m_samples.json).
At 50.495743 S, 11.692614 W the new native sample is 1,436 m; the live coverage
API now selects `HRSC/MOLA`, source ID 5. Gale and Jezero point checks still select
their finer HiRISE crops, and the south pole explicitly retains coarse MOLA.
Seven backend tests and six frontend tests passed, and the production build passed
with the existing shared Three.js chunk-size warning.

Activation exposed a stale browser HTTP-cache case: tile URLs were unchanged while
cached responses were fresh for an hour. The client now revalidates JSON requests
with `cache: 'no-cache'`, allowing the API's revision ETag to select the new data.
The separate bounded in-session tile cache still reuses completed responses; reload
the page after ingestion/API restart. A live 9-tile assembled window at the previous
selected location contained 37,249 finite nodes, all source ID 5, with native sampled
heights spanning 1,293–1,750 m.
