import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCALE, sampleMola, planetPoint } from './globe-math.js';
import { TerrainClient } from './terrain-client.js';
import { planTerrainWindow, planOuterTerrainWindow, fetchTerrainWindow } from './terrain-window.js';
import { createTerrainSurface, contextRadiusAt } from './terrain-surface.js';
import { marsMaterial, gradeMarsColor } from './mars-material.js';
import { createRealTimeSky } from './real-time-sky.js';
import { setupTerrainShading } from './terrain-lighting.js';
import { createTerrainShadows } from './terrain-shadows.js';
import { createNavigation } from './navigation.js';
import { createViewFilters } from './view-filters.js';
import { raySphereCoordinates } from './coordinates.js';
import { createPlaces } from './places.js';
import { createRoutePlanner } from './route-planner.js';
import { createCinematicReplay } from './cinematic-replay.js';
import { hydrateReplayGeometry } from './cinematic-geometry.js';
import { renderRelative } from './render-relative.js';
import { attachTerrainAnalysis } from './terrain-analysis.js';

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
const ambient = new THREE.AmbientLight(0xffffff, .85); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(1200, 800, 1000); scene.add(sun);
const inspection = new THREE.DirectionalLight(0xffffff, 0); scene.add(inspection); scene.add(inspection.target);
const realTimeSky = createRealTimeSky(scene, camera, sun, ambient, inspection, api.base);
const terrainShadows = createTerrainShadows(renderer, scene, sun, ambient, inspection, turbo);
const errorText = document.querySelector('#error');
const loadingStatus = document.querySelector('#loading-status');
const fpsCounter = document.querySelector('#fps-counter');
let fpsFrames = 0, fpsLastTime = performance.now();
const rangeText = document.querySelector('#range');
let lastRangeText = '';
const focusCameraPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
const focusCameraRotation = new THREE.Quaternion();
const turboToggle = document.querySelector('#turbo-toggle');
turboToggle.classList.toggle('active', turbo); turboToggle.textContent = turbo ? 'Turbo mode · On' : 'Turbo mode';
turboToggle.title = turbo ? 'High-performance rendering enabled' : 'Enable high-performance rendering';
turboToggle.addEventListener('click', () => {
  const next = new URL(location.href); next.searchParams.set('turbo', turbo ? '0' : '1'); location.href = next.toString();
});
const vector = xyz => new THREE.Vector3(...xyz);
let controls, flight, mola, radiusGrid, baseMesh, baseRadiusAt, texture, terrain, contextTerrain;
let cinematic;
let cinematicPreviousLocal;
let wasRelativeRender = false;
let contextPending, contextLoadedKey = '', contextRequestedKey = '', contextRetryAt = 0, contextFailed = false;
let local = null, selection = 0, pending, loadedKey = '', requestedKey = '', retryAt = 0, scheduledAt = 0;
let autoFocusPending = false, autoFocusRetryAt = 0;
const mask = new THREE.Vector4(0, 0, 0, 0);
const innerMask = new THREE.Vector4(0, 0, 0, 0);
setupTerrainShading(document.querySelector('#terrain-shading-toggle'));
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
const navigation = createNavigation(camera, () => controls, () => !!flight || !!cinematic?.active, reset);
const places = createPlaces({ camera, isReady: () => !!baseMesh,
  getRadius: (longitude, latitude) => sampleMola(radiusGrid, mola.width, mola.height, longitude, latitude, mola.offset_m),
  onSelect: (place, range) => explore(place.longitude, place.latitude, place.name, range),
});
const viewFilters = createViewFilters({ renderer,
  places, camera, scene,
  getTerrain: () => terrain,
  getRouteState: () => routePlanner.getState(),
  getRadius: (lon, lat) => {
    if (!radiusGrid) return null;
    const fallback = (longitude, latitude) => sampleMola(radiusGrid,mola.width,mola.height,longitude,latitude,mola.offset_m);
    const context = (longitude, latitude) => contextTerrain ? contextRadiusAt(contextTerrain.data,longitude,latitude,fallback) : fallback(longitude,latitude);
    return terrain ? contextRadiusAt(terrain.data,lon,lat,context) : context(lon,lat);
  },
  onSelect: pin => explore(pin.longitude,pin.latitude,pin.name,5000),
  setStarsEnabled: value => realTimeSky.setStarsEnabled(value),
  getMeshes: () => [baseMesh, terrain?.mesh, contextTerrain?.mesh],
  getFocus: () => local ? cameraGroundFocus() : raySphereCoordinates(camera, 280),
});
cinematic = createCinematicReplay({ api, renderer, camera,
  getGlobe: () => radiusGrid && texture ? {grid:radiusGrid,width:mola.width,height:mola.height,offset:mola.offset_m} : null,
  onBegin: () => {
    cinematicPreviousLocal = local;
    selection++; pending?.abort(); contextPending?.abort(); requestedKey = contextRequestedKey = ''; flight = null;
    controls.enabled = false; clearContext(); clearTerrain();
    local = {longitude:0,latitude:0,label:'Cinematic Replay'};
  },
  onWindow: snapshot => {
    clearContext(); clearTerrain();
    if(snapshot.context){contextTerrain=hydrateReplayGeometry(snapshot.context,texture,innerMask);scene.add(contextTerrain.mesh);}
    terrain = hydrateReplayGeometry(snapshot,texture);scene.add(terrain.mesh);
    mask.set(...(contextTerrain?.data.bounds||terrain.data.bounds));innerMask.set(...terrain.data.bounds);loadedKey = '';
    setLoadingStatus('Cinematic Replay · prepared native terrain', 'ready');
  },
  onPose: pose => { controls.target.copy(pose.target); local.longitude = pose.longitude; local.latitude = pose.latitude; },
  onEnd: pose => {
    if(pose){local = {longitude:pose.longitude,latitude:pose.latitude,label:'Replay position'};makeControls(pose.target);}
    else { local = cinematicPreviousLocal; controls.enabled = true; }
    loadedKey = ''; requestedKey = ''; scheduledAt = 0;
  },
});
const routePlanner = createRoutePlanner({ scene, apiBase: api.base,
  filters: viewFilters.registry,
  onReplay: (route,result) => cinematic.start(route,result), onReplayCancel: () => cinematic.cancel(),
  getFocus: () => cameraGroundFocus(), getPlaces: () => places.getFeatures(),
  onView: result => {
    const start = result.start, end = result.destination;
    const delta = ((end.longitude - start.longitude + 540) % 360) - 180;
    const longitude = ((start.longitude + delta / 2 + 540) % 360) - 180;
    explore(longitude, (start.latitude + end.latitude) / 2, 'Route area', Math.max(200, Math.min(800000, result.direct_distance_m * 1.7)));
  },
});
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
  cinematic?.cancel();
  selection++; local = null; pending?.abort(); requestedKey = ''; clearTerrain(); clearContext();
  inspection.intensity = 0; errorText.textContent = '';
  setLoadingStatus('Mars globe ready', 'ready');
  fly(new THREE.Vector3(0, 180, 1020), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
}
async function explore(longitude, latitude, label = 'Selected location', range = 30000, preserveView = false) {
  cinematic?.cancel();
  focusCameraPosition.set(Infinity, Infinity, Infinity);
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
  if(cinematic?.active)return;
  if (local || flight || !baseMesh || autoFocusPending || now < autoFocusRetryAt) return;
  // Switch before the old orbit-distance floor can block a surface approach.
  const radial = camera.position.length();
  const latitude = Math.asin(camera.position.y / radial) * 180 / Math.PI;
  const longitude = Math.atan2(-camera.position.z, camera.position.x) * 180 / Math.PI;
  const ground = sampleMola(radiusGrid, mola.width, mola.height, longitude, latitude, mola.offset_m);
  if (radial / SCALE - ground > 550000) return;
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = rayToMarsGround(ray.ray);
  if (!hit) return;
  autoFocusPending = true;
  try { await explore(hit.longitude, hit.latitude, 'Zoom location', 0, true); }
  finally { autoFocusPending = false; autoFocusRetryAt = performance.now() + 2000; }
}
let groundFocusKey = '', groundFocusValue = null;
const groundFocusRay = new THREE.Ray();
const groundFocusSphere = new THREE.Sphere(new THREE.Vector3(), 280);
const groundFocusHit = new THREE.Vector3();

