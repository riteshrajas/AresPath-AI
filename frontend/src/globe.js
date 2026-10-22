import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SCALE, sampleMola, planetPoint, terrainIndices } from './globe-math.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020306);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.000001, 30000);
camera.position.set(0, 180, 1020);
// Log depth retains terrain depth precision when navigating from orbit to meters.
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.querySelector('#canvas-container').appendChild(renderer.domElement);
let controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 300;
controls.maxDistance = 6000;
scene.add(new THREE.AmbientLight(0xffeedd, 0.8));
const sun = new THREE.DirectionalLight(0xffd5b8, 3);
sun.position.set(1200, 800, 1000);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x223344, 0.8);
fill.position.set(-1000, -400, -800);
scene.add(fill);
// This soft camera light keeps either selected patch inspectable regardless of
// the fixed illustrative sun direction. This is not a solar illumination model.
const inspectionLight = new THREE.PointLight(0xffeed8, 0, 0, 0);
scene.add(inspectionLight);
const starPositions = new Float32Array(3500 * 3);
for (let i = 0; i < starPositions.length; i++) starPositions[i] = (Math.random() - 0.5) * 15000;
const stars = new THREE.BufferGeometry();
stars.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, transparent: true, opacity: 0.85 })));

const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('nav button')];
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const root = API_BASE + '/api/v1/globe/';
const patches = new Map();
let flight = null, activeSite = 'mars';
const vector = coordinates => new THREE.Vector3(...coordinates);
async function get(url, binary = false) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Unable to load ${url}: HTTP ${response.status}`);
  return binary ? response.arrayBuffer() : response.json();
}
function fly(position, target, up) {
  flight = { started: performance.now(), position: camera.position.clone(), target: controls.target.clone(),
    up: camera.up.clone(), endPosition: position, endTarget: target, endUp: up };
  controls.enabled = false;
}
function focus(site) {
  activeSite = site;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.site === site));
  if (site === 'mars') {
    controls.minDistance = 300;
    inspectionLight.intensity = 0;
    status.textContent = 'Global MOLA terrain · Jezero and Gale HiRISE patches';
    document.querySelector('#source').hidden = true;
    fly(new THREE.Vector3(0, 180, 1020), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    return;
  }
  const patch = patches.get(site), [lon, lat] = patch.metadata.center;
  const normal = patch.center.clone().normalize();
  const north = new THREE.Vector3(-Math.sin(lat * Math.PI / 180) * Math.cos(lon * Math.PI / 180),
    Math.cos(lat * Math.PI / 180), Math.sin(lat * Math.PI / 180) * Math.sin(lon * Math.PI / 180));
  const distance = Math.max(2600, Math.max(...patch.metadata.display_span_m) * 1.6) * SCALE;
  controls.minDistance = 200 * SCALE;
  inspectionLight.intensity = 1.5;
  status.textContent = `${site === 'jezero' ? 'Jezero' : 'Gale'} · ${Math.abs(lat).toFixed(4)}°${lat < 0 ? 'S' : 'N'}, ${lon.toFixed(4)}°E · ${patch.metadata.coverage_label || 'HiRISE relief at 1× scale'}`;
  const source = document.querySelector('#source');
  source.hidden = false;
  source.href = patch.metadata.source_page.startsWith('/') ? API_BASE + patch.metadata.source_page : patch.metadata.source_page;
  source.textContent = patch.metadata.source_label || 'HiRISE source · elevation colors';
  fly(patch.center.clone().addScaledVector(normal, distance).addScaledVector(north, -distance * 0.6), patch.center, normal);
}

function createPatch(metadata, grid, mola, radiusGrid, areoidGrid, baseRadiusAt) {
  const [lon, lat] = metadata.center;
  const sample = (array, x, y) => sampleMola(array, mola.width, mola.height, x, y, mola.offset_m);
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  for (const z of grid.elevations_m) if (z !== null) {
    min = Math.min(min, z); max = Math.max(max, z); sum += z; count++;
  }
  if (!count) throw Error('Terrain contains no valid elevations');
  const meanElevation = sum / count;
  const center = vector(planetPoint(lon, lat, sample(areoidGrid, lon, lat) + meanElevation));
  const positions = [], colors = [];
  for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) {
    const height = grid.elevations_m[y * grid.cols + x];
    const longitude = metadata.longitudes[x], latitude = metadata.latitudes[y];
    const position = vector(planetPoint(longitude, latitude, sample(areoidGrid, longitude, latitude) + (height ?? meanElevation))).sub(center);
    positions.push(...position.toArray());
    const t = height === null ? 0 : (height - min) / Math.max(max - min, 1);
    colors.push(0.30 + t * 0.30, 0.13 + t * 0.25, 0.075 + t * 0.18);
  }
  const indices = terrainIndices(grid.elevations_m, grid.rows, grid.cols);
  const surfaceTriangles = indices.length / 3;
  // A narrow render-only collar joins the different resolutions. Its
  // interpolated vertices are not source elevations or scientific outputs.
  const border = [];
  for (let x = 0; x < grid.cols; x++) border.push(x);
  for (let y = 1; y < grid.rows; y++) border.push(y * grid.cols + grid.cols - 1);
  for (let x = grid.cols - 2; x >= 0; x--) border.push((grid.rows - 1) * grid.cols + x);
  for (let y = grid.rows - 2; y > 0; y--) border.push(y * grid.cols);
  let previousRing = border;
  const [spanX, spanY] = metadata.display_span_m;
  // Fixed 750 m visual join, rather than doubling a large regional map.
  const padX = 1500 / spanX, padY = 1500 / spanY;
  for (let ring = 1; ring <= 5; ring++) {
    const t = Math.min(ring / 4, 1), currentRing = [];
    for (let i = 0; i < border.length; i++) {
      const index = border[i], y = Math.floor(index / grid.cols), x = index % grid.cols;
      const tileLon = metadata.longitudes[x], tileLat = metadata.latitudes[y];
      const longitude = lon + (tileLon - lon) * (1 + t * padX);
      const latitude = lat + (tileLat - lat) * (1 + t * padY);
      const innerRadius = sample(areoidGrid, tileLon, tileLat) + (grid.elevations_m[index] ?? meanElevation);
      // Join the actual coarse triangle, not its higher-resolution input grid:
      // interpolation/chord differences otherwise leave a visible crack.
      const outerRadius = baseRadiusAt(longitude, latitude) + 1;
      const radial = (1 - t) * innerRadius + t * outerRadius - (ring === 5 ? 2000 : 0);
      const vertex = vector(planetPoint(longitude, latitude, radial)).sub(center);
      currentRing.push(positions.length / 3);
      positions.push(...vertex.toArray());
      colors.push(...colors.slice(index * 3, index * 3 + 3));
    }
    for (let i = 0; i < border.length; i++) {
      const next = (i + 1) % border.length;
      if (grid.elevations_m[border[i]] !== null && grid.elevations_m[border[next]] !== null)
        indices.push(previousRing[i], currentRing[i], previousRing[next], previousRing[next], currentRing[i], currentRing[next]);
    }
    previousRing = currentRing;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  mesh.position.copy(center);
  mesh.userData = { site: metadata.site, surfaceTriangles, sourceVertices: grid.rows * grid.cols, centerLonLat: metadata.center };
  scene.add(mesh);
  return { mesh, center, metadata };
}

async function initialize() {
  const mola = await get(root + 'manifest');
  const [radiusBuffer, areoidBuffer, ...grids] = await Promise.all([
    get(root + 'radius.i16', true), get(root + 'areoid.i16', true),
    ...mola.patches.map(patch => get(API_BASE + patch.grid))
  ]);
  const radiusGrid = new Int16Array(radiusBuffer), areoidGrid = new Int16Array(areoidBuffer);
  if (radiusGrid.length !== mola.width * mola.height || areoidGrid.length !== radiusGrid.length)
    throw Error('Incomplete MOLA elevation data');
  const geometry = new THREE.SphereGeometry(280, 720, 360);
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const lon = uv.getX(i) * 360 - 180, lat = uv.getY(i) * 180 - 90;
    const radius = sampleMola(radiusGrid, mola.width, mola.height, lon, lat, mola.offset_m);
    position.setXYZ(i, ...planetPoint(lon, lat, radius));
  }
  geometry.computeVertexNormals();
  const baseRadiusAt = (longitude, latitude) => {
    const u = (longitude + 180) / 360, v = (latitude + 90) / 180;
    const column = Math.floor(u * 720), row = Math.floor((1 - v) * 360);
    const direction = vector(planetPoint(longitude, latitude, 1)).normalize();
    const ray = new THREE.Ray(new THREE.Vector3(), direction);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
    for (let y = Math.max(0, row - 1); y <= Math.min(359, row + 1); y++) {
      for (let x = Math.max(0, column - 1); x <= Math.min(719, column + 1); x++) {
        const topLeft = y * 721 + x, topRight = topLeft + 1, bottomLeft = topLeft + 721, bottomRight = bottomLeft + 1;
        for (const indices of [[topRight, topLeft, bottomRight], [topLeft, bottomLeft, bottomRight]]) {
          a.fromBufferAttribute(position, indices[0]); b.fromBufferAttribute(position, indices[1]); c.fromBufferAttribute(position, indices[2]);
          if (ray.intersectTriangle(a, b, c, false, hit)) return hit.length() / SCALE;
        }
      }
    }
    throw Error('Unable to join patch to the MOLA globe');
  };
  const texture = await new THREE.TextureLoader().loadAsync(API_BASE + '/api/v1/basemaps/mars-color');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
  const regions = mola.patches.map(patch => {
    // Mask the globe through the outer edge of the display-only collar.
    const [w, s, e, n] = patch.bounds;
    const [cx, cy] = patch.center;
    const [spanX, spanY] = patch.display_span_m;
    const scaleX = 1 + 1470/spanX, scaleY = 1 + 1470/spanY;
    // Slight overlap with the outer collar covers subpixel/depth rounding at
    // orbit-to-ground scales; fine scientific vertices remain untouched.
    const [west, south, east, north] = [cx + (w-cx)*scaleX, cy + (s-cy)*scaleY, cx + (e-cx)*scaleX, cy + (n-cy)*scaleY];
    return new THREE.Vector4((west + 180) / 360, (south + 90) / 180, (east + 180) / 360, (north + 90) / 180);
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.patchRegions = { value: regions };
    shader.vertexShader = 'varying vec3 terrainPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainPosition = position;');
    shader.fragmentShader = `varying vec3 terrainPosition;\nuniform vec4 patchRegions[${regions.length}];\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>\nvec3 direction = normalize(terrainPosition); vec2 terrainUV=vec2(atan(-direction.z,direction.x)/6.28318530718+0.5, asin(direction.y)/3.14159265359+0.5); for (int i=0;i<${regions.length};i++){ vec4 b=patchRegions[i]; if(terrainUV.x>b.x && terrainUV.x<b.z && terrainUV.y>b.y && terrainUV.y<b.w) discard; }`);
  };
  scene.add(new THREE.Mesh(geometry, material));
  mola.patches.forEach((patch, i) => patches.set(patch.site, createPatch(patch, grids[i], mola, radiusGrid, areoidGrid, baseRadiusAt)));
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => focus(button.dataset.site));
  }
  const requested = new URLSearchParams(location.search).get('site');
  focus(patches.has(requested) ? requested : 'mars');
}

renderer.setAnimationLoop(now => {
  if (flight) {
    const t = Math.min(1, (now - flight.started) / 700), ease = (1 - Math.cos(t * Math.PI)) / 2;
    camera.position.lerpVectors(flight.position, flight.endPosition, ease);
    controls.target.lerpVectors(flight.target, flight.endTarget, ease);
    camera.up.lerpVectors(flight.up, flight.endUp, ease).normalize();
    camera.lookAt(controls.target);
    if (t === 1) {
      // OrbitControls captures the up-axis on construction. Recreate it after
      // a globe/ground transition so local orbit stays above the selected patch.
      const target = flight.endTarget.clone();
      controls.dispose();
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(target);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = activeSite === 'mars' ? 300 : 200 * SCALE;
      controls.maxDistance = 6000;
      controls.minPolarAngle = 0.05;
      controls.maxPolarAngle = activeSite === 'mars' ? Math.PI - 0.05 : Math.PI / 2 - 0.05;
      controls.update();
      flight = null;
    }
  } else controls.update();
  inspectionLight.position.copy(camera.position);
  document.querySelector('#range').textContent = `${(camera.position.distanceTo(controls.target) / SCALE / 1000).toFixed(1)} km view range`;
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
initialize().catch(error => {
  document.querySelector('#error').textContent = error.message;
  status.textContent = 'Terrain loading failed';
  console.error(error);
});
