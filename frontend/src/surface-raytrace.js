import * as THREE from 'three';
import { tracingGeometry } from './trace-mask.js';
import { surfaceTracingGeometry, SURFACE_CINEMATIC } from './surface-cinematic.js';
import { SCALE } from './globe-math.js';

// Owns the prepared scene and GPU accumulation buffers for one viewpoint.
export function createSurfaceRaytrace(renderer, onStatus) {
  let tracer, snapshot, traceCamera, environment, worker, disposed = false, prepared = false;
  const origin = new THREE.Vector3(), lastPosition = new THREE.Vector3(Infinity, 0, 0);
  const lastRotation = new THREE.Quaternion(), size = new THREE.Vector2();
  let lastProjection = '';
  function release() {
    // 0.0.23 renamed its quad but its public disposer still references the old
    // member. Keep this compatibility fix local to the installed version.
    if (tracer) {
      const material = tracer._pathTracer?.material;
      for (const key of ['bvh', 'attributesArray', 'materialIndexAttribute', 'materials', 'textures', 'iesProfiles', 'envMapInfo', 'stratifiedTexture', 'stratifiedOffsetTexture'])
        material?.[key]?.dispose?.();
      material?.lights?.tex?.dispose();
      if (!tracer._renderQuad && tracer._quad) tracer._renderQuad = tracer._quad;
      tracer.dispose(); tracer._lowResPathTracer?.dispose();
      tracer._pathTracer?.material?.dispose(); tracer._internalBackground?.dispose();
      tracer._generator?.geometry?.dispose(); tracer = null;
    }
    snapshot?.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); mesh.material.dispose(); } });
    snapshot = null; environment?.dispose(); environment = null;
  }
  return {
    async prepare({ camera, surfaces, base, bounds, light, normal, raster, signal }) {
      const { WebGLPathTracer, GradientEquirectTexture } = await import('three-gpu-pathtracer');
      const { GenerateMeshBVHWorker } = await import('three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js');
      const check = () => { if (disposed || signal.aborted) throw new DOMException('Surface tracing canceled', 'AbortError'); };
      check(); origin.copy(camera.position); snapshot = new THREE.Scene();
      environment = new GradientEquirectTexture(128);
      const direction = new THREE.Vector3(), horizon = new THREE.Color(.64, .43, .28), zenith = new THREE.Color(.22, .12, .08);
      environment.generationCallback = (polar, uv, coord, color) => {
        direction.setFromSpherical(polar);
        color.copy(horizon).lerp(zenith, Math.pow(Math.max(0, direction.y), .45));
      };
      environment.update(); snapshot.background = environment; snapshot.environment = environment; snapshot.environmentIntensity = .65;
      const skyRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      snapshot.backgroundRotation.setFromQuaternion(skyRotation); snapshot.environmentRotation.setFromQuaternion(skyRotation);
      const ordered = [...surfaces].reverse();
      for (let i = 0; i < ordered.length; i++) {
        onStatus(`Ray tracing · preparing terrain ${i + 1}/${ordered.length}`);
        await new Promise(resolve => requestAnimationFrame(resolve)); check();
        const geometry = surfaceTracingGeometry(ordered[i].data, origin, ordered[i - 1]?.data.bounds, i);
        geometry.scale(1 / SCALE, 1 / SCALE, 1 / SCALE);
        const material = new THREE.MeshStandardMaterial({ map: ordered[i].mesh.material.map, roughness: 1, side: THREE.DoubleSide });
        snapshot.add(new THREE.Mesh(geometry, material));
      }
      const geometry = tracingGeometry(base.geometry, bounds);
      geometry.translate(-origin.x, -origin.y, -origin.z);
      geometry.scale(1 / SCALE, 1 / SCALE, 1 / SCALE);
      snapshot.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: base.material.map, roughness: 1, side: THREE.DoubleSide })));
      const sun = light.clone(); sun.position.sub(origin).multiplyScalar(1 / SCALE); sun.target = new THREE.Object3D(); sun.target.position.copy(light.target.position).sub(origin).multiplyScalar(1 / SCALE); sun.castShadow = false;
      snapshot.add(sun, sun.target); traceCamera = camera.clone(); traceCamera.position.sub(origin).multiplyScalar(1 / SCALE); traceCamera.near /= SCALE; traceCamera.far /= SCALE; traceCamera.updateProjectionMatrix(); traceCamera.updateMatrixWorld(true);
      tracer = new WebGLPathTracer(renderer); tracer.bounces = SURFACE_CINEMATIC.bounces;
      tracer.renderScale = SURFACE_CINEMATIC.renderScale; tracer.tiles.set(3, 3);
      tracer.textureSize.set(Math.min(8192, renderer.capabilities.maxTextureSize), Math.min(8192, renderer.capabilities.maxTextureSize));
      tracer.rasterizeSceneCallback = raster; tracer.renderDelay = 180; tracer.minSamples = 1; tracer.fadeDuration = 250;
      worker = new GenerateMeshBVHWorker(); tracer.setBVHWorker(worker);
      onStatus('Ray tracing · building terrain acceleration structure…');
      try { await tracer.setSceneAsync(snapshot, traceCamera, { onProgress: p => { if (!disposed) onStatus(`Ray tracing · building terrain ${Math.floor(p * 100)}%`); } }); check(); }
      finally { worker?.dispose(); worker = null; if (disposed || signal.aborted) release(); }
      prepared = true;
    },
    render(camera) {
      if (!prepared || disposed || !tracer) return false;
      renderer.getDrawingBufferSize(size);
      const projection = [...camera.projectionMatrix.elements, ...size.toArray()].join('/');
      const changed = lastPosition.distanceToSquared(camera.position) > 1e-18 || 1 - Math.abs(lastRotation.dot(camera.quaternion)) > 1e-12 || projection !== lastProjection;
      if (changed) {
        traceCamera.copy(camera); traceCamera.position.sub(origin).multiplyScalar(1 / SCALE); traceCamera.near /= SCALE; traceCamera.far /= SCALE; traceCamera.updateProjectionMatrix(); traceCamera.updateMatrixWorld(true); tracer.updateCamera();
        lastPosition.copy(camera.position); lastRotation.copy(camera.quaternion); lastProjection = projection;
      }
      tracer.pausePathTracing = !changed && tracer.samples >= SURFACE_CINEMATIC.samples;
      tracer.renderSample();
      onStatus(tracer.isCompiling ? 'Ray tracing · compiling GPU shaders…' : `Ray tracing · ${Math.floor(tracer.samples)}/${SURFACE_CINEMATIC.samples} samples · ${tracer.samples >= SURFACE_CINEMATIC.samples ? 'converged' : 'hold still to refine'}`);
      return true;
    },
    dispose() { disposed = true; prepared = false; if (!worker) release(); },
  };
}
