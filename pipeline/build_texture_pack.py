"""Build display texture maps from a verified Mars elevation raster.

The pack deliberately keeps derived maps separate from photographic imagery:
height and normal maps are measured DEM derivatives, while the app's existing
Mars color basemap remains the albedo layer.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image


def save_gray(path: Path, values: np.ndarray) -> None:
    Image.fromarray(np.clip(values, 0, 65535).astype(np.uint16)).save(path)


def build(source: Path, output: Path, site: str) -> dict:
    with rasterio.open(source) as dataset:
        values = dataset.read(1, masked=True).filled(np.nan).astype(np.float32)
        nodata = ~np.isfinite(values)
        valid = values[~nodata]
        transform = dataset.transform

    output.mkdir(parents=True, exist_ok=True)
    low, high = float(valid.min()), float(valid.max())
    scale = max(high - low, 1e-6)
    normalized = np.nan_to_num((values - low) / scale, nan=0.0)
    save_gray(output / "height.png", normalized * 65535)

    pixel_x, pixel_y = abs(transform.a), abs(transform.e)
    gy, gx = np.gradient(np.nan_to_num(values, nan=float(np.nanmedian(valid))), pixel_y, pixel_x)
    nx, ny, nz = -gx, -gy, np.ones_like(values)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    normal[nodata] = (0.5, 0.5, 1.0)
    Image.fromarray(np.clip((normal * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), mode="RGB").save(output / "normal.png")

    slope = np.sqrt(gx * gx + gy * gy)
    roughness = np.clip(0.72 + 0.16 * (slope / (1.0 + slope)), 0.0, 1.0)
    roughness[nodata] = 0.72
    save_gray(output / "roughness.png", roughness * 65535)

    manifest = {
        "site": site,
        "source": str(source.as_posix()),
        "source_kind": "verified DEM derivative",
        "maps": {
            "height": "height.png",
            "normal": "normal.png",
            "roughness": "roughness.png",
            "albedo": "existing /api/v1/basemaps/mars-color"
        },
        "width": int(values.shape[1]),
        "height": int(values.shape[0]),
        "elevation_min_m": low,
        "elevation_max_m": high,
        "pixel_size": [pixel_x, pixel_y],
        "limitations": [
            "Normal and roughness maps are derived display products, not new measurements",
            "The existing color basemap is the albedo layer and can remain blurry at close range",
            "No synthetic photographic texture is presented as satellite imagery"
        ]
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", choices=("gale", "jezero", "gale-10km"), required=True)
    parser.add_argument("--source-root", type=Path, default=Path("data/verified_terrain"))
    parser.add_argument("--output-root", type=Path, default=Path("data/texture_packs"))
    args = parser.parse_args()
    manifest = build(args.source_root / args.site / "elevation.tif", args.output_root / args.site, args.site)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
