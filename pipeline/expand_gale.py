"""Mosaic real HiRISE/CTX elevations over the requested 10-km Gale radius.

Preserves original scientific patches. Remote COGs are read through GDAL HTTP
range requests; cached reprojected windows, identifiers and hashes are retained.
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform

from verified_terrain import ROOT, sha256

API = 'https://stac.astrogeology.usgs.gov/api/search'
OUT = ROOT / 'data' / 'verified_terrain' / 'gale-10km'
CACHE = ROOT / 'data' / 'verified_sources' / 'gale_context'
NODATA = -99999.0
# The catalog currently omits the observation-pair directory for this product.
# This corrected asset was checked with HTTP HEAD (200) before use.
SOURCE_URL_OVERRIDES = {
    'DTEEC_016520_1750_016375_1750_A01': 'https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/ESP_016520_1750_ESP_016375_1750/DTEEC_016520_1750_016375_1750_A01.tif'
}


def search(collection, bounds):
    result = requests.get(API, params={'collections': collection, 'bbox': ','.join(map(str, bounds)), 'limit': 100}, timeout=40)
    result.raise_for_status()
    data = result.json()
    (CACHE / (collection + '.json')).write_text(json.dumps(data))
    # Never mix another planet's numerically overlapping longitude/latitude.
    for item in data['features']:
        if item['collection'] != collection or item['properties'].get('ssys:targets') != ['Mars']:
            raise ValueError('Unexpected planet or collection in source search')
    return data['features']


def main():
    started = time.perf_counter()
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    original = json.loads((ROOT / 'data/verified_terrain/globe/manifest.json').read_text())
    center = next(p['center'] for p in original['patches'] if p['site'] == 'gale')
    lon, lat = center
    # A slightly buffered 20.04-km square contains the whole requested disk.
    spacing, dimension, half_width = 20, 1003, 10020
    crs = CRS.from_proj4(f'+proj=eqc +lat_ts={lat} +lon_0={lon} +R=3396190 +units=m +no_defs')
    center_x, center_y = transform(crs.geodetic_crs, crs, [lon], [lat])
    affine = Affine(spacing, 0, center_x[0] - half_width - spacing/2,
                    0, -spacing, center_y[0] + half_width + spacing/2)
    profile = dict(driver='GTiff', width=dimension, height=dimension, count=1, dtype='float32',
                   crs=crs, transform=affine, nodata=NODATA, compress='deflate')
    x, y = np.meshgrid(center_x[0] + np.arange(-half_width, half_width+1, spacing),
                       center_y[0] - np.arange(-half_width, half_width+1, spacing))
    lons, lats = transform(crs, crs.geodetic_crs, x.ravel(), y.ravel())
    lons, lats = np.asarray(lons).reshape(x.shape), np.asarray(lats).reshape(x.shape)
    bounds = [float(lons.min()), float(lats.min()), float(lons.max()), float(lats.max())]
    phi0, phi = np.radians(lat), np.radians(lats)
    delta = np.radians(lons-lon)
    distance = 2*3396190*np.arcsin(np.sqrt(np.clip(np.sin((phi-phi0)/2)**2 + np.cos(phi0)*np.cos(phi)*np.sin(delta/2)**2, 0, 1)))
    requested_disk = distance <= 10000
    ctx = search('mro_ctx_controlled_usgs_dtms', bounds)
    hirise = search('mro_hirise_socet_dtms', bounds)
    preferred = 'P19_008437_1746_XN_05S221W__P20_008938_1747_XN_05S221W'
    ctx.sort(key=lambda item: item['id'] != preferred)
    mosaic = np.full(x.shape, NODATA, dtype=np.float32)
    source_map = np.zeros(x.shape, dtype=np.uint8)
    sources = []

    def window(item, asset, kind):
        index = len(sources)+1
        catalog_url = item['assets'][asset]['href']
        source = SOURCE_URL_OVERRIDES.get(item['id'], catalog_url)
        cache = CACHE / f'{item["id"]}_{asset}_20m.tif'
        # Cache geometry is checked to avoid reusing a different region.
        if cache.exists():
            with rasterio.open(cache) as check:
                same = check.shape == x.shape and check.transform.almost_equals(affine) and check.crs == crs
            if not same:
                raise ValueError(f'Stale source window: {cache}')
        else:
            print(f'Reading {kind}: {item["id"]}', flush=True)
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_TIMEOUT='40'):
                with rasterio.open(source) as dataset:
                    with WarpedVRT(dataset, crs=crs, transform=affine, width=dimension, height=dimension,
                                   resampling=Resampling.bilinear, nodata=NODATA, dtype='float32') as vrt:
                        values = vrt.read(1, masked=True)
            with rasterio.open(cache, 'w', **profile) as destination:
                destination.write(values.filled(NODATA), 1)
                destination.update_tags(source_url=source, stac_id=item['id'], resampling='bilinear')
        with rasterio.open(cache) as dataset:
            values = dataset.read(1, masked=True)
        valid = ~np.ma.getmaskarray(values) & np.isfinite(values.data) & (np.abs(values.data) < 1e7)
        record = {'source_index': index, 'kind': kind, 'id': item['id'], 'url': source,
                  'catalog_url': catalog_url,
                  'collection': item['collection'], 'source_asset': asset,
                  'source_resolution_m': item['properties'].get('gsd'),
                  'prepared_window_sha256': sha256(cache), 'resampling': 'bilinear to 20 m',
                  'valid_fraction_in_requested_disk': float(valid[requested_disk].mean())}
        sources.append(record)
        (CACHE / (item['id'] + '.stac.json')).write_text(json.dumps(item, indent=2))
        return index, values.data, valid, record

    # Fill CTX holes with independent overlapping CTX products, never invented heights.
    for item in ctx[:8]:
        index, values, valid, record = window(item, 'geoid_adjusted_dem', 'CTX')
        use = valid & (source_map == 0)
        mosaic[use], source_map[use] = values[use], index
        print(f'CTX coverage: {(source_map[requested_disk] > 0).mean():.6%} of requested disk', flush=True)
        if np.all(source_map > 0):
            break
    # Preserve fine-source elevations where present; gaps retain explicit CTX provenance.
    for item in hirise:
        index, values, valid, record = window(item, 'dtm', 'HiRISE')
        overlap = valid & (source_map > 0)
        if overlap.any():
            differences = values[overlap] - mosaic[overlap]
            record['difference_from_previous_mosaic_m'] = {
                'median': float(np.median(differences)), 'p95_absolute': float(np.quantile(np.abs(differences), .95))}
        mosaic[valid], source_map[valid] = values[valid], index
    if not np.all(source_map[requested_disk] > 0):
        raise RuntimeError('Unfilled cells remain inside requested 10-km disk; refusing to claim complete coverage')

    with rasterio.open(OUT / 'elevation.tif', 'w', **profile) as destination:
        destination.write(mosaic, 1)
        destination.update_tags(method='CTX mosaic with valid HiRISE override; no bias shifts or generated fill', radius_m='10000')
    with rasterio.open(OUT / 'source_index.tif', 'w', **{**profile, 'dtype': 'uint8', 'nodata': 0}) as destination:
        destination.write(source_map, 1)
    # Display nodes use every second native cell: 40 m, without invented detail.
    z, src = mosaic[::2, ::2], source_map[::2, ::2]
    valid = src > 0
    rows, cols = z.shape
    grid = {'site': 'gale', 'name': 'Gale — 10 km radius context', 'rows': rows, 'cols': cols,
            'spacing_x_m': 40, 'spacing_y_m': 40, 'origin_elevation_m': float(z[valid].min()),
            'elevations_m': [round(float(value), 4) if ok else None for value, ok in zip(z.flat, valid.flat)],
            'source_page': '../data/verified_terrain/gale-10km/manifest.json',
            'source_label': 'HiRISE + CTX source manifest', 'coverage_label': '10 km radius · HiRISE + CTX · 40 m display mesh'}
    (OUT / 'grid.json').write_text(json.dumps(grid, allow_nan=False))
    vertex_ids = np.zeros(z.shape, dtype=np.int64)
    vertex_ids[valid] = np.arange(1, int(valid.sum())+1)
    triangle_count = 0
    with (OUT/'terrain.obj').open('w') as mesh:
        mesh.write(f'# Gale 10 km radius context; local east/up/south meters; elevation origin {grid["origin_elevation_m"]}\n')
        for row, column in zip(*np.nonzero(valid)):
            mesh.write(f'v {column*40:.3f} {float(z[row,column])-grid["origin_elevation_m"]:.6f} {row*40:.3f}\n')
        for row in range(rows-1):
            for column in range(cols-1):
                a,b,c,d = vertex_ids[row,column],vertex_ids[row+1,column],vertex_ids[row,column+1],vertex_ids[row+1,column+1]
                for face in [(a,b,c),(c,b,d)]:
                    if all(face):
                        mesh.write('f '+' '.join(map(str,face))+'\n')
                        triangle_count += 1
    image = np.zeros((*z.shape, 3), dtype=np.uint8)
    for source in sources:
        image[src == source['source_index']] = [225, 145, 75] if source['kind'] == 'HiRISE' else [60, 120, 170]
    Image.fromarray(image).save(OUT / 'source_coverage.png')
    native_valid = source_map > 0
    with rasterio.open(OUT / 'elevation.tif') as check:
        assert np.array_equal(check.read(1)[native_valid], mosaic[native_valid])
    # Verify attribution at every prepared native sample, not only summary counts.
    for source in sources:
        use = source_map == source['source_index']
        cache = CACHE / f'{source["id"]}_{source["source_asset"]}_20m.tif'
        with rasterio.open(cache) as check:
            assert np.array_equal(check.read(1)[use], mosaic[use])
        source['retained_cells_in_requested_disk'] = int(np.sum(use & requested_disk))
    counts = {kind: int(sum(s['retained_cells_in_requested_disk'] for s in sources if s['kind'] == kind)) for kind in ['CTX', 'HiRISE']}
    total = int(requested_disk.sum())
    native_origin = affine * (0.5, 0.5)
    manifest = {'site': 'gale', 'name': grid['name'], 'center': center, 'requested_radius_m': 10000,
                'region_shape': '20.04 km square containing the 10 km geodesic radius; corners extend beyond requested disk',
                'source_page': grid['source_page'], 'source_label': grid['source_label'],
                'method': 'Bilinear-reproject source windows to 20 m; CTX hole-fill then valid HiRISE override; no vertical bias correction',
                'crs_wkt': crs.to_wkt(), 'origin_projected_easting_northing_m': native_origin,
                'mesh_spacing_m': [40, 40], 'native_pixel_spacing_m': [20, 20],
                'mesh_extent_between_nodes_m': [(cols-1)*40, (rows-1)*40], 'mesh_grid': [rows, cols],
                'origin_elevation_m': grid['origin_elevation_m'], 'vertices': int(valid.sum()), 'triangles': triangle_count,
                'sources': sources, 'source_coverage_in_requested_disk': {k: {'cells': v, 'fraction': v/total} for k,v in counts.items()},
                'valid_fraction_in_requested_disk': float((source_map[requested_disk]>0).mean()),
                'valid_fraction_in_square': float(native_valid.mean()), 'elevation_min_m': float(z[valid].min()),
                'elevation_max_m': float(z[valid].max()), 'created_utc': datetime.now(timezone.utc).isoformat(),
                'runtime_seconds': time.perf_counter()-started,
                'verification': {'all_requested_disk_cells_have_real_source': True,
                                 'export_matches_prepared_source_at_every_attributed_cell': True},
                'limitations': ['Mixed source resolutions; 20 m raster and 40 m mesh do not imply uniform HiRISE resolution',
                                'Bilinear reprojection changes sampled values; original source-window caches are retained',
                                'Inter-product control differences may create visible boundaries; no bias correction performed',
                                'Vertical datums treated as compatible, not independently calibrated',
                                'Elevation colors, not photographic texture; no source imagery reconstruction ran']}
    manifest['outputs_sha256'] = {name: sha256(OUT/name) for name in ['elevation.tif', 'source_index.tif', 'grid.json', 'terrain.obj', 'source_coverage.png']}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2,allow_nan=False))
    print(json.dumps({'coverage': manifest['source_coverage_in_requested_disk'], 'grid': [rows, cols],
                      'valid_requested_disk': manifest['valid_fraction_in_requested_disk']}, indent=2), flush=True)


if __name__ == '__main__':
    main()
