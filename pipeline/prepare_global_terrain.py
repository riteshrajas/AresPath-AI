"""Download and validate the official global 200 m HRSC/MOLA blend.

No generated relief or raw-image reconstruction. HTTP ranges are checked and
written to a resumable partial file; only a fully validated file is published.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/verified_terrain/global-200m'
URL = 'https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif'
REFERENCE = 'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m'
CHUNK = 32 * 1024 * 1024


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2), encoding='utf-8')
    os.replace(temporary, path)


def download():
    OUT.mkdir(parents=True, exist_ok=True)
    final, partial, progress = OUT/'elevation.tif', OUT/'elevation.partial', OUT/'download.json'
    response = requests.get(URL, headers={'Range':'bytes=0-0'}, stream=True, timeout=(10,45))
    response.raise_for_status()
    if response.status_code != 206 or not response.headers.get('Content-Range','').startswith('bytes 0-0/'):
        raise RuntimeError('Source did not honor the byte range')
    size, etag = int(response.headers['Content-Range'].split('/')[1]), response.headers.get('ETag')
    response.close()
    if final.exists():
        if final.stat().st_size != size:
            raise RuntimeError('Existing published raster has an unexpected length')
        prior_path = progress if progress.exists() else OUT/'manifest.json'
        prior = json.loads(prior_path.read_text()) if prior_path.exists() else {}
        if prior.get('etag',prior.get('source_etag')) != etag:
            raise RuntimeError('Cannot confirm the existing file belongs to this source revision')
        return final, size, etag
    state = {'url':URL,'size':size,'etag':etag,'chunk_bytes':CHUNK,'completed':{}}
    if progress.exists() and partial.exists():
        old = json.loads(progress.read_text())
        if any(old.get(key) != state[key] for key in ('url','size','etag','chunk_bytes')):
            raise RuntimeError('Partial download belongs to a different source revision')
        # Confirm completed ranges from disk, rather than trusting old progress.
        with partial.open('rb') as source:
            for index, digest in old['completed'].items():
                start = int(index)*CHUNK
                source.seek(start)
                if hashlib.sha256(source.read(min(CHUNK,size-start))).hexdigest() == digest:
                    state['completed'][index] = digest
    else:
        with partial.open('wb') as destination:
            destination.truncate(size)
    save_json(progress,state)
    started, initial, last = time.perf_counter(), len(state['completed']), 0

    def segment(index):
        start, end = index*CHUNK, min(size,(index+1)*CHUNK)-1
        expected = f'bytes {start}-{end}/{size}'
        for attempt in range(4):
            try:
                with requests.get(URL, headers={'Range':f'bytes={start}-{end}','If-Match':etag},
                                  stream=True, timeout=(10,45)) as response:
                    response.raise_for_status()
                    if response.status_code != 206 or response.headers.get('Content-Range') != expected or response.headers.get('ETag') != etag:
                        raise RuntimeError('Source revision or returned byte range changed')
                    digest, count = hashlib.sha256(), 0
                    with partial.open('r+b') as destination:
                        destination.seek(start)
                        for block in response.iter_content(1024*1024):
                            if count + len(block) > end-start+1:
                                raise RuntimeError('Range response exceeds its declared length')
                            destination.write(block); digest.update(block); count += len(block)
                    if count != end-start+1:
                        raise RuntimeError('Incomplete range response')
                return str(index), digest.hexdigest()
            except (requests.RequestException, RuntimeError):
                if attempt == 3:
                    raise
                time.sleep(attempt+1)

    count = (size+CHUNK-1)//CHUNK
    with ThreadPoolExecutor(max_workers=6) as pool:
        work = [pool.submit(segment,index) for index in range(count) if str(index) not in state['completed']]
        for future in as_completed(work):
            index, digest = future.result(); state['completed'][index] = digest
            save_json(progress,state)
            elapsed = time.perf_counter()-started
            if elapsed-last >= 10 or len(state['completed']) == count:
                rate = (len(state['completed'])-initial)*CHUNK/max(elapsed,1)/1e6
                print(f'Download {len(state["completed"])}/{count} ranges ({len(state["completed"])/count:.1%}), {rate:.1f} MB/s',flush=True)
                last = elapsed
    if len(state['completed']) != count or partial.stat().st_size != size:
        raise RuntimeError('Source download is incomplete')
    # Header and test windows must decode before the raster becomes discoverable.
    with rasterio.open(partial) as source:
        if source.shape != (53347,106694) or source.dtypes != ('int16',) or source.nodata != -32768:
            raise RuntimeError('Unexpected official global raster layout')
        for row,column in [(0,0),(26673,53347),(41639,49882),(53346,106693)]:
            source.read(1,window=((row,row+1),(column,column+1)))
    os.replace(partial,final)
    return final,size,etag


def main():
    started = time.perf_counter()
    path,size,etag = download()
    print('Downloaded. Scanning all source cells and computing SHA-256.',flush=True)
    digest = hashlib.sha256()
    with path.open('rb') as source:
        while block := source.read(8*1024*1024):
            digest.update(block)
    valid_count, minimum, maximum = 0, float('inf'), float('-inf')
    with rasterio.open(path) as source:
        for row in range(0,source.height,256):
            values = source.read(1,window=((row,min(row+256,source.height)),(0,source.width)),masked=True)
            valid = values.compressed()
            if valid.size:
                valid_count += int(valid.size); minimum = min(minimum,int(valid.min())); maximum = max(maximum,int(valid.max()))
        bounds, crs, shape = list(source.bounds), source.crs.to_wkt(), list(source.shape)
    if valid_count < .99*shape[0]*shape[1] or minimum < -20000 or maximum > 30000:
        raise RuntimeError('Global raster failed plausible-value or coverage validation')
    metadata = {'id':'mars-global-hrsc-mola-200m-v2','planet':'Mars','created_utc':datetime.now(timezone.utc).isoformat(),
                'source_url':URL,'reference':REFERENCE,'authors':'Fergason, Hare and Laura (2018), USGS',
                'source_etag':etag,'source_bytes':size,'sha256':digest.hexdigest(),'shape':shape,'bounds':bounds,'crs_wkt':crs,
                'prepared_resolution_m':200,'vertical_datum':'MOLA areoid, as distributed by USGS',
                'valid_cells':valid_count,'total_cells':shape[0]*shape[1],'minimum_m':minimum,'maximum_m':maximum,
                'method':'Unmodified published global elevation GeoTIFF; nearest native cells served by terrain API',
                'limitations':['200 m grid spacing is not uniform 200 m stereo detail; this product blends HRSC with MOLA',
                               'No per-cell HRSC versus MOLA attribution mask is provided here',
                               'Tiny grid-edge/polar gaps retain explicit coarse-MOLA fallback',
                               'No bias correction against local CTX/HiRISE; source boundaries may show offsets',
                               'Elevation data, not a new photographic texture or raw-image reconstruction'],
                'elapsed_seconds':time.perf_counter()-started}
    save_json(OUT/'manifest.json',metadata)
    print(json.dumps(metadata,indent=2),flush=True)


if __name__ == '__main__':
    main()