function rayToMarsGround(cameraRay) {
  if (!radiusGrid || !mola) return null;
  const camDist = cameraRay.origin.length();
  const maxRadius = Math.min(camDist - 0.0001, 282.5);
  groundFocusSphere.radius = Math.min(maxRadius, 280);
  if (!cameraRay.intersectSphere(groundFocusSphere, groundFocusHit)) {
    groundFocusSphere.radius = maxRadius;
    if (!cameraRay.intersectSphere(groundFocusSphere, groundFocusHit)) return null;
  }
  for (let iter = 0; iter < 3; iter++) {
    const len = groundFocusHit.length();
    const lon = Math.atan2(-groundFocusHit.z, groundFocusHit.x) * 180 / Math.PI;
    const lat = Math.asin(THREE.MathUtils.clamp(groundFocusHit.y / len, -1, 1)) * 180 / Math.PI;
    let ground = sampleMola(radiusGrid, mola.width, mola.height, lon, lat, mola.offset_m);
    if (terrain) {
      const [w, s, e, n] = terrain.data.bounds;
      const mid = (w + e) / 2, uLon = mid + ((lon - mid + 540) % 360) - 180;
      if (uLon >= w && uLon <= e && lat >= s && lat <= n) {
        ground = contextRadiusAt(terrain.data, lon, lat, (lo, la) => ground);
      }
    }
    groundFocusSphere.radius = Math.min(maxRadius, ground * SCALE);
    if (!cameraRay.intersectSphere(groundFocusSphere, groundFocusHit)) break;
  }
  const finalLen = groundFocusHit.length();
  return {
    longitude: Math.atan2(-groundFocusHit.z, groundFocusHit.x) * 180 / Math.PI,
    latitude: Math.asin(THREE.MathUtils.clamp(groundFocusHit.y / finalLen, -1, 1)) * 180 / Math.PI
  };
}

