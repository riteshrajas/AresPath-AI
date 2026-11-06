# Real-time sky

RT enables an offline-data sky refreshed once per minute using the computer's UTC
clock. Install backend requirements and run `python pipeline/prepare_sky.py`.
The archive downloads JPL DE440s, NAIF PCK00011, NAIF0012 leap seconds and NASA
HEASARC BSC5P stars brighter than magnitude 6. A manifest records URLs and kernel
SHA-256 hashes in `data/sky/`. Generated data stays gitignored.

The Sun is rendered as a disk with apparent size calculated from a solar radius
of 696,340 km and the ephemeris distance. Its glow is an illustrative exposure
effect. Terrain occludes the disk below the horizon; its direction also drives
the terrain sunlight.

The backend rotates J2000 catalog vectors into IAU_MARS using CSPICE, and obtains
light-time/stellar-aberration-corrected Sun and planetary barycenter directions
relative to the Mars barycenter. The globe stays in body-fixed coordinates;
the sky and sunlight rotate relative to it. Sky coordinates update in minute steps.
DE440s covers 1849–2150; kernel/time errors return an unavailable state.

This is an educational visualizer. Stellar proper motion, Mars surface parallax,
atmospheric dust/refraction, physical brightness/exposure, and Mars moons are not
modeled. Planet markers and labels are enlarged; they are not resolved planet
surfaces or physical angular diameters. Star visibility is enhanced, including in
daylight, as an educational overlay; the UI labels this exposure choice. The
terrain continues to occlude stars below its geometric horizon.

Sources:
- https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- https://heasarc.gsfc.nasa.gov/W3Browse/catalog/bsc5p.html
- NASA/JPL Horizons is also available as a live API at
  https://ssd-api.jpl.nasa.gov/doc/horizons.html; this implementation uses the
  downloadable kernels to avoid repeated network queries.
