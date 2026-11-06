# Terrain realism and lighting

The globe uses one rasterized scene for terrain, sky sprites and sunlight. The
Terrain lighting button (on by default) adds local ambient occlusion, angled
exploration lighting, and terrain-cast shadows to loaded surface grids. It replaces the former progressive Ray trace mode.

On each grid arrival, eight directions at three neighbour distances estimate how
much nearby terrain blocks ambient light. The result is stored per vertex and
only modulates indirect diffuse light; direct sunlight still follows mesh normals.
Display collars fade to unoccluded shading at their outer edge. Heights and source
rasters are unchanged. Ambient occlusion adds no render passes. A separate 2048-square filtered sunlight
shadow map (1024 in Turbo) renders the fine terrain only when geometry, focus, zoom
or Sun direction changes. It stays cached during stationary views and ordinary
orbiting at the same focus and zoom. Context receives shadows without casting its
fragment-masked parent through the fine grid. There is no progressive accumulation
or duplicate scene.

Normal exploration uses illustrative angled lighting relative to the selected
surface, with reduced ambient and camera fill so relief stays visible even on the
night side of the default globe. RT mode retains the catalog Sun direction and
its existing ambient level; real nighttime terrain can consequently remain dark.
The toggle restores the original lighting and disables casting and receiving.
The orbital globe retains ordinary material lighting. Shadows cover the local fine
grid, not the whole planet or distant context; reflections and multi-bounce global
illumination are not simulated. Terrain arrivals still incur bounded
CPU work (up to 24 neighbour checks per grid vertex).

Turbo close-up terrain (LOD 9+) now requests 129x129 elevation samples per tile,
doubling mesh density in each axis over 65x65. Heights retain the existing source
selection and display interpolation; denser sampling does not create new measured
detail where the underlying DEM is coarse. Distant context stays at 33x33.

No atmosphere, subsurface scattering, dust weather or photometric calibration is
claimed. The orthoimage already contains lighting/shadow information from its
acquisition time, so combining it with new lighting is not a calibrated relighting
of surface albedo. Existing coarse/fine height discontinuities can remain.

Prepare: `python pipeline/prepare_olympus_detail.py`. The script queries the USGS
Mars HiRISE collection, saves the STAC record, crops native DTM cells and resamples
the paired ortho onto the same projection/grid. Scientific elevation raster is
2049² at ~1.034 m; display mesh is 257² at ~8.27 m. The fine crop is also registered
with the globe's existing finer-source priority and masking. Source URL, spacing,
valid fraction, and checksum are retained in its manifest. Other areas keep their
prior datasets; the crop is not the Olympus summit or full volcano.

Source: DTEEC_001432_2015_001630_2015_U01, HiRISE observations PSP_001432_2015 /
PSP_001630_2015, distributed through USGS Astrogeology STAC.
