import * as THREE from 'three';
import { tracingGeometry } from './trace-mask.js';

export const RAYTRACE_SAMPLE_LIMIT = 256;

// Keep compositing the finished image, but stop expensive tracing work.
// A queued scene/camera/light reset must be allowed through even at the cap.
export function advanceRaytrace(tracer, invalidated = false) {
  tracer.pausePathTracing = !invalidated && tracer.samples >= RAYTRACE_SAMPLE_LIMIT;
  tracer.renderSample();
}

export function createGlobeRaytrace(renderer, scene, camera, getState) {
  const button=document.querySelector('#raytrace-toggle');
  const status=document.createElement('p'); status.className='subtitle';status.hidden=true;
  document.querySelector('header').appendChild(status);
  let enabled=false,tracer,building=false,version='',snapshot,traceCamera,origin=new THREE.Vector3();
  const previousPosition=new THREE.Vector3(Infinity,0,0),previousRotation=new THREE.Quaternion();
  let lastLight='',lastProjection='';
  const bufferSize=new THREE.Vector2();
  function disposeSnapshot(){if(snapshot)snapshot.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  async function build(state,key){
    building=true; status.textContent='Ray trace · preparing globe geometry…';
    try{
      const {WebGLPathTracer}=await import('three-gpu-pathtracer');
      if(!enabled)return;
      disposeSnapshot(); snapshot=new THREE.Scene(); snapshot.background=scene.background;
      origin.copy(state.target); traceCamera=camera.clone();
      function add(mesh,cut){
        if(!mesh||!mesh.visible)return;
        const geom=tracingGeometry(mesh.geometry,cut);
        // Traced materials use source maps, not the raster renderer's RGB tint.
        // Let the tracer generate consistent RGBA attributes for every mesh.
        const source=mesh.material;
        const mat=new THREE.MeshStandardMaterial({map:source.map,color:source.color,roughness:source.roughness,metalness:0,side:THREE.DoubleSide});
        const copy=new THREE.Mesh(geom,mat);copy.position.copy(mesh.position).sub(origin);copy.quaternion.copy(mesh.quaternion);snapshot.add(copy);
      }
      const context=state.context?.mesh.visible?state.context:null;
      add(state.base,context?.data.bounds||state.terrain?.data.bounds);
      add(context?.mesh,state.terrain?.data.bounds); add(state.terrain?.mesh);
      for(const light of scene.children.filter(o=>o.isDirectionalLight)){
        const copy=light.clone();copy.position.copy(light.position).sub(origin);copy.target.position.copy(light.target.position).sub(origin);snapshot.add(copy);snapshot.add(copy.target);
      }
      if(!tracer){tracer=new WebGLPathTracer(renderer);tracer.bounces=3;tracer.renderScale=.65;tracer.tiles.set(2,2);}
      traceCamera.position.copy(camera.position).sub(origin);traceCamera.updateMatrixWorld();
      tracer.setScene(snapshot,traceCamera);version=key;previousPosition.set(Infinity,0,0);
    }catch(error){enabled=false;button.classList.remove('active');button.setAttribute('aria-pressed','false');button.textContent='Ray trace · Unavailable';button.title=error.message;status.textContent=`Ray trace failed: ${error.message}. Click Ray trace to retry.`;console.error(error);}
    finally{building=false;}
  }
  button.addEventListener('click',()=>{enabled=!enabled;button.classList.toggle('active',enabled);button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'Ray trace · On':'Ray trace';status.hidden=!enabled;if(enabled)version='';});
  return {render(){
    if(!enabled)return false;
    const state=getState();if(!state.base)return false;
    const key=[state.base.geometry.uuid,state.terrain?.mesh.geometry.uuid,state.context?.mesh.geometry.uuid,state.context?.mesh.visible].join('/');
    if(key!==version){if(!building)build(state,key);return false;}
    if(building||!tracer)return false;
    let invalidated=false;
    renderer.getDrawingBufferSize(bufferSize);
    const projectionKey=[...camera.projectionMatrix.elements,...bufferSize.toArray()].join(',');
    if(previousPosition.distanceToSquared(camera.position)>1e-14||1-Math.abs(previousRotation.dot(camera.quaternion))>1e-12||projectionKey!==lastProjection){
      traceCamera.copy(camera);traceCamera.position.sub(origin);traceCamera.updateMatrixWorld();tracer.updateCamera();
      previousPosition.copy(camera.position);previousRotation.copy(camera.quaternion);
      lastProjection=projectionKey;invalidated=true;
    }
    const lights=scene.children.filter(o=>o.isDirectionalLight);
    const lightKey=lights.map(l=>[l.intensity,...l.position.toArray(),...l.target.position.toArray()].join(',')).join('/');
    if(lightKey!==lastLight){
      const copies=snapshot.children.filter(o=>o.isDirectionalLight);
      copies.forEach((copy,i)=>{copy.intensity=lights[i].intensity;copy.position.copy(lights[i].position).sub(origin);copy.target.position.copy(lights[i].target.position).sub(origin);});
      snapshot.updateMatrixWorld(true);tracer.updateLights();lastLight=lightKey;invalidated=true;
    }
    advanceRaytrace(tracer,invalidated);
    status.textContent=tracer.isCompiling?'Ray trace · compiling GPU shaders…':tracer.samples>=RAYTRACE_SAMPLE_LIMIT
      ?`Ray trace · ${RAYTRACE_SAMPLE_LIMIT}/${RAYTRACE_SAMPLE_LIMIT} samples · paused until view changes`
      :`Ray trace · ${Math.floor(tracer.samples)}/${RAYTRACE_SAMPLE_LIMIT} samples · hold still to refine`;
    return true;
  }};
}
