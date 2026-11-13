import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- AresPath AI: Global Mars Globe & 12-Waypoint Architecture ---
const SCALE = 1 / 1000; // 1 unit = 1 km
const MARS_RADIUS_KM = 3389.5;
const MARS_RADIUS_SCALED = MARS_RADIUS_KM * SCALE;

const WAYPOINTS = [
  { id: 1, name: "Jezero Crater Landing Site", lat: 18.38, lon: 77.58, desc: "Perseverance rover operational base and delta collection zone." },
  { id: 2, name: "Olympus Mons Summit", lat: 18.65, lon: 226.2, desc: "Highest volcano and tallest planetary mountain in the Solar System." },
  { id: 3, name: "Valles Marineris Central", lat: -10.5, lon: 300.0, desc: "Vast canyon system stretching over 4,000 kilometers across the equator." },
  { id: 4, name: "Gale Crater (Curiosity)", lat: -5.4, lon: 137.8, desc: "Mount Sharp layered sediment profiling and ancient lakebed analysis." },
  { id: 5, name: "Elysium Planitia", lat: 4.5, lon: 135.6, desc: "Smooth volcanic plain and InSight seismometer touchdown area." },
  { id: 6, name: "Arcadia Planitia", lat: 40.0, lon: 188.0, desc: "Extensive smooth plains featuring potential subsurface water ice reserves." },
  { id: 7, name: "Hellas Planitia Basin", lat: -42.4, lon: 70.5, desc: "Massive impact crater representing the lowest elevation point on Mars." },
  { id: 8, name: "Arsia Mons Caldera", lat: -8.4, lon: 239.0, desc: "Southernmost shield volcano of the Tharsis region with deep collapse pits." },
  { id: 9, name: "Utopia Planitia", lat: 46.7, lon: 117.5, desc: "Largest recognized impact basin on Mars, rich in subsurface volatile stores." },
  { id: 10, name: "Syrtis Major Planum", lat: 8.1, lon: 69.5, desc: "Dark volcanic province displaying distinct basaltic mineral compositions." },
  { id: 11, name: "Polar Ice Cap (North)", lat: 88.0, lon: 0.0, desc: "Permanent water and carbon dioxide seasonal layered frost deposits." },
  { id: 12, name: "Meridiani Planum", lat: -1.9, lon: 5.5, desc: "Hematite-rich landing plane explored by the Opportunity rover." }
];

export class MarsGlobeApp {
  constructor(containerId = 'globe-container') {
    this.container = document.getElementById(containerId) || document.body;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.marsMesh = null;
    this.waypointGroup = new THREE.Group();
    this.manifest = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedWaypoint = null;
    
    // Interaction disambiguation (Single vs Double click fix)
    this.clickTimeout = null;
    this.isDragging = false;

    this.init();
  }

  async init() {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      50000
    );
    this.camera.position.set(0, 0, MARS_RADIUS_SCALED * 4.5);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = MARS_RADIUS_SCALED * 1.05;
    this.controls.maxDistance = MARS_RADIUS_SCALED * 20;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
    sunLight.position.set(15000, 5000, 10000);
    this.scene.add(sunLight);

    // 6. Create Mars Sphere
    const geometry = new THREE.SphereGeometry(MARS_RADIUS_SCALED, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0xc1440e,
      roughness: 0.9,
      metalness: 0.1
    });
    this.marsMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.marsMesh);
    this.scene.add(this.waypointGroup);

    // 7. Load Manifest & Build Waypoints
    await this.fetchManifest();
    this.buildWaypoints();
    this.setupUI();

    // 8. Event Listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.renderer.domElement.addEventListener('pointerdown', () => { this.isDragging = false; });
    this.renderer.domElement.addEventListener('pointermove', () => { this.isDragging = true; });
    this.renderer.domElement.addEventListener('click', this.onPointerClick.bind(this));
    this.renderer.domElement.addEventListener('dblclick', this.onPointerDblClick.bind(this));

    // 9. Start Loop
    this.animate();
  }

  async fetchManifest() {
    try {
      const res = await fetch('/api/v1/globe/manifest');
      if (res.ok) {
        this.manifest = await res.json();
      }
    } catch (e) {
      console.warn("Using offline fallback manifest data.", e);
    }
  }

  latLonToVector3(lat, lon, radius, elevationOffset = 0) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const r = radius + (elevationOffset * SCALE);

    const x = -(r * Math.sin(phi) * Math.cos(theta));
    const z = (r * Math.sin(phi) * Math.sin(theta));
    const y = (r * Math.cos(phi));

    return new THREE.Vector3(x, y, z);
  }

  buildWaypoints() {
    WAYPOINTS.forEach((wp) => {
      // Fix 2: Correct radius calculation in meters with proper scale conversion
      const position = this.latLonToVector3(wp.lat, wp.lon, MARS_RADIUS_SCALED, 6000);

      // Marker visual mesh
      const markerGeo = new THREE.SphereGeometry(0.8, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(position);
      marker.userData = wp;

      // Outer pulsing ring
      const ringGeo = new THREE.RingGeometry(1.2, 1.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.Double
