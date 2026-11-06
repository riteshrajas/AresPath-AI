from pathlib import Path

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.terrain import tile_bounds, contains, geodetic_crs, sample_native_cells, sample_global_display_cells

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


def test_block_sampling_matches_rasterio_nearest_with_masks():
    from rasterio.io import MemoryFile
    from rasterio.transform import from_origin
    pixels = np.arange(32 * 32, dtype=np.int16).reshape(32, 32)
    pixels[4, 7] = -9999
    with MemoryFile() as memory:
        with memory.open(driver='GTiff', width=32, height=32, count=1, dtype='int16',
                         transform=from_origin(0, 32, 1, 1), nodata=-9999,
                         tiled=True, blockxsize=16, blockysize=16) as dataset:
            dataset.write(pixels, 1)
            x = [7.5, 0.5, 15.5, 16.0, 31.5, -1.0, 32.0, 7.5]
            y = [27.5, 31.5, 16.5, 16.0, 0.5, 0.5, 0.5, 27.5]
            expected = np.ma.concatenate(list(dataset.sample(list(zip(x, y)), masked=True)))
            actual = sample_native_cells(dataset, x, y)
            np.testing.assert_array_equal(np.ma.getmaskarray(actual), np.ma.getmaskarray(expected))
            np.testing.assert_array_equal(actual.compressed(), expected.compressed())


def test_display_interpolation_uses_pixel_centers_and_respects_masks_and_edges():
    from rasterio.io import MemoryFile
    from rasterio.transform import from_origin
    pixels = np.array([[0, 10, 20], [20, 30, 40], [40, 50, -9999]], dtype=np.int16)
    with MemoryFile() as memory:
        with memory.open(driver='GTiff', width=3, height=3, count=1, dtype='int16',
                         transform=from_origin(0, 3, 1, 1), nodata=-9999) as dataset:
            dataset.write(pixels, 1)
            # A native center is exact; between four cells is their weighted
            # mean; missing neighbors/edge return the nearest native cell.
            x = [0.5, 1.0, 1.9, 0.1, 2.5, 3.1]
            y = [2.5, 2.0, 0.9, 2.9, 0.5, 2.5]
            result = sample_global_display_cells(dataset, x, y)
            assert result[0] == 0
            assert result[1] == pytest.approx(15)
            assert result[2] == sample_native_cells(dataset, x, y)[2]
            assert result[3] == 0
            assert np.ma.getmaskarray(result)[4]
            assert np.ma.getmaskarray(result)[5]


def test_real_native_height_and_provenance(client):
    # Compare the API to a real prepared raster cell, independently of sampler.
    with rasterio.open(ROOT/'data/verified_terrain/gale/elevation.tif') as ds:
        x,y=ds.xy(ds.height//2,ds.width//2)
        from rasterio.warp import transform
        lon,lat=transform(ds.crs,geodetic_crs(ds.crs),[x],[y])
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


def test_display_tiles_are_separate_from_native_and_share_edges(client):
    native = client.get('/api/v1/tiles/12/2048/2048?size=33')
    display = client.get('/api/v1/tiles/12/2048/2048?size=33&sampling=display')
    other = client.get('/api/v1/tiles/12/2049/2048?size=33&sampling=display')
    assert native.status_code == display.status_code == other.status_code == 200
    assert native.headers['ETag'] != display.headers['ETag']
    assert 'nearest native' in native.json()['sampling']
    assert 'for display' in display.json()['sampling']
    a = np.array(display.json()['grid']['radii_m']).reshape(33, 33)
    b = np.array(other.json()['grid']['radii_m']).reshape(33, 33)
    np.testing.assert_array_equal(a[:, -1], b[:, 0])
    assert client.get('/api/v1/tiles/12/2048/2048?size=33&sampling=unknown').status_code == 422

    west = client.get('/api/v1/tiles/2/0/3?size=33&sampling=display').json()
    east = client.get('/api/v1/tiles/2/3/3?size=33&sampling=display').json()
    west_radii = np.array(west['grid']['radii_m']).reshape(33, 33)
    east_radii = np.array(east['grid']['radii_m']).reshape(33, 33)
    np.testing.assert_array_equal(west_radii[:, 0], east_radii[:, -1])
    assert np.isfinite(west_radii).all() and np.isfinite(east_radii).all()


def test_frontend_assets_are_routed_through_api(client):
    metadata=client.get('/api/v1/globe/manifest').json()
    assert all(p['grid'].startswith('/api/v1/regions/') for p in metadata['patches'])
    assert client.get('/api/v1/globe/radius.i16').status_code==200
    assert client.get('/api/v1/regions/gale/manifest').json()['requested_radius_m']==10000
    assert client.get('/api/v1/regions/arbitrary/grid').status_code==422


def test_terrain_store_lifecycle_and_leak_prevention():
    import weakref
    from backend.app.terrain import TerrainStore

    store = TerrainStore(ROOT/'data')
    assert hasattr(store, '_lock')
    assert len(store.datasets) > 0

    info0 = store.tile_json.cache_info()
    res1 = store.tile_json(2, 1, 1, 33)
    info1 = store.tile_json.cache_info()
    assert info1.misses == info0.misses + 1
    res2 = store.tile_json(2, 1, 1, 33)
    info2 = store.tile_json.cache_info()
    assert info2.hits == info0.hits + 1
    assert res1 == res2

    elevation_ds = store.datasets[0]['elevation_ds']
    assert not elevation_ds.closed

    wr = weakref.ref(store)
    store.close()
    assert elevation_ds.closed
    del store
    assert wr() is None


def test_terrain_store_partial_construction_close_safety():
    from backend.app.terrain import TerrainStore

    store = TerrainStore.__new__(TerrainStore)
    store.close()
    store.__del__()

