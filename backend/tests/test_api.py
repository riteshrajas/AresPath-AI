from pathlib import Path

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.terrain import tile_bounds, contains

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def client():
    return TestClient(create_app(ROOT/'data'))


def test_catalog_and_missing_data_are_explicit(client, tmp_path):
    assert client.get('/api/v1/catalog').json()['tile_scheme']['id']=='mars-equirectangular-v1'
    empty=TestClient(create_app(tmp_path))
    assert empty.get('/api/v1/health').json()['status']=='data_missing'
    assert empty.get('/api/v1/tiles/0/0/0').status_code==503
    assert empty.get('/api/v1/coverage?longitude=0&latitude=0').status_code==503


def test_query_and_tile_validation(client):
    for path in ['/api/v1/tiles/2/4/0','/api/v1/tiles/19/0/0','/api/v1/tiles/0/0/0?size=2049',
                 '/api/v1/coverage?longitude=181&latitude=0','/api/v1/coverage?longitude=0&latitude=91']:
        assert client.get(path).status_code==422, path
    assert tile_bounds(0,0,0)==[-180,-90,180,90]
    assert tile_bounds(1,0,0)==[-180,0,0,90]


def test_longitude_wrap_and_antimeridian_bounds():
    assert contains([170,-10,-170,10],179,0)
    assert contains([170,-10,-170,10],-179,0)
    assert contains([-80,-10,-70,10],285,0)
    assert not contains([170,-10,-170,10],0,0)


def test_real_native_height_and_provenance(client):
    # Compare the API to a real prepared raster cell, independently of sampler.
    with rasterio.open(ROOT/'data/verified_terrain/gale/elevation.tif') as ds:
        x,y=ds.xy(ds.height//2,ds.width//2)
        from rasterio.warp import transform
        lon,lat=transform(ds.crs,ds.crs.geodetic_crs,[x],[y])
        expected=float(ds.read(1)[ds.height//2,ds.width//2])
    result=client.get('/api/v1/coverage',params={'longitude':lon[0],'latitude':lat[0]}).json()
    assert result['selected_source']['id']==2
    assert result['height_above_areoid_m']==pytest.approx(expected,abs=.0001)
    global_point=client.get('/api/v1/coverage?longitude=0&latitude=0').json()
    expected_kind = 'HRSC/MOLA' if (ROOT/'data/verified_terrain/global-200m/manifest.json').exists() else 'MOLA'
    assert global_point['selected_source']['kind']==expected_kind


def test_global_native_height_and_polar_fallback(client):
    path = ROOT/'data/verified_terrain/global-200m/elevation.tif'
    if not (path.parent/'manifest.json').exists():
        pytest.skip('Run pipeline/prepare_global_terrain.py to test the real global product')
    lon,lat=-11.692614292831884,-50.49574316920751
    with rasterio.open(path) as ds:
        row,col=ds.index(lon,lat)
        expected=float(ds.read(1,window=((row,row+1),(col,col+1)))[0,0])
    point=client.get('/api/v1/coverage',params={'longitude':lon,'latitude':lat}).json()
    assert point['selected_source']['id']==5
    assert point['height_above_areoid_m']==expected
    assert point['selected_source']['prepared_resolution_m']==200
    # The published grid stops just short of the south pole; retain true fallback.
    pole=client.get('/api/v1/coverage?longitude=0&latitude=-90').json()
    assert pole['selected_source']['id']==0
    global_entry=next(d for d in client.get('/api/v1/catalog').json()['datasets'] if d['id']=='global-200m')
    assert global_entry['bounds']==[-180,-90,180,90]
    provenance=client.get(global_entry['manifest']).json()
    assert provenance['source_bytes']==11384463908
    assert len(provenance['sha256'])==64
    assert client.get('/api/v1/datasets/not-a-dataset/manifest').status_code==404


def test_adjacent_tile_edges_and_cache(client):
    left=client.get('/api/v1/tiles/2/1/1?size=33')
    assert left.status_code==200, left.text
    right=client.get('/api/v1/tiles/2/2/1?size=33')
    a=np.array(left.json()['grid']['radii_m']).reshape(33,33)
    b=np.array(right.json()['grid']['radii_m']).reshape(33,33)
    np.testing.assert_array_equal(a[:,-1],b[:,0])
    again=client.get('/api/v1/tiles/2/1/1?size=33')
    assert again.headers['X-Terrain-Cache']=='HIT'
    assert again.headers['ETag']==left.headers['ETag']
    assert client.get('/api/v1/tiles/2/1/1?size=33',headers={'If-None-Match':left.headers['ETag']}).status_code==304


def test_frontend_assets_are_routed_through_api(client):
    metadata=client.get('/api/v1/globe/manifest').json()
    assert all(p['grid'].startswith('/api/v1/regions/') for p in metadata['patches'])
    assert client.get('/api/v1/globe/radius.i16').status_code==200
    assert client.get('/api/v1/regions/gale/manifest').json()['requested_radius_m']==10000
    assert client.get('/api/v1/regions/arbitrary/grid').status_code==422
