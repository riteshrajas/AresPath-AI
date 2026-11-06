"""Regional, DEM-based route comparisons. No imagery-derived rock/soil hazards."""
from __future__ import annotations
import copy
import heapq
import math
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

RADIUS = 3396000.0
PROFILES = [('safest', 12., 16., 18.), ('balanced', 20., 4., 5.), ('shortest', 25., 0., 0.)]

class Endpoint(BaseModel):
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(ge=-84, le=84, allow_inf_nan=False)
    name: str = Field(default='Map point', max_length=120)

class RouteRequest(BaseModel):
    start: Endpoint
    destination: Endpoint
    detail: str = Field(default='standard', pattern='^(standard|detailed)$')
    max_slope_deg: float = Field(default=25, ge=1, le=35, allow_inf_nan=False)

def corridor(start, end, detail='standard'):
    """A local equirectangular corridor with unwrapped longitude at the seam."""
    lon0, lat0 = start['longitude'], start['latitude']
    delta_lon = (end['longitude'] - lon0 + 180) % 360 - 180
    mean_lat = math.radians((lat0 + end['latitude']) / 2)
    metres_lon = RADIUS * math.pi / 180 * math.cos(mean_lat)
    metres_lat = RADIUS * math.pi / 180
    ex, ey = delta_lon * metres_lon, (end['latitude'] - lat0) * metres_lat
    distance = math.hypot(ex, ey)
    if distance < 10: raise ValueError('Choose endpoints at least 10 meters apart.')
    if distance > 1500000: raise ValueError('Plan regional legs shorter than 1,500 km; split this trip into intermediate stops.')
    margin = max(200., distance * .3)
    span_x, span_y = abs(ex) + 2 * margin, abs(ey) + 2 * margin
    limit = 450 if detail == 'detailed' else 240
    spacing = max(2. if detail == 'detailed' else 10., max(span_x, span_y) / limit)
    xs = np.unique(np.r_[np.linspace(min(0, ex)-margin, max(0, ex)+margin, math.ceil(span_x/spacing)+1), 0., ex])
    ys = np.unique(np.r_[np.linspace(min(0, ey)-margin, max(0, ey)+margin, math.ceil(span_y/spacing)+1), 0., ey])
    # Avoid arbitrarily tiny sliver cells after inserting exact endpoints.
    def clean(axis, anchors):
        return np.array(sorted(set([value for value in axis if all(abs(value-a) > spacing*.2 for a in anchors)] + list(anchors))))
    xs, ys = clean(xs, (0., ex)), clean(ys, (0., ey))
    longitude, latitude = np.meshgrid(lon0 + xs / metres_lon, lat0 + ys / metres_lat)
    if np.max(np.abs(latitude)) > 85: raise ValueError('This corridor reaches the polar region; choose a shorter leg away from the pole.')
    start_index = (int(np.argmin(abs(ys))), int(np.argmin(abs(xs))))
    end_index = (int(np.argmin(abs(ys-ey))), int(np.argmin(abs(xs-ex))))
    return dict(xs=xs, ys=ys, longitude=(longitude+180)%360-180, latitude=latitude,
                start=start_index, end=end_index, spacing=spacing, direct_distance_m=distance)

def terrain_metrics(heights, xs, ys):
    gy, gx = np.gradient(heights, ys, xs)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    # Deviation from neighboring mean distinguishes bumps from planar inclines.
    padded = np.pad(heights, 1, mode='edge')
    mean = sum(padded[dy:dy+heights.shape[0], dx:dx+heights.shape[1]] for dy in range(3) for dx in range(3)) / 9
    roughness = np.abs(heights - mean)
    return slope, roughness

