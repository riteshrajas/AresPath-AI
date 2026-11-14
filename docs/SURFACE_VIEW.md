# Surface 360°

Use the human icon on the right navigation panel, then click a point on Mars.
The full-screen popup loads terrain in every direction and reports completed
tile requests. Drag or use the arrow keys to look around; scroll to adjust the
field of view. Escape or **Back to map** restores the previous map view.
Escape also cancels point selection. Failed requests offer **Retry viewpoint**.

The viewpoint is 2.5 m vertically above the actual local terrain triangle.
A downward ray locates the land surface under the selected coordinates before
adding eye clearance; hills and crater floors both retain 2.5 m of clearance.
The innermost tile level
matches the selected source's prepared resolution, up to API level 18. Every
requested tile uses the API's maximum 129 × 129 grid. Nested windows extend
through level 8 (level 6 near the poles), with the global MOLA mesh providing
remaining distant context. Four concurrent requests limit network pressure.
Completion requires all planned tiles; missing detail is never reported as a
successful high-resolution load. Cancel aborts outstanding requests and frees
the view's geometry and materials. The globe geometry and color texture are
shared and retained.

This is an interactive DEM reconstruction, not a photographic panorama.
Prepared source resolution is displayed for the selected point; coverage and
resolution vary elsewhere. Denser interpolated samples do not add satellite
detail. The existing Mars color basemap supplies imagery; sky, lighting, and
material grading are illustrative. Map analysis filters remain unchanged on
return; the surface viewer uses natural imagery and terrain shading.

Surface viewing applies the existing Cinematic preset's exposure (1.1),
contrast (1.1), and saturation (0.9), restoring the map's grade on exit.
Directional terrain shadows provide the moving preview. A dedicated GPU
path tracer prepares a geometrically masked terrain scene with a worker-built
BVH, five light bounces, environment illumination, and up to 256 progressive
samples at full drawing-buffer resolution. Hold still to refine; looking
around, zooming, and resizing restart accumulation. The HUD reports actual
preparation/compilation/sample state and explicitly identifies raster fallback
if tracing fails. The Sun and sky remain illustrative and independent of RT.

The traced scene retains all source vertices in the innermost window; farther
windows use distance LOD (stride 2 then 4) to bound BVH memory. Parent terrain
is geometrically cut out behind child windows so invisible surfaces cannot
block rays or cast false shadows. Tracing uses camera-relative metre units
to preserve the 2.5 m eye clearance and avoid planet-scale float precision loss.

Validation: `npm test` includes source spacing, all-direction window coverage,
dateline nesting, polar bounds, resource limits, and invalid-resolution fallback.
