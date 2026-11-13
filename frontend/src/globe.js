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

// --- FULL MARTIAN YEAR EPHEMERIS DATASET (~686.98 Earth Days) ---
const marsEphemerisDataset = [
  { timestamp: Date.UTC(2026, 0, 1, 0, 0, 0), ls: 250.5 },
  { timestamp: Date.UTC(2026, 3, 1, 0, 0, 0), ls: 342.1 },
  { timestamp: Date.UTC(2026, 6, 1, 0, 0, 0), ls: 73.8 },
  { timestamp: Date.UTC(2026, 9, 1, 0, 0, 0), ls: 161.4 },
  { timestamp: Date.UTC(2027, 0, 1, 0, 0, 0), ls: 251.2 },
  { timestamp: Date.UTC(2027, 3, 1, 0, 0, 0), ls: 343.0 },
  { timestamp: Date.UTC(2027, 7, 18, 0, 0, 0), ls: 74.5 },
  { timestamp: Date.UTC(2027, 10, 18, 0, 0, 0), ls: 162.0 }
];

function getMarsSunPositionFromLs(lsDegrees, distance = 10000) {
  const ls = THREE.MathUtils.degToRad(lsDegrees);
  const obliquity = THREE.MathUtils.degToRad(25.19); // Mars axial tilt

  const x = Math.cos(ls) * distance;
  const y = Math.sin(ls) * Math.sin(obliquity) * distance;
  const z = Math.sin(ls) * Math.cos(obliquity) * distance;

  return new THREE.Vector3(x, y, z);
}

function getSolarLongitudeFromData(targetTime = Date.now()) {
  const firstEntry = marsEphemerisDataset[0];
  const lastEntry = marsEphemerisDataset[marsEphemerisDataset.length - 1];
  const marsYearMs = 686.98 * 86400000; // Exact physical Martian year in ms

  if (targetTime <= firstEntry.timestamp) {
    return firstEntry.ls;
  }

  if (targetTime >= lastEntry.timestamp) {
    const timeBeyond = targetTime - firstEntry.timestamp;
    const cyclicTime = firstEntry.timestamp + (timeBeyond % marsYearMs);
    
    if (cyclicTime > lastEntry.timestamp) {
      const datasetSpanMs = lastEntry.timestamp - firstEntry.timestamp;
      const normalizedTime = firstEntry.timestamp + ((cyclicTime - firstEntry.timestamp) % datasetSpanMs);
      return getSolarLongitudeFromData(normalizedTime);
    }
    return getSolarLongitudeFromData(cyclicTime);
  }

  let prev = firstEntry;
  let next = lastEntry;

  for (let i = 0; i < marsEphemerisDataset.length - 1; i++) {
    if (targetTime >= marsEphemerisDataset[i].timestamp && targetTime <= marsEphemerisDataset[i + 1].timestamp) {
      prev = marsEphemerisDataset[i];
      next = marsEphemerisDataset[i + 1];
      break;
    }
  }

  const factor = (targetTime - prev.timestamp) / (next.timestamp - prev.timestamp || 1);
  
  let diff = next.ls - prev.ls;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;

  const interpolatedLs = (prev.ls + factor * diff + 360) % 360;
  return interpolatedLs;
}

// --- 12 MARS EXPLORATION WAYPOINTS DATASET ---
const waypoints = [
  { name: "Gale Crater", lat: -5.4, lon: 137.8, description: "Landing site of NASA's Curiosity rover. Features Mount Sharp, revealing stratified layers of ancient lakebed sediments.", significance: "Crucial for studying past habitability and organic carbon preservation in ancient aqueous environments." },
  { name: "Jezero Crater", lat: 18.38, lon: 77.58, description: "An ancient river delta system explored by NASA's Perseverance rover.", significance: "High potential for preserving biosignatures and microbial fossils from Mars' wet history." },
  { name: "Olympus Mons", lat: 18.65, lon: 226.2, description: "The largest volcano in the solar system, standing nearly three times the height of Mount Everest.", significance: "Provides insights into planetary volcanism, crustal stability, and the lack of plate tectonics on Mars." },
  { name: "Valles Marineris", lat: -14.0, lon: 283.0, description: "A vast system of canyons stretching over 4,000 kilometers across the Martian surface.", significance: "Offers deep geological cross-sections of the Martian crust and clues about ancient tectonic fracturing." },
  { name: "Elysium Planitia", lat: 4.5, lon: 135.6, description: "Smooth volcanic plain and landing site of NASA's InSight lander.", significance: "Key site for measuring Martian interior structure, crust thickness, and seismic activity (marsquakes)." },
  { name: "Acidalia Planitia", lat: 46.7, lon: 339.3, description: "A vast flat plain located in the northern hemisphere, notable for its dark albedo features.", significance: "Hypothesized to be the bed of an ancient northern ocean, important for climate evolution models." },
  { name: "Arcadia Planitia", lat: 46.7, lon: 188.0, description: "A smooth volcanic plain characterized by extensive fields of low-relief lava flows and subsurface ice deposits.", significance: "Considered a prime candidate site for future human exploration due to accessible subsurface water ice." },
  { name: "Utopia Planitia", lat: 49.7, lon: 118.0, description: "The largest recognized impact basin on Mars and the landing site of NASA's Viking 2 lander.", significance: "Contains vast reservoirs of subsurface water ice sheets, critical for in-situ resource utilization (ISRU)." },
  { name: "Hellas Planitia", lat: -42.4, lon: 70.5, description: "A massive impact crater and one of the largest craters in the solar system, with exceptionally low atmospheric pressure at its base.", significance: "Its deep floor allows unique atmospheric dynamics and potential subsurface hydrothermal mineral formation." },
  { name: "Syrtis Major Planum", lat: 8.4, lon: 69.5, description: "A prominent dark volcanic plateau that was one of the first albedo features mapped by early astronomers.", significance: "Features ancient clay minerals and hydrothermal deposits, marking it as a high-priority astrobiological target." },
  { name: "Meridiani Planum", lat: 2.0, lon: 5.5, description: "A smooth plain featuring abundant grey hematite mineral deposits, explored by NASA's Opportunity rover.", significance: "Provided definitive mineralogical evidence of past acidic standing water on the Martian surface." },
  { name: "Arsia Mons", lat: -8.4, lon: 239.0, description: "The southernmost of the three giant shield volcanoes forming the Tharsis Montes group.", significance: "Features potential deep volcanic cave skylights that could serve as radiation-protected habitats." }
];

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

