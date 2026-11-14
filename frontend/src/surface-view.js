import * as THREE from 'three';
import { SCALE } from './globe-math.js';
import { fetchTerrainWindow } from './terrain-window.js';
import { createTerrainSurface, contextRadiusAt } from './terrain-surface.js';
import { marsMaterial } from './mars-material.js';
import { renderRelative } from './render-relative.js';
import { planSurfaceView } from './surface-view-plan.js';
import { applySurfaceCinematic, surfaceEyePosition, SURFACE_EYE_HEIGHT } from './surface-cinematic.js';
import { createSurfaceRaytrace } from './surface-raytrace.js';
import './surface-view.css';

function naturalSurface(material) {
  const compile = material.onBeforeCompile;
  const programKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => `${programKey}/surface-natural`;
  material.onBeforeCompile = shader => {
    compile(shader);
    // The immersive view has its own imagery presentation; map analysis
    // preferences remain intact when returning to the globe.
    for (const key of ['terrainMode', 'contoursEnabled', 'steepEnabled', 'seamsEnabled', 'graticuleEnabled'])
      shader.uniforms[key] = { value: 0 };
    shader.uniforms.basemapEnabled = { value: 1 };
    shader.uniforms.terrainShading = { value: 1 };
  };
}

export function createSurfaceView({ api, renderer, camera, pick, getAssets, isBusy, onLock }) {
  const launch = document.createElement('div'); launch.className = 'surface-launch';
  launch.innerHTML = `<button type="button" class="surface-button" aria-label="Choose a point for a 360 degree surface view" title="Stand on Mars · 360° surface view" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4" r="2.3"/><path d="M5 9l7-2 7 2M12 7v7m-4 7 4-7 4 7"/></svg></button><span>SURFACE 360°</span>`;
  document.querySelector('.navigation-tools').before(launch);
  const button = launch.querySelector('button');
  const hint = document.createElement('div'); hint.className = 'surface-pick'; hint.hidden = true; hint.setAttribute('role', 'status');
  hint.textContent = 'Choose your viewpoint: click a point on Mars. Press Esc to cancel.'; document.body.append(hint);
  const dialog = document.createElement('dialog'); dialog.className = 'surface-dialog'; dialog.setAttribute('aria-label', 'Mars 360 degree surface simulation');
  dialog.innerHTML = `<div class="surface-viewport"></div><div class="surface-toolbar"><div><h2>ON THE SURFACE <span aria-hidden="true"> / 360°</span></h2><p class="surface-meta"></p><p class="surface-render-status" role="status">Cinematic</p></div><button type="button" class="surface-close">Back to map</button></div><div class="surface-help"><output class="surface-bearing"></output>Drag or use arrow keys to look around · Scroll to zoom · Esc to leave</div><section class="surface-loading" aria-label="Preparing surface view"><article><span class="surface-eyebrow">ARESPATH / SURFACE SIMULATION</span><h3>Step onto Mars.</h3><p>Preparing terrain in every direction, from the ground beneath you to the distant horizon.</p><progress max="100" value="0" aria-label="Terrain loading progress"></progress><div class="surface-progress"><span role="status" aria-live="polite"></span><output>0%</output></div><p class="surface-detail">Checking available elevation sources…</p><button type="button" class="surface-retry" hidden>Retry viewpoint</button><button type="button" class="surface-cancel">Cancel</button></article></section>`;
  document.body.append(dialog);
  const viewport = dialog.querySelector('.surface-viewport'), loading = dialog.querySelector('.surface-loading');
  const progress = dialog.querySelector('progress'), status = dialog.querySelector('.surface-progress [role=status]');
  const renderStatus = dialog.querySelector('.surface-render-status');
  const detail = dialog.querySelector('.surface-detail'), retry = dialog.querySelector('.surface-retry');
  const canvas = renderer.domElement, home = canvas.parentNode;
  let selecting = false, active = false, ready = false, controller, scene, viewCamera, point;
  let surfaces = [], globeMaterial, sky, heading = 0, pitch = 0, drag, previousFocus, oldPixelRatio;
  let normal, north, east;
  let raytrace, restoreCinematic, shadowLight;
  const keys = new Set();
  function stopPicking() {
    selecting = false; hint.hidden = true; button.setAttribute('aria-pressed', 'false'); canvas.style.cursor = ''; onLock(false);
  }
  function dispose() {
    raytrace?.dispose(); raytrace = null; shadowLight?.shadow.dispose(); shadowLight = null;
    for (const surface of surfaces) { surface.mesh.geometry.dispose(); surface.mesh.material.dispose(); }
    surfaces = []; globeMaterial?.dispose(); globeMaterial = null; scene = null; viewCamera = null;
    sky?.geometry.dispose(); sky?.material.dispose(); sky = null;
  }
  function close() {
    controller?.abort(); ready = false; active = false; keys.clear(); drag = null; dispose();
    if (canvas.parentNode === viewport) home.append(canvas);
    if (oldPixelRatio !== undefined) renderer.setPixelRatio(oldPixelRatio);
    restoreCinematic?.(); restoreCinematic = null;
    renderer.setSize(innerWidth, innerHeight); dialog.close(); onLock(false); previousFocus?.focus();
  }
  dialog.querySelector('.surface-close').onclick = close;
  dialog.querySelector('.surface-cancel').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  retry.onclick = () => load(point);
  button.onclick = () => {
    if (selecting) { stopPicking(); return; }
    if (isBusy() || !getAssets()) return;
    hint.textContent = 'Choose your viewpoint: click a point on Mars. Press Esc to cancel.';
    selecting = true; onLock(true); hint.hidden = false; button.setAttribute('aria-pressed', 'true'); canvas.style.cursor = 'crosshair';
  };
  addEventListener('keydown', event => { if (event.key === 'Escape' && selecting) stopPicking(); });
  // Capture selection before orbit, routing, or double-click exploration.
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick']) canvas.addEventListener(type, event => {
    if (!selecting) return;
    event.stopImmediatePropagation(); event.preventDefault();
    if (type !== 'click' || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
    const hit = pick(ray.ray);
    if (!hit) { hint.textContent = 'Click the Martian surface to choose a viewpoint. Esc to cancel.'; return; }
    stopPicking(); previousFocus = button; oldPixelRatio = renderer.getPixelRatio();
    active = true; onLock(true); viewport.append(canvas); dialog.showModal(); load(hit);
    restoreCinematic = applySurfaceCinematic(renderer);
  }, true);

  function report(done, total, message) {
    const percent = Math.floor(done / total * 95);
    progress.value = percent; dialog.querySelector('.surface-progress output').textContent = `${percent}%`; status.textContent = message;
  }
  async function load(location) {
    controller?.abort(); controller = new AbortController(); const signal = controller.signal;
    dispose(); point = location; ready = false; loading.hidden = false; retry.hidden = true;
    dialog.querySelector('.surface-meta').textContent = '';
    dialog.querySelector('.surface-bearing').textContent = '';
    renderStatus.textContent = 'Cinematic · preparing terrain';
    progress.value = 0; status.textContent = 'Finding the best source…'; detail.textContent = 'Checking available elevation sources…';
    dialog.querySelector('.surface-progress output').textContent = '0%';
    try {
      const assets = getAssets();
      const coverage = await api.coverage(point.longitude, point.latitude, signal);
      if (signal.aborted) return;
      const source = coverage.selected_source;
      const resolution = source.prepared_resolution_m;
      const plans = planSurfaceView(point.longitude, point.latitude, resolution);
      const total = plans.reduce((sum, plan) => sum + plan.tiles.length, 0); let completed = 0;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#b68a71');
      const hemisphere = new THREE.HemisphereLight(0xffe1c3, 0x523629, .65);
      scene.add(hemisphere, new THREE.AmbientLight(0xffe8d5, .28));
      const light = new THREE.DirectionalLight(0xfff0df, 2.8); scene.add(light); scene.add(light.target);
      // Build outside-in so every collar samples the next wider measured DEM.
      let outer = null;
      for (const plan of [...plans].reverse()) {
        detail.textContent = `360° coverage · level ${plan.z} · maximum 129 × 129 samples per tile`;
        const before = completed;
        const data = await fetchTerrainWindow(api, plan, signal, done => report(before + done, total, `${before + done} / ${total} tiles loaded`));
        if (signal.aborted) return;
        status.textContent = 'Building terrain and surface lighting…';
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (signal.aborted) return;
        const parent = outer;
        const radiusAt = parent ? (lon, lat) => contextRadiusAt(parent.data, lon, lat, assets.radiusAt) : assets.radiusAt;
        const index = plans.indexOf(plan), inner = plans[index - 1];
        const surface = createTerrainSurface(data, assets.texture, radiusAt, inner ? new THREE.Vector4(...inner.bounds) : null);
        naturalSurface(surface.mesh.material);
        surfaces.push(surface); scene.add(surface.mesh); outer = surface; completed += plan.tiles.length;
      }
      globeMaterial = marsMaterial(assets.texture);
      const compile = globeMaterial.onBeforeCompile, bounds = plans.at(-1).bounds;
      globeMaterial.onBeforeCompile = shader => {
        compile(shader); shader.uniforms.surfaceBounds = { value: new THREE.Vector4(...bounds) };
        shader.fragmentShader = 'uniform vec4 surfaceBounds;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float lon=vMapUv.x*360.0-180.0, lat=vMapUv.y*180.0-90.0;
          float mid=(surfaceBounds.x+surfaceBounds.z)*0.5;
          lon=mid+mod(lon-mid+540.0,360.0)-180.0;
          if(lon>surfaceBounds.x && lon<surfaceBounds.z && lat>surfaceBounds.y && lat<surfaceBounds.w) discard;`);
      };
      naturalSurface(globeMaterial);
      const globe = new THREE.Mesh(assets.geometry, globeMaterial); scene.add(globe);
      viewCamera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, .02 * SCALE, 1000);
      viewCamera.position.copy(surfaceEyePosition(outer.mesh, point.longitude, point.latitude));
      normal = viewCamera.position.clone().normalize();
      hemisphere.position.copy(normal);
      const lon = point.longitude * Math.PI / 180;
      east = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon)); north = new THREE.Vector3().crossVectors(normal, east).normalize();
      // Illustrative dusty sky, with a brighter horizon and darker zenith.
      sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { zenith: { value: normal } },
        vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: 'varying vec3 direction; uniform vec3 zenith; void main(){float h=max(0.0,dot(normalize(direction),zenith));vec3 color=mix(vec3(0.64,0.43,0.28),vec3(0.22,0.12,0.08),pow(h,0.45));gl_FragColor=vec4(color,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      }));
      sky.position.copy(viewCamera.position); sky.renderOrder = -1; scene.add(sky);
      light.position.copy(viewCamera.position).addScaledVector(normal, 1500 * SCALE).addScaledVector(north, 3000 * SCALE).addScaledVector(east, -2000 * SCALE);
      light.target.position.copy(viewCamera.position);
      light.castShadow = true; light.shadow.mapSize.set(4096, 4096);
      const shadowExtent = 600 * SCALE;
      Object.assign(light.shadow.camera, { left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent, near: .01 * SCALE, far: 10000 * SCALE });
      light.shadow.camera.updateProjectionMatrix(); light.shadow.normalBias = .15 * SCALE;
      light.shadow.bias = -.000001; shadowLight = light;
      for (const surface of surfaces) surface.mesh.receiveShadow = true;
      // Parent windows have fragment masks, so only the fine grid casts in
      // raster mode. The traced scene geometrically cuts every parent.
      outer.mesh.castShadow = true; renderer.shadowMap.needsUpdate = true;
      heading = 0; pitch = 0; renderer.setPixelRatio(Math.min(devicePixelRatio, 3)); resize();
      dialog.querySelector('.surface-meta').textContent = `${point.latitude.toFixed(5)}° lat / ${point.longitude.toFixed(5)}° lon · ${SURFACE_EYE_HEIGHT} m above local ground\n${source.name} · ${resolution ?? 'Unknown'} m source resolution at viewpoint\n${total} tiles · Cinematic · illustrative sky and lighting`;
      progress.value = 100; dialog.querySelector('.surface-progress output').textContent = '100%'; status.textContent = 'Terrain ready';
      ready = true; render(); loading.hidden = true; canvas.tabIndex = 0; canvas.focus();
      const tracing = createSurfaceRaytrace(renderer, text => { if (!signal.aborted) renderStatus.textContent = text; });
      raytrace = tracing;
      tracing.prepare({ camera: viewCamera, surfaces, base: globe, bounds, light, normal,
        raster: () => { if (ready && scene && viewCamera) renderRelative(renderer, scene, viewCamera); }, signal,
      }).catch(error => {
        tracing.dispose();
        if (signal.aborted) return;
        if (raytrace === tracing) raytrace = null;
        renderStatus.textContent = `Cinematic shadows · ray tracing unavailable: ${error.message}`;
      });
    } catch (error) {
      if (signal.aborted) return;
      controller.abort(); dispose(); status.textContent = 'Surface view could not load'; detail.textContent = error.message; retry.hidden = false;
    }
  }
  function resize() {
    if (!active || !viewCamera) return;
    viewCamera.aspect = innerWidth / innerHeight; viewCamera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', event => {
    if (!ready || event.button !== 0) return;
    event.stopImmediatePropagation(); event.preventDefault(); canvas.focus(); canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    heading -= (event.clientX - drag.x) * .004; pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * .004, -1.5, 1.5);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { drag = null; });
  canvas.addEventListener('wheel', event => {
    if (!ready) return;
    event.preventDefault(); event.stopImmediatePropagation();
    viewCamera.fov = THREE.MathUtils.clamp(viewCamera.fov + event.deltaY * .025, 25, 100); viewCamera.updateProjectionMatrix();
  }, { passive: false, capture: true });
  dialog.addEventListener('keydown', event => { if (ready && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); keys.add(event.key); } });
  dialog.addEventListener('keyup', event => keys.delete(event.key));
  addEventListener('blur', () => { keys.clear(); drag = null; });
  let previousTime = 0;
  function render(now = performance.now()) {
    if (!active) return false;
    const dt = Math.min(.05, Math.max(0, (now - previousTime) / 1000)); previousTime = now;
    if (!ready || !viewCamera) return true;
    heading += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * dt;
    pitch = THREE.MathUtils.clamp(pitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * dt, -1.5, 1.5);
    const forward = north.clone().multiplyScalar(Math.cos(heading)).addScaledVector(east, Math.sin(heading));
    forward.multiplyScalar(Math.cos(pitch)).addScaledVector(normal, Math.sin(pitch));
    viewCamera.up.copy(normal); viewCamera.lookAt(viewCamera.position.clone().add(forward));
    dialog.querySelector('.surface-bearing').textContent = `${((heading * 180 / Math.PI % 360 + 360) % 360).toFixed(0)}° heading · ${viewCamera.fov.toFixed(0)}° field of view`;
    try {
      if (raytrace?.render(viewCamera)) return true;
    } catch (error) {
      raytrace?.dispose(); raytrace = null;
      renderStatus.textContent = `Cinematic shadows · ray tracing unavailable: ${error.message}`;
    }
    renderRelative(renderer, scene, viewCamera); return true;
  }
  return { render, get active() { return active; }, get selecting() { return selecting; } };
}
