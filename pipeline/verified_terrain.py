"""Build small, traceable Mars meshes from published HiRISE DTMs.

This processes existing stereo-derived elevations; it does NOT reconstruct new
heights from photographs, run a neural network, or certify rover safety.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
SITES = {
    "jezero": {
        "name": "Jezero crater — candidate landing site patch",
        "source_page": "https://www.uahirise.org/dtm/ESP_045994_1985",
        "product": "DTEEC_045994_1985_046060_1985_U01",
        "stereo_observations": ["ESP_045994_1985", "ESP_046060_1985"],
        "url": "https://www.uahirise.org/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/DTEEC_045994_1985_046060_1985_U01.IMG",
    },
    "gale": {
        "name": "Gale crater — layered outcrop patch",
        "source_page": "https://www.uahirise.org/dtm/PSP_008437_1750",
        "product": "DTEEC_008437_1750_008938_1750_U01",
        "stereo_observations": ["PSP_008437_1750", "PSP_008938_1750"],
        "url": "https://www.uahirise.org/PDS/DTM/PSP/ORB_008400_008499/PSP_008437_1750_PSP_008938_1750/DTEEC_008437_1750_008938_1750_U01.IMG",
    },
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url, destination):
    """Keep source products; never silently substitute simulated input."""
    if destination.exists():
        return
    temporary = destination.with_suffix(".part")
    print(f"Downloading {destination.name}", flush=True)
    with requests.get(url, stream=True, timeout=(20, 90)) as response:
        response.raise_for_status()
        if response.status_code != 200:
            raise RuntimeError(f"Expected full product HTTP 200, got {response.status_code}")
        expected = int(response.headers.get("Content-Length", 0))
        written = 0
        with temporary.open("wb") as stream:
            for block in response.iter_content(1024 * 1024):
                stream.write(block)
                written += len(block)
        if expected and written != expected:
            raise RuntimeError(f"Incomplete download: {written}/{expected}")
    temporary.replace(destination)


def slope_degrees(elevation, valid, dx, dy):
    values = np.where(valid, elevation, np.nan).astype(np.float64)
    north_gradient, east_gradient = np.gradient(values, dy, dx)
    return np.degrees(np.arctan(np.hypot(east_gradient, north_gradient)))


def build(site, output_root, crop_pixels=1537, step=6):
    started = time.perf_counter()
    config = SITES[site]
    source_dir = ROOT / "data" / "verified_sources"
    source_dir.mkdir(parents=True, exist_ok=True)
    out = output_root / site
    out.mkdir(parents=True, exist_ok=True)
    source = source_dir / f"{config['product']}.IMG"
    download(config["url"], source)

    with rasterio.open(source) as dataset:
        if not dataset.crs or not dataset.crs.is_projected:
            raise ValueError("Expected projected Mars raster with meter coordinates")
        if dataset.crs.linear_units != "metre":
            raise ValueError(f"Unsupported coordinate units: {dataset.crs.linear_units}")
        if dataset.transform.b or dataset.transform.d:
            raise ValueError("Rotated grids require explicit resampling")
        size = min(crop_pixels, dataset.width, dataset.height)
        size = ((size - 1) // step) * step + 1
        if size < 3:
            raise ValueError("Crop is too small")
        row, col = (dataset.height - size) // 2, (dataset.width - size) // 2
        window = Window(col, row, size, size)
        native = dataset.read(1, window=window, masked=True)
        # ISIS/PDS special float values are extreme; additionally reject them
        # even if a driver fails to expose the source nodata value correctly.
        valid = ~np.ma.getmaskarray(native) & np.isfinite(native.data) & (np.abs(native.data) < 1e7)
        if valid.mean() < 0.5:
            raise ValueError("Central crop has <50% valid coverage; choose another window")
        affine = dataset.window_transform(window)
        profile = dict(driver="GTiff", width=size, height=size, count=1,
                       dtype="float32", crs=dataset.crs, transform=affine,
                       nodata=-99999.0, compress="deflate")
        with rasterio.open(out / "elevation.tif", "w", **profile) as target:
            target.write(np.where(valid, native.data, -99999).astype("float32"), 1)
            target.update_tags(source_url=config["url"], product=config["product"],
                               elevation_datum="Mars 2000 equipotential surface; see source PDS label",
                               processing="Native source window; no inferred elevations")
        source_crs = dataset.crs.to_wkt()
        source_dimensions = [dataset.width, dataset.height]

    z = np.asarray(native.data[::step, ::step], dtype=np.float64)
    mask = valid[::step, ::step]
    rows, cols = z.shape
    dx, dy = abs(affine.a) * step, abs(affine.e) * step
    slopes = slope_degrees(z, mask, dx, dy)
    origin_z = float(z[mask].min())
    origin_x, origin_y = affine * (0.5, 0.5)
    # OBJ: local east/up/south in meters; absolute elevation restored with origin_z.
    vertex_ids = np.zeros(z.shape, dtype=np.int64)
    vertex_ids[mask] = np.arange(1, int(mask.sum()) + 1)
    face_count = 0
    with (out / "terrain.obj").open("w", encoding="utf-8") as stream:
        stream.write(f"# {config['product']}; local east/up/south meters\n")
        stream.write(f"# absolute_elevation_m = vertex_y + {origin_z:.8f}\n")
        for y, x in zip(*np.nonzero(mask)):
            stream.write(f"v {x * dx:.6f} {z[y,x] - origin_z:.6f} {y * dy:.6f}\n")
        for y in range(rows - 1):
            for x in range(cols - 1):
                a, b, c, d = vertex_ids[y,x], vertex_ids[y+1,x], vertex_ids[y,x+1], vertex_ids[y+1,x+1]
                for triangle in ((a,b,c), (c,b,d)):
                    if all(triangle):
                        stream.write("f " + " ".join(map(str, triangle)) + "\n")
                        face_count += 1

    fraction = np.clip((z - origin_z) / max(float(z[mask].max() - origin_z), 1e-9), 0, 1)
    fraction = np.where(mask, fraction, 0)
    color = np.stack([90 + 150*fraction, 48 + 130*fraction, 32 + 105*fraction], axis=-1)
    color[~mask] = [12, 16, 25]
    Image.fromarray(color.astype(np.uint8)).save(out / "elevation_preview.png")

    grid = {
        "site": site, "name": config["name"], "rows": rows, "cols": cols,
        "spacing_x_m": dx, "spacing_y_m": dy, "origin_elevation_m": origin_z,
        "elevations_m": [round(float(v), 4) if ok else None for v, ok in zip(z.flat, mask.flat)],
        "source_page": config["source_page"],
    }
    (out / "grid.json").write_text(json.dumps(grid, allow_nan=False), encoding="utf-8")
    finite_slopes = slopes[np.isfinite(slopes) & mask]
    metadata = {
        **config, "site": site, "method": "Crop and mesh published stereo-derived HiRISE DTM; no new photogrammetry or ML",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "source_sha256": sha256(source), "source_dimensions_pixels": source_dimensions,
        "source_window_pixels": {"column": col, "row": row, "width": size, "height": size},
        "native_pixel_spacing_m": [abs(affine.a), abs(affine.e)],
        "crs_wkt": source_crs, "crop_affine": list(affine)[:6],
        "mesh_grid": [rows, cols], "mesh_step_source_pixels": step,
        "mesh_spacing_m": [dx, dy], "mesh_extent_between_nodes_m": [(cols-1)*dx, (rows-1)*dy],
        "origin_projected_easting_northing_m": [origin_x, origin_y],
        "origin_elevation_m": origin_z, "mesh_axes": "east, up, south; meters; vertical exaggeration 1",
        "elevation_datum": "Meters above Mars 2000 equipotential surface; source PDS IMAGE NOTE",
        "native_valid_fraction": float(valid.mean()), "mesh_valid_fraction": float(mask.mean()),
        "elevation_min_m": origin_z, "elevation_max_m": float(z[mask].max()),
        "slope_max_degrees_at_mesh_spacing": float(finite_slopes.max()) if finite_slopes.size else None,
        "vertices": int(mask.sum()), "triangles": face_count,
        "limitations": ["Small central patch, not entire crater", "Published DTM accuracy is not independently surveyed here",
                        "Mesh is decimated; fine hazards can be lost", "Elevation colors, not photographic texture",
                        "Slope is geometric only; no rover safety or soil-slip certification"],
        "runtime_seconds": round(time.perf_counter() - started, 3),
        "environment": {"python": sys.version, "platform": platform.platform(), "numpy": np.__version__, "rasterio": rasterio.__version__},
        "command": sys.argv,
    }
    # Verify the written scientific raster against exact source samples.
    with rasterio.open(out / "elevation.tif") as check:
        restored = check.read(1, masked=True)
        if not np.array_equal(restored.data[valid], native.data[valid]):
            raise AssertionError("GeoTIFF changed valid source elevation values")
        if not np.array_equal(~np.ma.getmaskarray(restored), valid):
            raise AssertionError("GeoTIFF changed source validity mask")
    metadata["verification"] = {"geotiff_exact_source_values": True, "geotiff_mask_preserved": True}
    metadata["outputs_sha256"] = {p.name: sha256(p) for p in out.iterdir() if p.name in
                                    ("elevation.tif", "grid.json", "terrain.obj", "elevation_preview.png")}
    (out / "manifest.json").write_text(json.dumps(metadata, indent=2, allow_nan=False), encoding="utf-8")
    print(f"{site}: {mask.sum()} vertices, {face_count} triangles, {dx:.3f} m spacing; verified exact source values", flush=True)
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sites", nargs="+", choices=SITES, default=list(SITES))
    parser.add_argument("--crop-pixels", type=int, default=1537)
    parser.add_argument("--step", type=int, default=6)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "verified_terrain")
    args = parser.parse_args()
    if args.step < 1 or args.crop_pixels < 3:
        parser.error("--step must be >=1 and --crop-pixels >=3")
    args.output.mkdir(parents=True, exist_ok=True)
    manifests = [build(site, args.output, args.crop_pixels, args.step) for site in args.sites]
    (args.output / "manifest.json").write_text(json.dumps(manifests, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
