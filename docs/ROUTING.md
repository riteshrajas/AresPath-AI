# Terrain route planner

Open **Routes**. Choose Start and Destination by typing a landmark and selecting
a result, or aim at the surface and use each endpoint's crosshair button. The
crosshair selection uses the terrain mesh focus raycast. A sky-facing view cannot
be selected. Swapping endpoints or editing inputs invalidates old routes.

Choose Standard or Detailed analysis and an optional lower maximum slope, then
Analyze terrain & compare routes. The backend queues a real terrain job, samples
the prepared elevation rasters, computes slopes/local relief, and runs three A*
searches. Progress stages and explored cell counts come from the computation.
No artificial delays, mock progress, straight-line fallback or invented routes
are used. Cancel and input changes request server cancellation. A late completion
from a previous request cannot replace newer UI state.

## Strategies

All profiles use eight-neighbor graph search with a ground-distance heuristic.
Step cost is three-dimensional edge distance times a nonnegative terrain cost.
Safest weights normalized slope squared by 16 and local relief/edge distance by
18; Balanced uses 4 and 5; Shortest uses 0 and 0. Maximum slope caps are 12°, 20°,
25° respectively, further lowered by the user's maximum. These are illustrative
planning settings, not a validated rover mobility model. Slope is checked both
at cells and across each edge; diagonal corner cutting is forbidden.

Profiles optimize separately. A profile can report no route while another
succeeds. Identical paths are explicitly marked; the system does not perturb a
route to pretend there are three different corridors. Select a ready result to
display its colored path, and View route area to move the camera to its region.

## Data and limits

The planner samples `TerrainStore.sample` using native regional raster cells and
the existing global MOLA interpolation fallback. It never plans on the artistic
display geometry, vertex colors or procedural texture. It records source IDs,
terrain revision and prepared source resolutions in the result. Edges crossing
source IDs are blocked because inter-product vertical offsets are uncorrected.
This conservative rule can prevent trips across prepared coverage boundaries.

A regional equirectangular coordinate frame unwraps longitude across the
antimeridian. Legs must be between 10 m and 1500 km and endpoints between 84° S
and N; a corridor reaching beyond 85° is rejected. Longer trips need intermediate
stops. Distances are approximate within this regional metric projection, not a
globally optimal geodesic solution. Search margins extend 30% of endpoint
distance (at least 200 m). An unavailable route only applies to that corridor,
grid and slope constraint, not to the whole planet.

Standard spacing is at least 10 m with up to roughly 60,000 cells; Detailed at
least 2 m and roughly 210,000 cells. Large corridors increase grid spacing. Exact
endpoints are included as grid nodes. Denser sampling does not recover finer
source observations. Local relief is the absolute difference from the 3×3
neighbor mean, not a measured rock height. Unknown rocks, sand, soil strength,
wheel traps and hazards below source/grid spacing are not modeled. No travel
time, energy budget or verified rover safety is claimed.

Route points retain [east longitude, planetocentric latitude, planetary radius
in meters]. Lines are lifted slightly for visibility and are not a wheel-level
trajectory. The selected route is drawn by default; Filters can also show all
alternatives (even if single-route paths are toggled off), endpoint/distance
markers, direction arrows, the analyzed corridor, and a scrubbable elevation
profile. Swapping profiles updates the overlays without recomputation. Display
thresholds never change planner constraints. The API returns `heights_m` aligned
with `points` for source-datum elevation profiles, `profileAt` interpolates
distance, height and geographic coordinates along the route, and corridor bounds
use unwrapped longitudes at the antimeridian. UI materials/geometries are disposed
when routes are cleared. The route planner remains independent of camera fly-to
search.

## API and lifecycle

* `POST /api/v1/routes` — start a job; returns 202 and an ID.
* `GET /api/v1/routes/{id}` — queued/processing/complete/failed/canceled status,
  stage progress and (when complete) results.
* `DELETE /api/v1/routes/{id}` — request cooperative cancellation.

One worker processes jobs to bound CPU and raster I/O. At most three jobs can be
queued/processing. Completed jobs expire after 30 minutes on new submissions;
at most 20 jobs are retained. Results are in process memory and disappear on API
restart. Run one API process for this local job model; multiple worker processes
would require a shared durable queue/result store. The UI polls every 800 ms and
reports unavailable API/restarts instead of leaving indefinite fake progress.

Tests cover risk/distance tradeoffs, no-corner-cutting, source seams, cancellation,
API validation, exact endpoints, antimeridian planning and coincident profiles.
