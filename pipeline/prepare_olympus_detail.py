"""Prepare a small real HiRISE DTM + registered red-band ortho crop."""
import hashlib
import json
from pathlib import Path
import numpy as np
import requests
import rasterio
from rasterio.windows import Window
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.warp import transform
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/verified_terrain/olympus-scarp'
PRODUCT = 'DTEEC_001432_2015_001630_2015_U01'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    r = requests.get('https://stac.astrogeology.usgs.gov/api/search', params={
        'collections':'mro_hirise_socet_dtms', 'bbox':'-138,21,-137,22', 'limit':100}, timeout=60)
    r.raise_for_status()
    item = next(f for f in r.json()['features'] if f['id'] == PRODUCT)
    (OUT / 'source.stac.json').write_text(json.dumps(item, indent=2))
    url = item['assets']['dtm']['href']
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='60'):
        with rasterio.open(url) as ds:
            window = Window(ds.width//2-1024, ds.height//2-1024, 2049, 2049)
            heights = ds.read(1, window=window, masked=True)
            affine = ds.window_transform(window)
            profile = ds.profile.copy()
            profile.update(width=2049,height=2049,transform=affine,compress='deflate')
            with rasterio.open(OUT/'elevation.tif','w',**profile) as dst:
                dst.write(heights.filled(ds.nodata),1)
            center = transform(ds.crs,ds.crs.geodetic_crs,[affine.c+1024*affine.a],[affine.f+1024*affine.e])
            lon,lat = (center[0][0]+180)%360-180, center[1][0]
            with rasterio.open(item['assets']['ortho_0']['href']) as ortho:
                with WarpedVRT(ortho,crs=ds.crs,transform=affine,width=2049,height=2049,resampling=Resampling.bilinear) as vrt:
                    photo = vrt.read(1,masked=True)
            lo,hi=np.percentile(photo.compressed(),[1,99])
            image=np.clip((photo.filled(lo).astype(float)-lo)/max(hi-lo,1)*255,0,255).astype('uint8')
            Image.fromarray(image).save(OUT/'ortho.jpg',quality=95)
            # Display mesh samples exact raster cells, with explicit null gaps.
            h=heights[::8,::8]
            grid={'rows':h.shape[0],'cols':h.shape[1],'spacing_m':abs(affine.a)*8,
                  'heights_m':[[None if np.ma.is_masked(v) else float(v) for v in row] for row in h]}
            (OUT/'grid.json').write_text(json.dumps(grid))
            manifest={'id':PRODUCT,'center':[lon,lat],'source_url':url,'ortho_url':item['assets']['ortho_0']['href'],
                      'native_spacing_m':abs(affine.a),'valid_fraction':float(heights.count()/heights.size),
                      'limitations':['Small Olympus basal scarp patch, not summit or full volcano',
                                      'Red-band grayscale ortho; any rust tint is illustrative',
                                      'Display grid samples every eighth native cell; source values retained',
                                      'No cross-product vertical bias adjustment'],
                      'sha256':hashlib.sha256((OUT/'elevation.tif').read_bytes()).hexdigest()}
            (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
            print(json.dumps(manifest,indent=2))

if __name__=='__main__': main()
