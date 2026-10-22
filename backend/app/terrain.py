"""Read prepared scientific data and sample a planet-wide terrain tile grid."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform

SCHEME = 'mars-equirectangular-v1'


def contains(bounds, longitude, latitude):
    west,south,east,north = bounds
    longitude = (np.asarray(longitude)+180) % 360-180
    latitudes = (latitude>=south)&(latitude<=north)
    return latitudes & (((longitude>=west)&(longitude<=east)) if west<=east else ((longitude>=west)|(longitude<=east)))


def tile_bounds(z: int, x: int, y: int):
    n = 2 ** z
    if not 0 <= z <= 18 or not 0 <= x < n or not 0 <= y < n:
        raise ValueError('Tile index outside the declared equirectangular grid')
    return [-180 + 360*x/n, 90 - 180*(y+1)/n, -180 + 360*(x+1)/n, 90 - 180*y/n]


class TerrainStore:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.registry = self._json(Path(__file__).resolve().parents[1]/'catalog.json')
        self.sources = self.registry['sources']
        self.source_by_id = {item['id']:item for item in self.sources}
        self.globe_dir = self.root/'verified_terrain'/'globe'
        self.globe_manifest = self._json(self.globe_dir/'manifest.json')
        self.width, self.height = self.globe_manifest.get('width', 1440), self.globe_manifest.get('height', 720)
        self.offset = self.globe_manifest.get('offset_m', 3396000)
        self.radius = self._array('radius')
        self.areoid = self._array('areoid')
        self.ready = self.radius is not None and self.areoid is not None
        self.datasets = []
        # Broad coverage first, then finer native crops override it.
        self.unavailable = []
        for entry in self.registry['datasets']:
            identifier, source_id = entry['id'], entry['source_id']
            path = (self.root/entry['directory']).resolve()
            if not path.is_relative_to(self.root):
                raise ValueError('Dataset registry directory must stay inside the configured data root')
            if not (path/'elevation.tif').exists() or not (path/'manifest.json').exists():
                self.unavailable.append(identifier)
                continue
            metadata = self._json(path/'manifest.json')
            with rasterio.open(path/'elevation.tif') as dataset:
                left, bottom, right, top = dataset.bounds
                longitude, latitude = transform(dataset.crs, dataset.crs.geodetic_crs,
                                                 [left, right], [bottom, top])
            self.datasets.append({'id': identifier, 'path': path, 'source_id': source_id,
                                  'attribution_source_ids':entry.get('attribution_source_ids'),
                                  'bounds': [(longitude[0]+180)%360-180, min(latitude), (longitude[1]+180)%360-180, max(latitude)],
                                  'metadata': metadata})
        signature = []
        for path in sorted((self.root/'verified_terrain').rglob('*')) if (self.root/'verified_terrain').exists() else []:
            if path.name in ('manifest.json', 'elevation.tif', 'source_index.tif', 'radius.i16', 'areoid.i16', 'grid.json'):
                info = path.stat()
                signature.append((str(path.relative_to(self.root)), info.st_size, info.st_mtime_ns))
        self.revision = hashlib.sha256(json.dumps([self.registry,signature]).encode()).hexdigest()[:20]

    @staticmethod
    def _json(path):
        return json.loads(path.read_text()) if path.exists() else {}

    def _array(self, name):
        path = self.globe_dir/(name+'.i16')
        if not path.exists():
            return None
        values = np.fromfile(path, dtype='<i2')
        if values.size != self.width*self.height:
            return None
        return values.reshape(self.height, self.width)

    def _mola(self, grid, longitude, latitude):
        x = np.mod(longitude, 360)*self.width/360 - .5
        y = np.clip((90-latitude)*self.height/180 - .5, 0, self.height-1)
        ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
        fx, fy = x-ix, y-iy
        x0, x1 = ix % self.width, (ix+1) % self.width
        y1 = np.minimum(iy+1, self.height-1)
        return self.offset + (1-fy)*((1-fx)*grid[iy,x0] + fx*grid[iy,x1]) + fy*((1-fx)*grid[y1,x0] + fx*grid[y1,x1])

    def sample(self, longitude, latitude):
        if not self.ready:
            raise FileNotFoundError('Prepared MOLA data missing; run pipeline/stitch_globe.py')
        longitude, latitude = (np.asarray(longitude, dtype=float)+180)%360-180, np.asarray(latitude, dtype=float)
        areoid = self._mola(self.areoid, longitude, latitude)
        radius = self._mola(self.radius, longitude, latitude)
        height = radius-areoid
        source = np.zeros(longitude.shape, dtype=np.uint16)
        for item in self.datasets:
            selected = np.flatnonzero(contains(item['bounds'],longitude,latitude))
            if not selected.size:
                continue
            with rasterio.open(item['path']/'elevation.tif') as dataset:
                xx, yy = transform(dataset.crs.geodetic_crs, dataset.crs, longitude[selected], latitude[selected])
                coordinates = list(zip(xx,yy))
                values = np.ma.concatenate(list(dataset.sample(coordinates, masked=True)))
                valid = ~np.ma.getmaskarray(values)&np.isfinite(values.data)&(np.abs(values.data)<1e7)
                retained = selected[valid]
                height[retained] = values.data[valid]
            source[retained] = item['source_id']
            if item['attribution_source_ids']:
                with rasterio.open(item['path']/'source_index.tif') as attribution:
                    ids = np.ma.concatenate(list(attribution.sample(coordinates, masked=True))).filled(0).astype(int)
                kind_by_id = {s['source_index']:s['kind'] for s in item['metadata']['sources']}
                for local, native_id in enumerate(ids):
                    if valid[local]:
                        kind = kind_by_id[native_id]
                        source[selected[local]] = item['attribution_source_ids'][kind]
        radius = areoid+height
        if not np.isfinite(radius).all() or not np.isfinite(height).all():
            raise ValueError('Non-finite source terrain samples')
        return height, radius, source

    def catalog(self):
        return {'schema_version': 1, 'planet': 'Mars', 'revision': self.revision, 'ready': self.ready,
                'tile_scheme': {'id': SCHEME, 'root_bounds':[-180,-90,180,90], 'tiles_per_axis':'2^z',
                                'y_direction':'north-to-south', 'max_zoom':18, 'grid_sizes':[33,65,129]},
                'sources': self.sources, 'unavailable_datasets':self.unavailable,
                'datasets': [{'id':d['id'], 'bounds':d['bounds'], 'available':True,
                              'warnings':d['metadata'].get('limitations', [])} for d in self.datasets],
                'limitations':['High-resolution coverage is limited to prepared datasets',
                               'Tile grid spacing is not source resolution',
                               'Known inter-product vertical offsets remain uncorrected',
                               'Restart API after preparing new data to refresh its revision and cache']}

    def coverage(self, longitude, latitude):
        height, radius, source = self.sample([longitude],[latitude])
        return {'planet':'Mars', 'longitude':longitude, 'latitude':latitude, 'revision':self.revision,
                'height_above_areoid_m':float(height[0]), 'planetary_radius_m':float(radius[0]),
                'selected_source':self.source_by_id[int(source[0])],
                'datasets':[d['id'] for d in self.datasets if contains(d['bounds'],longitude,latitude)]}

    @lru_cache(maxsize=128)
    def tile(self, z, x, y, size):
        west,south,east,north = tile_bounds(z,x,y)
        longitude,latitude = np.meshgrid(np.linspace(west,east,size), np.linspace(north,south,size))
        height,radius,source = self.sample(longitude.ravel(),latitude.ravel())
        counts = {str(int(value)):int(np.sum(source==value)) for value in np.unique(source)}
        return {'schema_version':1, 'planet':'Mars', 'revision':self.revision,
                'tile':{'scheme':SCHEME, 'z':z, 'x':x, 'y':y, 'bounds':[west,south,east,north]},
                'grid':{'rows':size,'cols':size,'row_order':'north-to-south', 'heights_m':np.round(height,4).tolist(),
                        'radii_m':np.round(radius,4).tolist(), 'source_ids':source.tolist()},
                'sources':[s for s in self.sources if str(s['id']) in counts], 'source_counts':counts,
                'sampling':'Bilinear MOLA; nearest native cell for prepared regional rasters',
                'vertical_exaggeration':1,
                'warnings':['Dense output grids do not create finer source measurements',
                            'Mixed-source offsets and resolution boundaries are not corrected']}

    def region_dir(self, site):
        if site not in ('jezero','gale'):
            raise KeyError(site)
        directory = 'gale-10km' if site=='gale' and (self.root/'verified_terrain/gale-10km/manifest.json').exists() else site
        return self.root/'verified_terrain'/directory
