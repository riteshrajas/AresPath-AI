import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCALE, sampleMola, planetPoint } from './globe-math.js';
import { TerrainClient } from './terrain-client.js';
import { planTerrainWindow, planOuterTerrainWindow, fetchTerrainWindow } from './terrain-window.js';
import { createTerrainSurface, contextRadiusAt } from './terrain-surface.js';
import { marsMaterial, gradeMarsColor } from './mars-material.js';

const turbo = new URLSearchParams(location.search).get('turbo') === '1';
globalThis.__ARESPATH_TURBO__ = turbo;
const api = new TerrainClient(import.meta.env.VITE_API_BASE_URL || '');
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05080e');
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .000001, 30000);
camera.position.set(0, 180, 1020);
const renderer = new THREE.WebGLRenderer({ antialias: !turbo, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(devicePixelRatio, turbo ? 1.25 : 2)); renderer.setSize(innerWidth, innerHeight);
document.querySelector('#canvas-container').appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, .85));
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(1200, 800, 1000); scene.add(sun);
const inspection = new THREE.DirectionalLight(0xffffff, 0); scene.add(inspection); scene.add(inspection.target);
const errorText = document.querySelector('#error');
const loadingStatus = document.querySelector('#loading-status');
const turboToggle = document.querySelector('#turbo-toggle');
turboToggle.classList.toggle('active', turbo); turboToggle.textContent = turbo ? 'Turbo mode · On' : 'Turbo mode';
turboToggle.title = turbo ? 'High-performance rendering enabled' : 'Enable high-performance rendering';
turboToggle.addEventListener('click', () => {
  const next = new URL(location.href); next.searchParams.set('turbo', turbo ? '0' : '1'); location.href = next.toString();
});
const vector = xyz => new THREE.Vector3(...xyz);
let controls, flight, mola, radiusGrid, baseMesh, baseRadiusAt, texture, terrain, contextTerrain;
let contextPending, contextLoadedKey = '', contextRequestedKey = '', contextRetryAt = 0, contextFailed = false;
let local = null, selection = 0, pending, loadedKey = '', requestedKey = '', retryAt = 0, scheduledAt = 0;
let autoFocusPending = false, autoFocusRetryAt = 0;
const mask = new THREE.Vector4(0, 0, 0, 0);
const innerMask = new THREE.Vector4(0, 0, 0, 0);
function makeControls(target = new THREE.Vector3()) {
  controls?.dispose(); controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target); controls.enableDamping = true; controls.enablePan = false;
  // Let explorers approach the measured surface closely enough to inspect
  // meter-scale terrain, while the radial clearance check below still prevents
  // the camera from entering the DEM.
  controls.minDistance = local ? 18 * SCALE : 290;
  controls.maxDistance = 6000; controls.minPolarAngle = .03;
  controls.maxPolarAngle = local ? Math.PI / 2 - .12 : Math.PI - .03; controls.update();
}
makeControls();
function fly(position, target, up) {
  flight = { start: performance.now(), from: camera.position.clone(), target: controls.target.clone(), up: camera.up.clone(),
    to: position, endTarget: target, endUp: up }; controls.enabled = false;
}
function clearTerrain() {
  if (terrain) { scene.remove(terrain.mesh); terrain.mesh.geometry.dispose(); terrain.mesh.material.dispose(); terrain = null; }
  innerMask.set(0, 0, 0, 0);
  if (!contextTerrain) mask.set(0, 0, 0, 0);
  loadedKey = '';
}
function clearContext() {
  contextPending?.abort(); contextRequestedKey = ''; contextLoadedKey = ''; contextRetryAt = 0; contextFailed = false;
  if (contextTerrain) { scene.remove(contextTerrain.mesh); contextTerrain.mesh.geometry.dispose(); contextTerrain.mesh.material.dispose(); contextTerrain = null; }
  if (terrain) mask.set(...terrain.data.bounds); else mask.set(0, 0, 0, 0);
}
function contextContains(data) {
  if (!contextTerrain) return false;
  const [west, south, east, north] = contextTerrain.data.bounds, [iw, is, ie, inorth] = data.bounds;
  const mid = (west + east) / 2, innerMid = mid + (((iw + ie) / 2 - mid + 540) % 360) - 180;
  return innerMid - (ie - iw) / 2 >= west && innerMid + (ie - iw) / 2 <= east && is >= south && inorth <= north;
}
function setWindowMasks(data) {
  const useContext = contextContains(data);
  if (contextTerrain) contextTerrain.mesh.visible = useContext;
  if (useContext) { mask.set(...contextTerrain.data.bounds); innerMask.set(...data.bounds); }
  else { mask.set(...data.bounds); innerMask.set(0, 0, 0, 0); }
}
function innerBaseRadius(lon, lat) {
  return contextTerrain ? contextRadiusAt(contextTerrain.data, lon, lat, baseRadiusAt) : baseRadiusAt(lon, lat);
}
function setLoadingStatus(text, state = '') {
  loadingStatus.textContent = text;
  loadingStatus.className = state;
}
function setTerrainReadyStatus() {
  if (!terrain) return;
  const data = terrain.data, count = data.sourceMetadata.length;
  const detail = contextRequestedKey ? ' · loading distance' : contextFailed ? ' · distance unavailable' : '';
  setLoadingStatus(`Terrain ready · LOD ${data.z} · ${count} source${count === 1 ? '' : 's'}${detail}`, 'ready');
}
function reset() {
  selection++; local = null; pending?.abort(); requestedKey = ''; clearTerrain(); clearContext();
  inspection.intensity = 0; errorText.textContent = '';
  setLoadingStatus('Mars globe ready', 'ready');
  fly(new THREE.Vector3(0, 180, 1020), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
}
async function explore(longitude, latitude, label = 'Selected location', range = 30000, preserveView = false) {
  const token = ++selection; pending?.abort(); requestedKey = ''; retryAt = 0; clearContext();
  errorText.textContent = '';
  try {
    const coverage = await api.coverage(longitude, latitude);
    if (selection !== token) return;
    const center = vector(planetPoint(longitude, latitude, coverage.planetary_radius_m));
    const normal = center.clone().normalize(), lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
    const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
    local = { longitude, latitude, label, coverage }; loadedKey = '';
    // A small camera-aligned fill keeps the near side readable without washing
    // out the shadows that reveal actual valley depth.
    inspection.intensity = .42;
    if (preserveView) {
      camera.up.copy(normal); makeControls(center);
      return;
    }
    const distance = range * SCALE;
    fly(center.clone().addScaledVector(normal, distance).addScaledVector(north, -distance * .45), center, normal);
  } catch (error) { if (selection === token) errorText.textContent = `Location unavailable: ${error.message}`; }
}
async function focusFromZoom(now) {
  if (local || flight || !baseMesh || autoFocusPending || now < autoFocusRetryAt) return;
  // Switch before the old orbit-distance floor can block a surface approach.
  const radial = camera.position.length();
  const latitude = Math.asin(camera.position.y / radial) * 180 / Math.PI;
  const longitude = Math.atan2(-camera.position.z, camera.position.x) * 180 / Math.PI;
  const ground = sampleMola(radiusGrid, mola.width, mola.height, longitude, latitude, mola.offset_m);
  if (radial / SCALE - ground > 550000) return;
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = ray.intersectObject(baseMesh)[0];
  if (!hit) return;
  const direction = hit.point.clone().normalize();
  const lon = Math.atan2(-direction.z, direction.x) * 180 / Math.PI;
  const lat = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)) * 180 / Math.PI;
  autoFocusPending = true;
  try { await explore(lon, lat, 'Zoom location', 0, true); }
  finally { autoFocusPending = false; autoFocusRetryAt = performance.now() + 2000; }
}
function cameraGroundFocus() {
  if (!baseMesh) return null;
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const objects = terrain ? [terrain.mesh, baseMesh] : [baseMesh];
  const hit = ray.intersectObjects(objects)[0];
  if (!hit) return null;
  const direction = hit.point.clone().normalize();
  return {
    longitude: Math.atan2(-direction.z, direction.x) * 180 / Math.PI,
    latitude: Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)) * 180 / Math.PI
  };
}
function followCameraTile(plan) {
  const focus = cameraGroundFocus();
  if (!focus || !local) return;
  const centerLon = local.longitude;
  const deltaLon = Math.abs(((focus.longitude - centerLon + 540) % 360) - 180);
  const deltaLat = Math.abs(focus.latitude - local.latitude);
  const threshold = Math.max(plan.bounds[2] - plan.bounds[0], plan.bounds[3] - plan.bounds[1]) * 0.35;
  if (Math.max(deltaLon, deltaLat) > threshold) {
    // Camera-centric chunk backtracking: make the tile under the view primary,
    // then rebuild the surrounding ring at the same LOD as that primary tile.
    local.longitude = focus.longitude;
    local.latitude = focus.latitude;
    loadedKey = '';
  }
}
async function updateTerrain(now) {
  if (!local || flight || now < scheduledAt || now < retryAt) return;
  scheduledAt = now + 250;
  const range = camera.position.distanceTo(controls.target) / SCALE;
  let plan = planTerrainWindow(local.longitude, local.latitude, range, camera.aspect, camera.fov);
  followCameraTile(plan);
  plan = planTerrainWindow(local.longitude, local.latitude, range, camera.aspect, camera.fov);
  updateContext(plan);
  if (plan.key === loadedKey || plan.key === requestedKey) return;
  pending?.abort(); const controller = new AbortController(); pending = controller; requestedKey = plan.key;
  setLoadingStatus(`Loading terrain · 0/${plan.tiles.length} tiles · LOD ${plan.z}`, 'loading');
  try {
    const publishPartial = data => {
      if (controller.signal.aborted || !local || !data) return;
      const next = createTerrainSurface(data, texture, innerBaseRadius); clearTerrain();
      terrain = next; scene.add(next.mesh); setWindowMasks(data);
    };
    const data = await fetchTerrainWindow(api, plan, controller.signal, (done, total) => {
      if (!controller.signal.aborted) setLoadingStatus(`Loading terrain · ${done}/${total} tiles · LOD ${plan.z}`, 'loading');
    }, partial => publishPartial(partial), (lon, lat) =>
      sampleMola(radiusGrid, mola.width, mola.height, lon, lat, mola.offset_m));
    if (controller.signal.aborted || !local) return;
    const next = createTerrainSurface(data, texture, innerBaseRadius); clearTerrain();
    // Leave the coarse globe beneath the visual collar. Masking through its
    // outside edge exposes tiny cracks where curved edges cross coarse faces.
    terrain = next; scene.add(next.mesh); loadedKey = plan.key; setWindowMasks(data);
    errorText.textContent = '';
    setTerrainReadyStatus();
  } catch (error) {
    if (error.name !== 'AbortError' && !controller.signal.aborted) {
      errorText.textContent = `Terrain unavailable: ${error.message}. Existing terrain remains visible.`; retryAt = performance.now() + 10000;
      setLoadingStatus('Terrain load paused · retrying', 'loading');
    }
  } finally { if (pending === controller) requestedKey = ''; }
}
async function updateContext(plan) {
  const contextPlan = planOuterTerrainWindow(plan);
  if (!contextPlan || performance.now() < contextRetryAt || contextPlan.key === contextLoadedKey || contextPlan.key === contextRequestedKey) return;
  contextPending?.abort();
  const controller = new AbortController(); contextPending = controller; contextRequestedKey = contextPlan.key;
  try {
    const data = await fetchTerrainWindow(api, contextPlan, controller.signal);
    if (controller.signal.aborted || !local) return;
    const next = createTerrainSurface(data, texture, baseRadiusAt, innerMask);
    if (contextTerrain) { scene.remove(contextTerrain.mesh); contextTerrain.mesh.geometry.dispose(); contextTerrain.mesh.material.dispose(); }
    contextTerrain = next; scene.add(next.mesh); contextLoadedKey = contextPlan.key;
    contextFailed = false;
    if (terrain) {
      const existing = terrain.data, previousKey = loadedKey;
      const replacement = createTerrainSurface(existing, texture, innerBaseRadius);
      scene.remove(terrain.mesh); terrain.mesh.geometry.dispose(); terrain.mesh.material.dispose();
      terrain = replacement; scene.add(replacement.mesh); loadedKey = previousKey; setWindowMasks(existing);
    } else mask.set(...data.bounds);
  } catch (error) {
    if (error.name !== 'AbortError' && !controller.signal.aborted) {
      console.warn('Wider terrain context unavailable:', error); contextRetryAt = performance.now() + 10000; contextFailed = true;
    }
  } finally {
    if (contextPending === controller) { contextPending = null; contextRequestedKey = ''; if (!requestedKey) setTerrainReadyStatus(); }
  }
}
async function initialize() {
  setLoadingStatus('Loading Mars globe…', 'loading');
  mola = await api.json('/api/v1/globe/manifest');
  const response = await fetch(api.base + '/api/v1/globe/radius.i16');
  if (!response.ok) throw Error(`MOLA unavailable: HTTP ${response.status}`);
  radiusGrid = new Int16Array(await response.arrayBuffer());
  if (radiusGrid.length !== mola.width * mola.height) throw Error('Incomplete global MOLA data');
  const geometry = new THREE.SphereGeometry(280, 720, 360), position = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const lon = uv.getX(i) * 360 - 180, lat = uv.getY(i) * 180 - 90;
    position.setXYZ(i, ...planetPoint(lon, lat, sampleMola(radiusGrid, mola.width, mola.height, lon, lat, mola.offset_m)));
  }
  geometry.computeVertexNormals();
  baseRadiusAt = (longitude, latitude) => {
    longitude = ((longitude + 180) % 360 + 360) % 360 - 180;
    const column = Math.floor((longitude + 180) * 2), row = Math.floor((90 - latitude) * 2);
    const direction = vector(planetPoint(longitude, latitude, 1)).normalize(), ray = new THREE.Ray(new THREE.Vector3(), direction);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
    for (let y = Math.max(0, row - 1); y <= Math.min(359, row + 1); y++) for (let x = Math.max(0, column - 1); x <= Math.min(719, column + 1); x++) {
      const tl = y * 721 + x, tr = tl + 1, bl = tl + 721, br = bl + 1;
      for (const indices of [[tr, tl, br], [tl, bl, br]]) {
        a.fromBufferAttribute(position, indices[0]); b.fromBufferAttribute(position, indices[1]); c.fromBufferAttribute(position, indices[2]);
        if (ray.intersectTriangle(a, b, c, false, hit)) return hit.length() / SCALE;
      }
    }
    return sampleMola(radiusGrid, mola.width, mola.height, longitude, latitude, mola.offset_m);
  };
  texture = await new THREE.TextureLoader().loadAsync(api.base + '/api/v1/basemaps/mars-color');
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = marsMaterial(texture);
  material.onBeforeCompile = shader => {
    gradeMarsColor(shader);
    shader.uniforms.terrainBounds = { value: mask };
    shader.vertexShader = 'varying vec3 planetPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nplanetPosition=position;');
    shader.fragmentShader = 'varying vec3 planetPosition; uniform vec4 terrainBounds;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec3 direction=normalize(planetPosition); float lon=degrees(atan(-direction.z,direction.x)); float lat=degrees(asin(direction.y));
      float mid=(terrainBounds.x+terrainBounds.z)*0.5; lon=mid+mod(lon-mid+540.0,360.0)-180.0;
      if(terrainBounds.z>terrainBounds.x && lon>terrainBounds.x && lon<terrainBounds.z && lat>terrainBounds.y && lat<terrainBounds.w) discard;`);
  };
  baseMesh = new THREE.Mesh(geometry, material); scene.add(baseMesh);
  const query = new URLSearchParams(location.search);
  const requested = query.get('site'), patch = mola.patches.find(item => item.site === requested);
  const lonText = query.get('longitude'), latText = query.get('latitude'), rangeText = query.get('range');
  const lon = Number(lonText), lat = Number(latText), requestedRange = rangeText === null ? 100000 : Number(rangeText);
  const validCoordinates = lonText !== null && latText !== null && lonText.trim() !== '' && latText.trim() !== ''
    && Number.isFinite(lon) && lon >= -180 && lon <= 180 && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(requestedRange) && requestedRange >= 200 && requestedRange <= 1000000;
  if (validCoordinates) explore(lon, lat, 'Selected location', requestedRange);
  else if (patch) explore(...patch.center, requested === 'gale' ? 'Gale crater' : 'Jezero crater', requested === 'gale' ? 23000 : 2200);
  else {
    reset();
    if (lonText !== null || latText !== null || rangeText !== null)
      errorText.textContent = 'Invalid location or range in link.';
  }
}
renderer.domElement.addEventListener('dblclick', event => {
  if (!baseMesh || flight) return;
  const rect = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  const hit = ray.intersectObjects(terrain ? [terrain.mesh, baseMesh] : [baseMesh])[0];
  if (!hit) return;
  const p = hit.point.clone().normalize(), latitude = Math.asin(p.y) * 180 / Math.PI, longitude = Math.atan2(-p.z, p.x) * 180 / Math.PI;
  explore(longitude, latitude, 'Selected location', local ? Math.max(300, camera.position.distanceTo(controls.target) / SCALE / 2) : 100000);
});
renderer.setAnimationLoop(now => {
  if (flight) {
    const t = Math.min(1, (now - flight.start) / 850), ease = (1 - Math.cos(t * Math.PI)) / 2;
    camera.position.lerpVectors(flight.from, flight.to, ease); controls.target.lerpVectors(flight.target, flight.endTarget, ease);
    camera.up.lerpVectors(flight.up, flight.endUp, ease).normalize(); camera.lookAt(controls.target);
    if (t === 1) { const target = flight.endTarget; flight = null; makeControls(target); }
  } else controls.update();
  if (local && !flight && camera.position.distanceTo(controls.target) / SCALE > 1200000) {
    selection++; local = null; pending?.abort(); requestedKey = ''; clearTerrain(); clearContext();
    inspection.intensity = 0;
    camera.up.set(0, 1, 0); makeControls();
  }
  if (local && !flight && radiusGrid) {
    const radial = camera.position.length(), latitude = Math.asin(camera.position.y / radial) * 180 / Math.PI;
    const longitude = Math.atan2(-camera.position.z, camera.position.x) * 180 / Math.PI;
    let ground = sampleMola(radiusGrid, mola.width, mola.height, longitude, latitude, mola.offset_m);
    if (terrain) {
      const { data } = terrain, [west, south, east, north] = data.bounds;
      const lon = (west + east) / 2 + ((longitude - (west + east) / 2 + 540) % 360) - 180;
      if (lon >= west && lon <= east && latitude >= south && latitude <= north) {
        const x = Math.round((lon - west) / (east - west) * (data.cols - 1));
        const y = Math.round((north - latitude) / (north - south) * (data.rows - 1)); ground = data.radii[y * data.cols + x];
      }
    }
    const safe = (ground + 18) * SCALE; if (radial < safe) camera.position.multiplyScalar(safe / radial);
  }
  inspection.position.copy(camera.position); inspection.target.position.copy(controls.target);
  const rangeMeters = camera.position.distanceTo(controls.target) / SCALE;
  document.querySelector('#range').textContent = rangeMeters < 1000
    ? `${Math.round(rangeMeters)} m view range`
    : `${(rangeMeters / 1000).toFixed(1)} km view range`;
  focusFromZoom(now); updateTerrain(now); renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
initialize().catch(error => { errorText.textContent = error.message; console.error(error); });
