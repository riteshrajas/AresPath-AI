import math
import threading
import time
import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app.routing import corridor, terrain_metrics, find_path, summarize, routes_router

def test_profiles_trade_distance_for_a_gentler_corridor():
    xs = ys = np.arange(21)*10.
    x,y = np.meshgrid(xs,ys)
    height = 12*np.exp(-((x-100)**2+(y-100)**2)/(2*20**2))
    slope, rough = terrain_metrics(height,xs,ys)
    sources = np.zeros(height.shape,dtype=int)
    args = (height,sources,xs,ys,(10,0),(10,20),slope,rough)
    safe = find_path(*args,12,16,18,threading.Event())
    shortest = find_path(*args,25,0,0,threading.Event())
    assert safe and shortest and safe != shortest
    length = lambda path: sum(math.hypot(xs[b[1]]-xs[a[1]],ys[b[0]]-ys[a[0]]) for a,b in zip(path,path[1:]))
    assert length(safe) > length(shortest)
    assert max(slope[index] for index in safe) <= 12

def test_blocked_corners_and_source_seams_are_not_crossed():
    heights = np.zeros((3,3)); xs = ys = np.arange(3)*10.
    slope,rough = terrain_metrics(heights,xs,ys); sources = np.zeros((3,3),dtype=int)
    sources[:,1:] = 1
    assert find_path(heights,sources,xs,ys,(1,0),(1,2),slope,rough,25,0,0,threading.Event()) is None
    sources[:]=0; slope[0,1]=slope[1,0]=90
    assert find_path(heights,sources,xs,ys,(0,0),(1,1),slope,rough,25,0,0,threading.Event()) is None
    cancel=threading.Event();cancel.set()
    with pytest.raises(InterruptedError): find_path(heights,sources,xs,ys,(2,0),(2,2),slope,rough,25,0,0,cancel)

def test_corridor_preserves_exact_endpoints_and_wraps_the_dateline():
    start=dict(longitude=179.99,latitude=0); end=dict(longitude=-179.99,latitude=.01)
    grid=corridor(start,end)
    assert grid['direct_distance_m'] < 2000
    a,b=grid['start'],grid['end']
    assert grid['longitude'][a] == pytest.approx(start['longitude'])
    assert grid['longitude'][b] == pytest.approx(end['longitude'])
    assert grid['latitude'][b] == pytest.approx(end['latitude'])
    with pytest.raises(ValueError,match='10 meters'):corridor(start,start)
    with pytest.raises(ValueError,match='1,500'):corridor(dict(longitude=0,latitude=0),dict(longitude=100,latitude=0))

class FlatStore:
    ready=True;revision='test-revision'
    source_by_id={0:dict(id=0,name='Synthetic TEST ONLY',prepared_resolution_m=200)}
    def sample(self,lon,lat):
        return np.zeros(len(lon)), np.full(len(lon),3396000.), np.zeros(len(lon),dtype=int)

def test_jobs_complete_with_real_comparisons_and_validation():
    app=FastAPI();app.include_router(routes_router(FlatStore()),prefix='/api/v1')
    with TestClient(app) as client:
        payload=dict(start=dict(longitude=0,latitude=0),destination=dict(longitude=.01,latitude=.01),detail='standard',max_slope_deg=25)
        response=client.post('/api/v1/routes',json=payload)
        assert response.status_code==202
        identifier=response.json()['id']
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            state=client.get('/api/v1/routes/'+identifier).json()
            if state['status'] in ('complete','failed'):break
            time.sleep(.01)
        assert state['status']=='complete',state
        result=state['result'];assert len(result['routes'])==3
        assert all(route['status']=='ready' for route in result['routes'])
        assert result['routes'][1]['same_as']=='safest'
        assert result['routes'][0]['points'][0][:2]==[0.,0.]
        assert result['routes'][0]['points'][-1][:2]==[.01,.01]
        assert result['revision']=='test-revision'
        assert any('oversamples' in warning for warning in result['warnings'])
        assert client.get('/api/v1/routes/missing').status_code==404
        payload['destination']=payload['start'];assert client.post('/api/v1/routes',json=payload).status_code==422

def test_job_cancellation_is_observed_during_terrain_loading():
    entered,release=threading.Event(),threading.Event()
    class BlockingStore(FlatStore):
        def sample(self,lon,lat):
            entered.set();release.wait(5)
            return super().sample(lon,lat)
    app=FastAPI();app.include_router(routes_router(BlockingStore()),prefix='/api/v1')
    with TestClient(app) as client:
        identifier=client.post('/api/v1/routes',json=dict(start=dict(longitude=0,latitude=0),destination=dict(longitude=.01,latitude=.01))).json()['id']
        try:
            assert entered.wait(2)
            assert client.delete('/api/v1/routes/'+identifier).status_code==200
        finally:release.set()
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            state=client.get('/api/v1/routes/'+identifier).json()
            if state['status']=='canceled':break
            time.sleep(.01)
        assert state['status']=='canceled'
