# Cinematic Replay

After computing a route, use **Cinematic Replay** on a ready route card. It
prepares that route's complete display corridor before playback, then follows
the route from start to destination with letterboxing, pause/resume, a scrubber,
0.5×/1×/2× speed and Stop. Escape stops; hiding the tab pauses playback. Ending
or stopping leaves the camera at the current route position and restores normal
exploration controls and the previous pixel ratio.

## Preparation

The replay checks the current terrain revision against the route result and
rejects stale results. It selects tile zoom from the selected route's best
prepared source resolution (capped at the existing API's zoom 18). Every tile
uses the API's maximum 129×129 grid and native sampling, even in Turbo mode.
The entire route is traversed in planning; neighboring 3×3 tile windows cover
the camera's footprint, and tile requests are deduplicated across windows. At
close detail, a wider 65×65-tile context mesh is also prepared. Fine display
collars join that context instead of creating a steep rim against coarse MOLA.

Elevation tiles are loaded with three concurrent requests into an ephemeral
IndexedDB database. Each window is assembled and processed by a Web Worker:
positions, UVs, vertex colors, normals, local ambient shading and display collars
are computed before playback. Prepared mesh buffers and terrain samples are
stored in the same database. Only the current terrain section resides on the
GPU. Playback buffers when moving to a section from disk rather than advancing
the camera through missing terrain. Scrubbing uses the same prepared sections.

Progress reports real loaded tiles/cells and computed sections. Preparation
does not freeze the navigation controls; playback takes control of the camera.
Changing route inputs, selecting another route or using normal fly-to search
cancels a pending/active replay. Cancellation aborts network work, terminates the
worker, closes and deletes its cache, and disposes superseded mesh buffers.
Failed preparation reports the error without starting a partial replay.

## Quality and limits

This is an interactive replay, not video export. Rendering uses the viewport's
native dimensions at up to 2× device pixel ratio and restores previous settings
afterward. The 8K Mars basemap remains the imagery source; no photographic detail
is synthesized. Native DEM coverage, resolution and accuracy still vary. The
HUD identifies source resolution; oversampling coarse sources does not create
new measured detail. This prepares every requested **display-grid cell in the
route corridor**, not every original raster cell across Mars.

The camera follows the actual ordered route by distance. It looks ahead along
the route and samples prepared terrain under the camera to maintain clearance.
Altitude scales with source resolution. Playback is cinematic speed (25–150 s
at 1× depending on route length/resolution), not predicted rover travel time.
During cinematic draws, scene/camera coordinates are temporarily rebased to
the camera to preserve fine shadow precision; navigation coordinates are restored
after rendering, including when a draw fails.
Planetary wrapping is handled without taking the long path at the dateline.

Storage estimates are checked before processing. At most 512 unique sections
and 2048 tiles are allowed; larger jobs require shorter legs. Full-route HD mesh
caching can use substantial disk space. IndexedDB is required; blocked/quota-
exhausted storage produces an explicit error rather than silently reducing detail.
Normal completion/cancellation deletes the temporary database. A browser crash
or forced shutdown may leave a cache that can be removed through site storage.

Relevant modules: `cinematic-path.js` (path/corridor), `cinematic-worker.js` and
`cinematic-geometry.js` (cell processing), `cinematic-cache.js` (temporary disk
cache), `cinematic-replay.js` (preparation lifecycle, timeline and camera).
