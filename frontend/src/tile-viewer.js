import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { planetPoint } from './globe-math.js';
import { TerrainClient, pointToTile } from './terrain-client.js';

const api = new TerrainClient(import.meta.env.VITE_API_BASE_URL || '');
const scene = new THREE.Scene(); scene.background = new THREE.Color('#10151e');
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.000001, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x342219, 2));
const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-1, 2, 1); scene.add(light);
let mesh, controller;
const status = document.querySelector('#status');
const palette = { MOLA: '#737d89', CTX: '#548aa7', HiRISE: '#c77f4f' };

function display(data) {
  const { rows, cols, radii_m: radii, source_ids: sourceIds } = data.grid;
  const [west, south, east, north] = data.tile.bounds;
  const lon = (west + east) / 2 * Math.PI / 180, lat = (north + south) / 2 * Math.PI / 180;
  const center = new THREE.Vector3(...planetPoint((west + east) / 2, (north + south) / 2, radii[Math.floor(radii.length / 2)]));
  const normal = center.clone().normalize();
  const right = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
  const up = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon));
  const sourceColors = new Map(data.sources.map(s => [s.id, new THREE.Color(palette[s.kind])]));
  const positions = [], colors = [], indices = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    const p = new THREE.Vector3(...planetPoint(west + (east - west) * x / (cols - 1), north - (north - south) * y / (rows - 1), radii[i])).sub(center);
    positions.push(p.dot(right), p.dot(normal), -p.dot(up));
    const color = sourceColors.get(sourceIds[i]); colors.push(color.r, color.g, color.b);
    if (x < cols - 1 && y < rows - 1) indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 })); scene.add(mesh);
  const box = geometry.boundingBox, span = Math.max(...box.getSize(new THREE.Vector3()).toArray());
  controls.target.copy(box.getCenter(new THREE.Vector3()));
  camera.position.copy(controls.target).add(new THREE.Vector3(span * .7, span * .8, span));
  controls.minDistance = span / 50; controls.maxDistance = span * 20; controls.update();
}

async function load(event) {
  event?.preventDefault(); controller?.abort(); controller = new AbortController();
  const signal = controller.signal;
  const longitude = Number(document.querySelector('#longitude').value), latitude = Number(document.querySelector('#latitude').value);
  try {
    const { z, x, y } = pointToTile(longitude, latitude, Number(document.querySelector('#zoom').value));
    status.textContent = 'Loading source terrain from the backend…';
    const [tile, coverage] = await Promise.all([api.tile(z, x, y, 65, signal), api.coverage(longitude, latitude, signal)]);
    if (signal.aborted) return;
    display(tile);
    status.textContent = `Loaded ${tile.grid.rows} × ${tile.grid.cols} terrain nodes · tile ${z}/${x}/${y}.`;
    const total = tile.grid.rows * tile.grid.cols;
    const kinds = new Map();
    for (const source of tile.sources) kinds.set(source.kind, (kinds.get(source.kind) || 0) + tile.source_counts[source.id]);
    document.querySelector('#coverage').textContent = 'Selected point: ' + coverage.selected_source.name + '. Tile: '
      + [...kinds].map(([kind,count]) => `${kind} ${(100 * count / total).toFixed(1)}%`).join(', ') + '.';
    const link = document.querySelector('#json'); link.hidden = false;
    link.href = `${api.base}/api/v1/tiles/${z}/${x}/${y}?size=65`;
  } catch (error) { if (error.name !== 'AbortError') status.textContent = `Terrain request failed: ${error.message}${mesh ? ' The previous tile remains visible.' : ''}`; }
}
document.querySelector('#tile-form').addEventListener('submit', load);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
load();