const sun = new THREE.DirectionalLight(0xffffff, 2.4); 
scene.add(sun);

const sunDistance = 10000;
const sunRadius = sunDistance * Math.tan(THREE.MathUtils.degToRad(0.35 / 2));

const sunGeometry = new THREE.SphereGeometry(sunRadius, 32, 32);
const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff8e5, fog: false, toneMapped: false });
const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
sunMesh.name = 'visibleSun';
scene.add(sunMesh);

function updateSunPosition() {
  const currentLs = getSolarLongitudeFromData(Date.now()); 
  const sunPos = getMarsSunPositionFromLs(currentLs, sunDistance);
  sun.position.copy(sunPos);
  sunMesh.position.copy(sunPos);
}

updateSunPosition();

// --- WAYPOINT MARKER SETUP ---
const waypointGroup = new THREE.Group();
scene.add(waypointGroup);
const waypointMeshes = [];

function createWaypointMarkers() {
  if (!radiusGrid || !mola) return;
  waypoints.forEach(wp => {
    const groundRadius = sampleMola(radiusGrid, mola.width, mola.height, wp.lon, wp.lat, wp.offset_m);
    const elevationOffset = (groundRadius * SCALE) + 6000; 
    const pos = vector(planetPoint(wp.lon, wp.lat, elevationOffset));

    const markerGeo = new THREE.SphereGeometry(1200, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: false });
    const mesh = new THREE.Mesh(markerGeo, markerMat);
    mesh.position.copy(pos);
    mesh.userData = wp;

    waypointGroup.add(mesh);
    waypointMeshes.push(mesh);
  });
}

function showWaypointInfo(wp) {
  let panel = document.querySelector('#waypoint-info-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'waypoint-info-panel';
    panel.style.cssText = `
      position: absolute; bottom: 40px; right: 40px; width: 340px;
      background: rgba(5, 8, 14, 0.92); border: 1px solid rgba(0, 255, 204, 0.4);
      color: #fff; padding: 20px; font-family: sans-serif; border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6); z-index: 100; backdrop-filter: blur(6px);
    `;
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <h3 style="margin: 0 0 8px 0; color: #00ffcc; font-size: 18px; font-weight: 600;">${wp.name}</h3>
    <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.4; color: #d3d3d3;">${wp.description}</p>
    <div style="font-size: 12px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 10px; color: #90e0ef; line-height: 1.3;">
      <strong style="color: #fff;">Exploration Significance:</strong> ${wp.significance}
    </div>
    <button onclick="document.querySelector('#waypoint-info-panel').remove()" style="
      margin-top: 15px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); 
      padding: 6px 12px; cursor: pointer; border-radius: 4px; font-size: 12px; width: 100%; transition: background 0.2s;
    " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">Close Panel</button>
  `;
}

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
let local = null, selection = 0, pending, loadedKey = '', requestedKey = '', retryAt = '', scheduledAt = 0;
let autoFocusPending = false, autoFocusRetryAt = 0;
const mask = new THREE.Vector4(0, 0, 0, 0);
const innerMask = new THREE.Vector4(0, 0, 0, 0);

function makeControls(target = new THREE.Vector3()) {
  controls?.dispose(); controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target); controls.enableDamping = true; controls.enablePan = false;
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
  
  // Spawn the 12 waypoint markers once globe data is loaded
  createWaypointMarkers();

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

// Raycaster for clicking waypoints
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('click', event => {
  if (flight || !waypointMeshes.length) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(waypointMeshes);

  if (hits.length > 0) {
    const selectedWaypoint = hits[0].object.userData;
    showWaypointInfo(selectedWaypoint);
  }
});

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

  updateSunPosition();

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
