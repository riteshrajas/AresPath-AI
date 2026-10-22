"""Prepare measured MOLA globe radii and georeferenced HiRISE patch placement."""
import json
import re
from datetime import datetime, timezone

import numpy as np
from rasterio.crs import CRS
from rasterio.warp import transform
from verified_terrain import ROOT, download, sha256

BASE = 'https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/'


def main():
    source = ROOT / 'data' / 'verified_sources' / 'mola'
    output = ROOT / 'data' / 'verified_terrain' / 'globe'
    source.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    products = {}
    for name, stem in [('radius', 'megr90n000cb'), ('areoid', 'mega90n000cb')]:
        for ext in ['lbl', 'img']:
            download(BASE + stem + '.' + ext, source / (stem + '.' + ext))
        label = (source / (stem + '.lbl')).read_text()
        for field, expected in [('LINES', '720'), ('LINE_SAMPLES', '1440'), ('OFFSET', '3396000'), ('SAMPLE_BITS', '16')]:
            if not re.search(r'\b' + field + r'\s*=\s*' + expected + r'\b', label):
                raise ValueError(f'Unexpected {field} in {stem}')
        if not re.search(r'SAMPLE_TYPE\s*=\s*MSB_INTEGER', label):
            raise ValueError('Unexpected source endianness')
        image = source / (stem + '.img')
        values = np.fromfile(image, dtype='>i2')
        if values.size != 720 * 1440:
            raise ValueError('Incomplete MOLA product')
        values.astype('<i2').tofile(output / (name + '.i16'))
        products[name] = {'source': BASE + stem + '.img', 'label': BASE + stem + '.lbl',
                          'source_sha256': sha256(image), 'output_sha256': sha256(output / (name + '.i16'))}
    patches = []
    for site in ['jezero', 'gale']:
        path = ROOT / 'data' / 'verified_terrain' / site
        expanded = ROOT / 'data' / 'verified_terrain' / 'gale-10km'
        if site == 'gale' and (expanded / 'manifest.json').exists():
            path = expanded
        metadata = json.loads((path / 'manifest.json').read_text())
        grid = json.loads((path / 'grid.json').read_text())
        crs = CRS.from_wkt(metadata['crs_wkt'])
        x0, y0 = metadata['origin_projected_easting_northing_m']
        dx, dy = metadata['mesh_spacing_m']
        xx, yy = np.meshgrid(x0 + np.arange(grid['cols']) * dx,
                             y0 - np.arange(grid['rows']) * dy)
        longitude, latitude = transform(crs, crs.geodetic_crs, xx.ravel(), yy.ravel())
        longitude = np.asarray(longitude).reshape(xx.shape)
        latitude = np.asarray(latitude).reshape(xx.shape)
        # Compact axis encoding is valid for these equirectangular source CRSs.
        assert np.max(np.abs(longitude - longitude[0:1, :])) < 1e-10
        assert np.max(np.abs(latitude - latitude[:, 0:1])) < 1e-10
        # Independent inverse-projection check: recover source XY to <1 mm.
        back_x, back_y = transform(crs.geodetic_crs, crs, longitude.ravel(), latitude.ravel())
        error = max(float(np.max(np.abs(np.asarray(back_x) - xx.ravel()))),
                    float(np.max(np.abs(np.asarray(back_y) - yy.ravel()))))
        assert error < 0.001
        patch = {'site': site, 'name': grid['name'], 'longitudes': longitude[0].tolist(),
                 'latitudes': latitude[:, 0].tolist(),
                 'center': [float(longitude.mean()), float(latitude.mean())],
                 'bounds': [float(longitude.min()), float(latitude.min()), float(longitude.max()), float(latitude.max())],
                 'grid': '../' + path.name + '/grid.json', 'source_page': grid['source_page'],
                 'source_label': grid.get('source_label', 'HiRISE source · elevation colors'),
                 'coverage_label': grid.get('coverage_label'),
                 'display_span_m': metadata['mesh_extent_between_nodes_m'],
                 'inverse_projection_max_error_m': error,
                 'source_manifest_sha256': sha256(path / 'manifest.json')}
        patches.append(patch)
        print(f"{site}: center {patch['center']}; inverse projection error {error:.3g} m", flush=True)
    result = {'created_utc': datetime.now(timezone.utc).isoformat(), 'products': products,
              'width': 1440, 'height': 720, 'pixels_per_degree': 4, 'offset_m': 3396000,
              'encoding': 'signed int16 little endian; add offset_m; pixel centers 0.125E/89.875N',
              'patches': patches,
              'placement': 'Planetocentric east longitude; patch radius = bilinear MOLA areoid radius + source DTM elevation',
              'limits': ['Coarse global MOLA grid includes interpolated bins; not high-resolution global terrain',
                         'HiRISE Mars 2000 datum treated as compatible with MOLA GMM3 areoid; datum offsets not independently calibrated',
                         'Interpolated edge collars and boundary skirts join resolutions; they are display geometry, not measured terrain',
                         'Global color image registration is inherited from existing image asset, not independently surveyed']}
    (output / 'manifest.json').write_text(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