def find_path(heights, sources, xs, ys, start, goal, slope, roughness, slope_limit, slope_weight, rough_weight, cancel, progress=lambda n: None):
    rows, cols = heights.shape
    valid = np.isfinite(heights) & (slope <= slope_limit)
    if not valid[start] or not valid[goal]: return None
    costs = np.full((rows, cols), np.inf); costs[start] = 0
    parents = np.full(rows*cols, -1, dtype=np.int32)
    closed = np.zeros((rows, cols), dtype=bool)
    def heuristic(y, x): return math.hypot(xs[x]-xs[goal[1]], ys[y]-ys[goal[0]])
    heap = [(heuristic(*start), 0., start[0], start[1])]; expanded = 0
    while heap:
        _, cost, y, x = heapq.heappop(heap)
        if closed[y, x]: continue
        if expanded % 512 == 0:
            if cancel.is_set(): raise InterruptedError('Route planning canceled.')
            progress(expanded)
        if (y, x) == goal:
            indices = [y*cols+x]
            while indices[-1] != start[0]*cols+start[1]: indices.append(int(parents[indices[-1]]))
            return [divmod(index, cols) for index in reversed(indices)]
        closed[y, x] = True; expanded += 1
        for dy, dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            yy, xx = y+dy, x+dx
            if not (0 <= yy < rows and 0 <= xx < cols) or closed[yy,xx] or not valid[yy,xx]: continue
            # Do not cut across blocked corners or uncorrected source seams.
            if sources[yy,xx] != sources[y,x]: continue
            if dx and dy and (not valid[y,xx] or not valid[yy,x] or sources[y,xx] != sources[y,x] or sources[yy,x] != sources[y,x]): continue
            ground = math.hypot(xs[xx]-xs[x], ys[yy]-ys[y])
            dz = heights[yy,xx]-heights[y,x]
            edge_slope = math.degrees(math.atan2(abs(dz), ground))
            if edge_slope > slope_limit: continue
            risk = (max(slope[y,x], slope[yy,xx], edge_slope) / slope_limit)**2
            bump = max(roughness[y,x], roughness[yy,xx]) / ground
            step = math.hypot(ground, dz) * (1 + slope_weight*risk + rough_weight*bump)
            candidate = cost + step
            if candidate < costs[yy,xx]:
                costs[yy,xx] = candidate; parents[yy*cols+xx] = y*cols+x
                heapq.heappush(heap, (candidate+heuristic(yy,xx), candidate, yy, xx))
    return None

def summarize(path, grid, heights, radii, sources, slope, roughness):
    y, x = np.array(path).T
    dx, dy, dz = np.diff(grid['xs'][x]), np.diff(grid['ys'][y]), np.diff(heights[y,x])
    ground = np.hypot(dx, dy)
    edges = np.degrees(np.arctan2(np.abs(dz), ground))
    return dict(distance_m=round(float(np.hypot(ground, dz).sum()), 2), ascent_m=round(float(np.maximum(dz,0).sum()), 2),
        descent_m=round(float(np.maximum(-dz,0).sum()), 2), max_slope_deg=round(float(max(np.max(slope[y,x]), np.max(edges, initial=0))), 2),
        mean_slope_deg=round(float(np.mean(slope[y,x])), 2), max_roughness_m=round(float(np.max(roughness[y,x])), 2),
        source_ids=[int(s) for s in np.unique(sources[y,x])],
        points=[[round(float(grid['longitude'][yy,xx]),7), round(float(grid['latitude'][yy,xx]),7), round(float(radii[yy,xx]),3)] for yy,xx in path])

