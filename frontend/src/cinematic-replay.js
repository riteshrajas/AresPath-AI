import * as THREE from 'three';
import { TerrainClient } from './terrain-client.js';
import { assembleTerrainWindow } from './terrain-window.js';
import { replayPlan, sampleReplayRadius } from './cinematic-path.js';
import { replayCache } from './cinematic-cache.js';
import { SCALE, sampleMola } from './globe-math.js';
import './cinematic-replay.css';

const aborted=()=>new DOMException('Replay canceled','AbortError');
function workerTask(worker,payload,signal) {
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{worker.removeEventListener('message',message);worker.removeEventListener('error',error);signal.removeEventListener('abort',cancel);};
    const message=event=>{cleanup();event.data.error?reject(Error(event.data.error)):resolve(event.data);};
    const error=event=>{cleanup();reject(Error(event.message||'Terrain worker failed.'));};
    const cancel=()=>{cleanup();reject(aborted());};
    if(signal.aborted)return cancel();
    worker.addEventListener('message',message);worker.addEventListener('error',error);signal.addEventListener('abort',cancel,{once:true});worker.postMessage(payload);
  });
}

export function createCinematicReplay({api,renderer,camera,getGlobe,onBegin,onWindow,onPose,onEnd}) {
  const hud=document.createElement('section');hud.className='cinematic-hud';hud.hidden=true;hud.setAttribute('aria-label','Cinematic Replay');
  hud.innerHTML=`<div class="cinematic-title"><span>CINEMATIC REPLAY</span><button type="button" class="cinematic-stop">Stop / Cancel</button></div><p class="cinematic-status" role="status" aria-live="polite"></p><progress max="100" value="0"></progress><div class="cinematic-transport" hidden><button type="button" class="cinematic-pause">Pause</button><input type="range" min="0" max="1000" value="0" step="1" aria-label="Replay position"><select aria-label="Replay speed"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select><output class="cinematic-time"></output></div><small class="cinematic-quality"></small>`;
  document.body.appendChild(hud);
  const curtain=document.createElement('div');curtain.className='cinematic-curtain';document.body.appendChild(curtain);
  const status=hud.querySelector('.cinematic-status'),progress=hud.querySelector('progress'),transport=hud.querySelector('.cinematic-transport'),slider=hud.querySelector('input'),pause=hud.querySelector('.cinematic-pause'),quality=hud.querySelector('small'),time=hud.querySelector('output');
  let job,serial=0,elapsed=0,lastTime,paused=false,speed=1,frame,currentKey,pendingKey,pixelRatio,lastPose;
  const normal=new THREE.Vector3(),tangent=new THREE.Vector3(),position=new THREE.Vector3(),target=new THREE.Vector3();
  function check(current){if(current!==job||current.controller.signal.aborted)throw aborted();}
  function cleanup(current){current.controller.abort();current.worker?.terminate();current.cache?.close();}
  function finish(message='Replay stopped.',completed=false) {
    const current=job;if(!current)return;
    const wasActive=current.active;job=null;serial++;cleanup(current);
    if(wasActive){renderer.setPixelRatio(pixelRatio);renderer.setSize(innerWidth,innerHeight);onEnd(lastPose,completed);}
    frame=null;currentKey=pendingKey=null;lastTime=undefined;
    document.body.classList.remove('cinematic-playing');curtain.classList.remove('cover');
    transport.hidden=true;progress.hidden=true;status.textContent=message;hud.querySelector('.cinematic-stop').textContent='Close';
  }
  const cancel=()=>{if(job)finish();else hud.hidden=true;};
  hud.querySelector('.cinematic-stop').addEventListener('click',cancel);
  pause.addEventListener('click',()=>{paused=!paused;pause.textContent=paused?'Resume':'Pause';lastTime=undefined;});
  slider.addEventListener('input',()=>{if(!job?.active)return;elapsed=Number(slider.value)/1000*job.plan.duration;lastTime=undefined;});
  hud.querySelector('select').addEventListener('change',event=>{speed=Number(event.target.value);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&job){event.preventDefault();cancel();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&job?.active){paused=true;pause.textContent='Resume';lastTime=undefined;}});
  addEventListener('pagehide',()=>{if(job)finish('Replay stopped while leaving this page.');});
  async function loadFrame(current,key) {
    pendingKey=key;
    try {
      const snapshot=await current.cache.get('frame/'+key);check(current);
      if(!snapshot)throw Error('A prepared terrain section is missing. Prepare the replay again.');
      if(pendingKey!==key)return;
      onWindow(snapshot);frame=snapshot.data;currentKey=key;pendingKey=null;lastTime=undefined;
    } catch(error){if(job===current&&error.name!=='AbortError')finish(`Replay stopped: ${error.message}`);}
  }
  async function start(route,result) {
    if(job)finish('Preparing another replay…');
    const current={controller:new AbortController(),active:false,id:++serial};job=current;
    elapsed=0;paused=false;lastTime=undefined;frame=null;currentKey=pendingKey=null;lastPose=null;
    hud.hidden=false;transport.hidden=true;progress.hidden=false;progress.value=0;quality.textContent='';hud.querySelector('.cinematic-stop').textContent='Cancel preparation';status.textContent='Checking source coverage and planning HD terrain sections…';
    const signal=current.controller.signal;
    try {
      const globe=getGlobe();if(!globe?.grid)throw Error('Wait for the Mars globe to finish loading, then replay again.');
      const plan=replayPlan(route,result);current.plan=plan;
      const catalog=await api.json('/api/v1/catalog',signal);check(current);
      if(catalog.revision!==result.revision)throw Error('Terrain data changed. Recalculate your route before replaying it.');
      const estimate=await navigator.storage?.estimate?.();check(current);
      const required=plan.windows.size*17000000+plan.tiles.size*800000;
      if(estimate?.quota && estimate.quota-estimate.usage<required)throw Error(`Not enough browser storage for this HD corridor (about ${Math.ceil(required/1e6)} MB). Choose a shorter route or free storage.`);
      current.cache=await replayCache(`arespath-cinematic-${Date.now()}-${current.id}`);check(current);
      current.worker=new Worker(new URL('./cinematic-worker.js',import.meta.url),{type:'module'});
      await workerTask(current.worker,{globe},signal);check(current);
      const fetcher=new TerrainClient(api.base),tiles=[...plan.tiles.entries()];let cursor=0,done=0,cells=0;
      quality.textContent=`${plan.sources.map(s=>s.name).join(' · ')} · best prepared source ${plan.resolution} m · native 129×129 tile grids`;
      await Promise.all(Array.from({length:3},async()=>{
        while(cursor<tiles.length){check(current);const [key,tile]=tiles[cursor++];
          const data=await fetcher.tile(tile.z,tile.x,tile.y,tile.size||129,signal,'native');check(current);
          if(data.revision!==result.revision)throw Error('Terrain changed during preparation. Recalculate the route.');
          await current.cache.put('tile/'+key,data);check(current);fetcher.cache.clear();done++;cells+=(tile.size||129)**2;
          progress.value=done/tiles.length*55;status.textContent=`Preparing elevation cells · ${done}/${tiles.length} tiles · ${cells.toLocaleString()} cells loaded`;
        }
      }));
      let built=0;
      for(const [key,window] of plan.windows){
        check(current);status.textContent=`Processing every terrain cell · section ${built+1}/${plan.windows.size} · normals and valley shading`;
        const values=await Promise.all(window.tiles.map(tile=>current.cache.get(`tile/${tile.z}/${tile.x}/${tile.y}`)));check(current);
        const data=assembleTerrainWindow(window,values,(lon,lat)=>sampleMola(globe.grid,globe.width,globe.height,lon,lat,globe.offset));
        let contextData;
        if(window.context){const contextTiles=await Promise.all(window.context.tiles.map(tile=>current.cache.get(`tile/${tile.z}/${tile.x}/${tile.y}`)));check(current);contextData=assembleTerrainWindow(window.context,contextTiles);}
        const {snapshot}=await workerTask(current.worker,{data,contextData},signal);check(current);
        await current.cache.put('frame/'+key,snapshot);check(current);built++;progress.value=55+built/plan.windows.size*45;
      }
      current.worker.terminate();current.worker=null;
      status.textContent='All route terrain sections prepared. Starting replay…';progress.value=100;curtain.classList.add('cover');
      await new Promise(resolve=>setTimeout(resolve,350));check(current);
      const first=await current.cache.get('frame/'+plan.sequence[0].key);check(current);
      if(!first)throw Error('Prepared start terrain is missing.');
      onBegin();current.active=true;pixelRatio=renderer.getPixelRatio();renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
      onWindow(first);frame=first.data;currentKey=plan.sequence[0].key;
      transport.hidden=false;progress.hidden=true;pause.textContent='Pause';hud.querySelector('.cinematic-stop').textContent='Stop replay';
      document.body.classList.add('cinematic-playing');
      requestAnimationFrame(()=>{if(job===current)curtain.classList.remove('cover');});
    }catch(error){
      if(job===current){finish(error.name==='AbortError'?'Replay canceled.':`Could not prepare replay: ${error.message}`);}
      else cleanup(current);
    }
  }
  return {start,cancel:()=>{if(job)finish();},get active(){return !!job?.active;},get busy(){return !!job;},update(now){
    const current=job;if(!current?.active||!frame)return;
    const plan=current.plan;
    const dt=lastTime===undefined?0:Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;
    const proposed=Math.min(plan.duration,elapsed+(paused?0:dt*speed));
    const distance=proposed/plan.duration*plan.track.total,key=plan.frameKey(distance);
    if(key!==currentKey){elapsed=proposed;if(pendingKey!==key)loadFrame(current,key);status.textContent='Loading a prepared HD terrain section…';lastTime=undefined;return;}
    pendingKey=null;
    elapsed=proposed;
    const point=plan.track.at(distance),ahead=plan.track.at(Math.min(plan.track.total,distance+plan.altitude*.8)),behind=plan.track.at(Math.max(0,distance-plan.altitude*.8));
    normal.copy(point.normal);tangent.copy(ahead.position).sub(behind.position).addScaledVector(normal,-ahead.position.clone().sub(behind.position).dot(normal));
    if(tangent.lengthSq()<1e-12)tangent.crossVectors(new THREE.Vector3(0,1,0),normal);tangent.normalize();
    const ground=sampleReplayRadius(frame,point.longitude,point.latitude)??point.radius;
    position.copy(normal).multiplyScalar(ground*SCALE).addScaledVector(tangent,-plan.altitude*SCALE*.9).addScaledVector(normal,plan.altitude*SCALE);
    const cameraNormal=position.clone().normalize();const lon=Math.atan2(-cameraNormal.z,cameraNormal.x)*180/Math.PI,lat=Math.asin(cameraNormal.y)*180/Math.PI;
    const underCamera=sampleReplayRadius(frame,lon,lat);
    if(underCamera!==null&&position.length()<(underCamera+20)*SCALE)position.setLength((underCamera+20)*SCALE);
    target.copy(normal).multiplyScalar(ground*SCALE).addScaledVector(tangent,Math.min(plan.altitude*.35,plan.track.total-distance)*SCALE);
    camera.position.copy(position);camera.up.copy(normal);camera.lookAt(target);camera.updateMatrixWorld(true);
    lastPose={longitude:point.longitude,latitude:point.latitude,target:target.clone()};
    onPose(lastPose);
    slider.value=String(Math.round(elapsed/plan.duration*1000));time.value=`${Math.floor(elapsed)} / ${Math.round(plan.duration)} s`;
    status.textContent=`${paused?'Paused':'Following route'} · ${Math.round(distance/plan.track.total*100)}% · ${plan.windows.size} HD sections prepared`;
    if(elapsed>=plan.duration)finish('Cinematic Replay complete — destination reached.',true);
  }};
}