function cameraGroundFocus() {
  if (!baseMesh || !radiusGrid) return null;
  const key = [terrain?.mesh.geometry.uuid, contextTerrain?.mesh.geometry.uuid,
    ...camera.position.toArray(), ...camera.quaternion.toArray()].join('/');
  if (key === groundFocusKey) return groundFocusValue;
  groundFocusKey = key;
  camera.updateWorldMatrix(true, false);
  groundFocusRay.origin.copy(camera.position);
  groundFocusRay.direction.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  return groundFocusValue = rayToMarsGround(groundFocusRay);
}
function followCameraTile(plan) {
  // Raycasting the dense surface is expensive. A stationary camera sees the
  // same focus; tile arrivals do not require repeating the triangle search.
  if (focusCameraPosition.distanceToSquared(camera.position) < 1e-14 &&
      1 - Math.abs(focusCameraRotation.dot(camera.quaternion)) < 1e-12) return;
  focusCameraPosition.copy(camera.position); focusCameraRotation.copy(camera.quaternion);
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
  if(cinematic?.active)return;
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
      const next = createTerrainSurface(data, texture, innerBaseRadius, null, { fast: true }); clearTerrain();
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
      const cached = { occlusion: terrain.occlusion, analysis: terrain.analysis };
      const replacement = createTerrainSurface(existing, texture, innerBaseRadius, null, cached);
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
  const globeRadii = Float64Array.from({length: position.count}, (_, i) => Math.hypot(position.getX(i), position.getY(i), position.getZ(i)) / SCALE);
  attachTerrainAnalysis(geometry, { rows: 361, cols: 721, bounds: [-180,-90,180,90], radii: globeRadii,
    heights: Float64Array.from(globeRadii, radius => radius - mola.offset_m), resolution: 14818 });
  baseRadiusAt = (longitude, latitude) => {
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
  if (!baseMesh || flight || cinematic.active) return;
  const rect = renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  const hit = rayToMarsGround(ray.ray);
  if (!hit) return;
  explore(hit.longitude, hit.latitude, 'Selected location', local ? Math.max(300, camera.position.distanceTo(controls.target) / SCALE / 2) : 100000);
});
renderer.setAnimationLoop(now => {
  navigation.beginFrame(now);
  if(cinematic.active) cinematic.update(now);
  else if (flight) {
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
  navigation.applyView();
  inspection.position.copy(camera.position); inspection.target.position.copy(controls.target);
  const rangeMeters = camera.position.distanceTo(controls.target) / SCALE;
  const nextRangeText = rangeMeters < 1000
    ? `${Math.round(rangeMeters)} m view range`
    : `${(rangeMeters / 1000).toFixed(1)} km view range`;
  if (nextRangeText !== lastRangeText) { rangeText.textContent = nextRangeText; lastRangeText = nextRangeText; }
  focusFromZoom(now); updateTerrain(now); realTimeSky.update();
  terrainShadows.update({ terrain, context: contextTerrain, target: controls.target, range: rangeMeters,
    liveSun: document.querySelector('#rt-toggle').getAttribute('aria-pressed') === 'true' });
  viewFilters.update(now);
  places.update(now);
  routePlanner.update();
  if(wasRelativeRender!==cinematic.active) renderer.shadowMap.needsUpdate=true;
  wasRelativeRender=cinematic.active;
  if(cinematic.active)renderRelative(renderer,scene,camera);
  else renderer.render(scene, camera);
  navigation.update();
  fpsFrames++;
  const fpsElapsed = now - fpsLastTime;
  if (fpsElapsed >= 500 && fpsCounter) {
    const fps = Math.round((fpsFrames * 1000) / fpsElapsed);
    const ms = (fpsElapsed / fpsFrames).toFixed(1);
    fpsCounter.value = `${fps} FPS · ${ms} ms`;
    fpsCounter.className = fps >= 50 ? 'good' : fps >= 30 ? 'warn' : 'low';
    fpsFrames = 0;
    fpsLastTime = now;
  }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
initialize().catch(error => { errorText.textContent = error.message; console.error(error); });
