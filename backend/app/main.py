"""Versioned terrain API; no synthetic data or upstream requests at request time."""
from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, FastAPI, HTTPException, Path as PathParam, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .terrain import TerrainStore

REPO = Path(__file__).resolve().parents[2]


def create_app(data_root=None):
    store = TerrainStore(Path(data_root or os.environ.get('ARESPATH_DATA_ROOT', str(REPO/'data'))))
    app = FastAPI(title='AresPath Terrain API', version='0.1.0', description='Real Mars terrain coverage and equirectangular tiles. High-resolution coverage is limited to prepared datasets.')
    app.state.terrain = store
    origins=os.environ.get('ARESPATH_CORS_ORIGINS','http://127.0.0.1:5173,http://localhost:5173').split(',')
    app.add_middleware(CORSMiddleware, allow_origins=[origin.strip() for origin in origins if origin.strip()], allow_methods=['GET','POST','DELETE'], allow_headers=['*'])
    api = APIRouter(prefix='/api/v1')
    from .routing import routes_router
    api.include_router(routes_router(store))

    @api.get('/realism/{asset}')
    def realism(asset:Literal['grid','manifest','ortho']):
        name = {'grid':'grid.json','manifest':'manifest.json','ortho':'ortho.jpg'}[asset]
        return file(store.root/'verified_terrain/olympus-scarp'/name)

    @api.get('/sky')
    def sky():
        from .sky import current_sky
        try:
            return current_sky()
        except Exception as error:
            raise HTTPException(503, 'Sky unavailable. Install spiceypy and run python pipeline/prepare_sky.py; check kernel date coverage.') from error

    @api.get('/health')
    def health():
        return {'status':'ready' if store.ready else 'data_missing', 'revision':store.revision, 'prepared_regions':len(store.datasets)}

    @api.get('/catalog')
    def catalog():
        return store.catalog()

    @api.get('/coverage')
    def coverage(longitude:Annotated[float, Query(ge=-180, le=180)], latitude:Annotated[float, Query(ge=-90, le=90)]):
        try:
            return store.coverage(longitude,latitude)
        except FileNotFoundError as error:
            raise HTTPException(503,str(error))

    @api.get('/tiles/{z}/{x}/{y}')
    def tile(request:Request, response:Response, z:Annotated[int,PathParam(ge=0,le=18)],
             x:Annotated[int,PathParam(ge=0)], y:Annotated[int,PathParam(ge=0)], size:Annotated[int,Query(ge=33,le=129)]=65,
             sampling:Literal['native','display']='native'):
        if size not in (33,65,129):
            raise HTTPException(422,'Supported tile grid sizes are 33, 65 and 129')
        if x>=2**z or y>=2**z:
            raise HTTPException(422,'Tile coordinates outside the declared grid')
        etag=f'"{store.revision}-{z}-{x}-{y}-{size}-{sampling}"'
        if not store.ready:
            raise HTTPException(503,'Prepared MOLA terrain missing; run pipeline/stitch_globe.py')
        if request.headers.get('if-none-match')==etag:
            return Response(status_code=304,headers={'ETag':etag,'Cache-Control':'public, max-age=3600'})
        before=store.tile_json.cache_info().hits
        content=store.tile_json(z,x,y,size,sampling)
        headers={
            'ETag': etag,
            'Cache-Control': 'public, max-age=3600',
            'X-Terrain-Cache': 'HIT' if store.tile_json.cache_info().hits>before else 'MISS',
        }
        return Response(content=content, media_type='application/json', headers=headers)

    def file(path, media_type=None):
        if not path.is_file():
            raise HTTPException(404,'Prepared asset is not available')
        return FileResponse(path,media_type=media_type)

    @api.get('/globe/manifest')
    def globe_manifest():
        if not store.globe_manifest:
            raise HTTPException(503,'Prepared globe manifest missing')
        metadata=copy.deepcopy(store.globe_manifest)
        metadata['revision']=store.revision
        for patch in metadata['patches']:
            patch['grid']=f'/api/v1/regions/{patch["site"]}/grid'
            if not patch['source_page'].startswith('https://'):
                patch['source_page']=f'/api/v1/regions/{patch["site"]}/manifest'
        return metadata

    @api.get('/globe/{layer}.i16')
    def globe_array(layer:Literal['radius','areoid']):
        return file(store.globe_dir/(layer+'.i16'),'application/octet-stream')

    @api.get('/regions/{site}/{asset}')
    def region_asset(site:Literal['gale','jezero'],asset:Literal['grid','manifest']):
        return file(store.region_dir(site)/(asset+'.json'),'application/json')

    @api.get('/datasets/{dataset_id}/manifest')
    def dataset_manifest(dataset_id:str):
        dataset=next((item for item in store.datasets if item['id']==dataset_id),None)
        if dataset is None:
            raise HTTPException(404,'Prepared dataset is not available')
        return file(dataset['path']/'manifest.json','application/json')

    @api.get('/basemaps/mars-color')
    def basemap():
        return file(REPO/'web/assets/mars_globe_8k.jpg','image/jpeg')

    app.include_router(api)
    # Optional same-origin production host; the two source apps stay separate.
    dist=REPO/'frontend/dist'
    if dist.exists():
        app.mount('/',StaticFiles(directory=dist,html=True),name='frontend')
    return app


app=create_app()
