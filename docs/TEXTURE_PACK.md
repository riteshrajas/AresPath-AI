# Mars texture pack

The texture pack is a display layer built from the verified terrain products.
For Gale, Jezero, and the 10 km Gale context, `pipeline/build_texture_pack.py`
generates:

- `height.png` — normalized source elevations;
- `normal.png` — normals calculated from the DEM gradients;
- `roughness.png` — a slope-informed display roughness map;
- `manifest.json` — source, range, pixel size, and limitations.

The existing Mars color basemap remains the albedo layer. The derived maps do
not create new photographic detail, and they should not be described as
HiRISE imagery. Generate a pack with, for example:

```powershell
python pipeline/build_texture_pack.py --site gale
```

The generated files are placed under `data/texture_packs/`, which is ignored
because texture products are derived artifacts. The next renderer step is to
load these maps for a selected regional window and keep the global basemap as
the fallback outside prepared coverage.