def plan_routes(store, request, cancel, report):
    start = time.monotonic()
    report(2, 'Preparing regional elevation corridor')
    grid = corridor(request['start'], request['destination'], request['detail'])
    shape = grid['longitude'].shape; count = grid['longitude'].size
    heights, radii, sources = np.empty(count), np.empty(count), np.empty(count, dtype=np.uint16)
    for index in range(0, count, 4096):
        if cancel.is_set(): raise InterruptedError('Route planning canceled.')
        stop = min(count, index+4096)
        h, r, s = store.sample(grid['longitude'].ravel()[index:stop], grid['latitude'].ravel()[index:stop])
        heights[index:stop], radii[index:stop], sources[index:stop] = h, r, s
        report(5 + int(35 * stop/count), f'Loading source elevations · {stop:,}/{count:,} samples')
    heights, radii, sources = heights.reshape(shape), radii.reshape(shape), sources.reshape(shape)
    report(42, 'Measuring slopes and local relief')
    slope, roughness = terrain_metrics(heights, grid['xs'], grid['ys'])
    routes, seen = [], {}
    for index, (name, limit, slope_weight, rough_weight) in enumerate(PROFILES):
        limit = min(limit, request['max_slope_deg'])
        def progress(expanded): report(45 + index*17, f'Calculating {name} route · {expanded:,} terrain cells explored')
        progress(0)
        path = find_path(heights, sources, grid['xs'], grid['ys'], grid['start'], grid['end'], slope, roughness, limit, slope_weight, rough_weight, cancel, progress)
        if path is None:
            routes.append(dict(id=name, status='unavailable', slope_limit_deg=limit,
                reason=f'No route in this corridor below {limit:g}° without crossing blocked terrain or a source seam.'))
        else:
            key = tuple(path)
            route = dict(id=name, status='ready', slope_limit_deg=limit, **summarize(path, grid, heights, radii, sources, slope, roughness))
            if key in seen: route['same_as'] = seen[key]
            seen[key] = name; routes.append(route)
    metadata = [store.source_by_id[int(identifier)] for identifier in np.unique(sources)]
    coarse = max(item.get('prepared_resolution_m', 14818) for item in metadata)
    warnings = ['DEM-only route comparison, not a verified rover driving plan. Rocks, sand, wheel traps and soil strength are not modeled.',
        'Search is limited to the displayed regional corridor. No path here does not prove no path exists elsewhere.',
        'Mixed-source vertical offsets are uncorrected; source-boundary crossings are blocked.',
        f'Coarsest source in this corridor: {coarse:g} m. Hazards smaller than source and planning spacing can be missed.']
    if grid['spacing'] < coarse: warnings.append('The planning grid oversamples some source data; extra nodes do not add measured detail.')
    for source in metadata:
        warnings.extend(f'{source["name"]}: {limitation}' for limitation in source.get('limitations', []))
    return dict(routes=routes, revision=store.revision, sources=metadata, warnings=warnings,
        grid=dict(rows=shape[0], cols=shape[1], spacing_m=round(grid['spacing'],2), cells=count,
            bounds=[float(grid['longitude'].min()),float(grid['latitude'].min()),float(grid['longitude'].max()),float(grid['latitude'].max())]),
        direct_distance_m=grid['direct_distance_m'], elapsed_seconds=round(time.monotonic()-start, 2),
        start=request['start'], destination=request['destination'])

def routes_router(store):
    api = APIRouter(prefix='/routes')
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='terrain-route')
    lock, jobs = threading.Lock(), {}
    def snapshot(job): return {key: copy.deepcopy(value) for key,value in job.items() if key not in ('cancel','created')}
    def run(identifier, request):
        def report(progress, message):
            with lock:
                jobs[identifier].update(status='processing', progress=progress, message=message)
        try:
            with lock: canceled = jobs[identifier]['cancel']
            result = plan_routes(store, request, canceled, report)
            with lock:
                if canceled.is_set(): jobs[identifier].update(status='canceled', message='Planning canceled.')
                else: jobs[identifier].update(status='complete', progress=100, message='Terrain analysis complete.', result=result)
        except InterruptedError:
            with lock: jobs[identifier].update(status='canceled', message='Planning canceled.')
        except Exception as error:
            with lock: jobs[identifier].update(status='failed', message=str(error))
    @api.post('', status_code=202)
    def create(request: RouteRequest):
        if not store.ready: raise HTTPException(503, 'Prepared terrain data is unavailable.')
        payload = request.model_dump()
        try: corridor(payload['start'], payload['destination'], payload['detail'])
        except ValueError as error: raise HTTPException(422, str(error))
        with lock:
            for identifier in list(jobs):
                if jobs[identifier]['status'] in ('complete','failed','canceled') and time.monotonic()-jobs[identifier]['created'] > 1800: del jobs[identifier]
            if sum(job['status'] in ('queued','processing') for job in jobs.values()) >= 3: raise HTTPException(429, 'Planner busy. Wait for a job or cancel one before starting another.')
            if len(jobs) >= 20:
                completed = [key for key,value in jobs.items() if value['status'] in ('complete','failed','canceled')]
                if completed: del jobs[completed[0]]
            identifier = uuid.uuid4().hex
            jobs[identifier] = dict(id=identifier, status='queued', progress=0, message='Queued for terrain analysis', cancel=threading.Event(), created=time.monotonic())
            response = snapshot(jobs[identifier])
        executor.submit(run, identifier, payload)
        return response
    @api.get('/{identifier}')
    def get(identifier: str):
        with lock:
            if identifier not in jobs: raise HTTPException(404, 'Planning job expired or API restarted. Start a new analysis.')
            return snapshot(jobs[identifier])
    @api.delete('/{identifier}')
    def cancel(identifier: str):
        with lock:
            if identifier not in jobs: raise HTTPException(404, 'Planning job not found.')
            job = jobs[identifier]
            if job['status'] in ('queued','processing'):
                job['cancel'].set(); job.update(message='Cancellation requested…')
            return snapshot(job)
    return api
