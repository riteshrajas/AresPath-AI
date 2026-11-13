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
    
    this.clickTimeout = null;
    this.isDragging = false;

    // Blocker 2 & 5 Fix: Properly handle async initialization promise and provide fallback error UI
    this.init().catch(err => {
      console.error("MarsGlobeApp initialization failed:", err);
      this.renderErrorState(err.message);
    });
  }

  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      50000
    );
    this.camera.position.set(0, 0, MARS_RADIUS_SCALED * 4.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = MARS_RADIUS_SCALED * 1.05;
    this.controls.maxDistance = MARS_RADIUS_SCALED * 20;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
    sunLight.position.set(15000, 5000, 10000);
    this.scene.add(sunLight);

    const geometry = new THREE.SphereGeometry(MARS_RADIUS_SCALED, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0xc1440e,
      roughness: 0.9,
      metalness: 0.1
    });
    this.marsMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.marsMesh);
    this.scene.add(this.waypointGroup);

    await this.fetchManifest();
    this.buildWaypoints();
    this.setupUI();

    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Blocker 3 Fix: Handle pointerdown, pointermove, and pointerup to accurately clear isDragging
    this.renderer.domElement.addEventListener('pointerdown', () => { this.isDragging = false; });
    this.renderer.domElement.addEventListener('pointermove', () => { this.isDragging = true; });
    this.renderer.domElement.addEventListener('pointerup', () => { 
      setTimeout(() => { this.isDragging = false; }, 50); 
    });
    
    this.renderer.domElement.addEventListener('click', this.onPointerClick.bind(this));
    this.renderer.domElement.addEventListener('dblclick', this.onPointerDblClick.bind(this));

    this.animate();
  }

  async fetchManifest() {
    try {
      const res = await fetch('/api/v1/globe/manifest');
      if (!res.ok) {
        // Blocker 4 Fix: Throw diagnostic error on non-2xx responses
        throw new Error(`Manifest HTTP error status: ${res.status}`);
      }
      this.manifest = await res.json();
    } catch (e) {
      console.warn("Using offline fallback manifest data.", e);
      this.manifest = { fallback: true, waypoints: WAYPOINTS };
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
      const position = this.latLonToVector3(wp.lat, wp.lon, MARS_RADIUS_SCALED, 6000);

      const markerGeo = new THREE.SphereGeometry(0.8, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(position);
      marker.userData = wp;

      // Blocker 1 Fix: Fully completed statement with THREE.DoubleSide
      const ringGeo = new THREE.RingGeometry(1.2, 1.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: 0.7 
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(position);
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      ring.userData = wp;

      this.waypointGroup.add(marker);
      this.waypointGroup.add(ring);
    });
  }

  setupUI() {
    let panel = document.getElementById('waypoint-info-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'waypoint-info-panel';
      panel.style.cssText = `
        position: absolute; bottom: 24px; left: 24px; background: rgba(10, 10, 15, 0.85);
        border: 1px solid rgba(0, 255, 255, 0.3); padding: 16px; border-radius: 8px;
        color: #fff; font-family: monospace; max-width: 320px; display: none; z-index: 100;
        backdrop-filter: blur(4px); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      `;
      document.body.appendChild(panel);
    }
    this.infoPanel = panel;
  }

  showWaypointInfo(wp) {
    this.selectedWaypoint = wp;
    this.infoPanel.innerHTML = `
      <div style="font-size: 11px; color: #00ffff; letter-spacing: 1px; margin-bottom: 4px;">WAYPOINT #${wp.id}</div>
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">${wp.name}</div>
      <div style="font-size: 12px; color: #aaa; margin-bottom: 12px;">Coordinates: ${wp.lat}° N, ${wp.lon}° E</div>
      <div style="font-size: 13px; line-height: 1.4; color: #ddd; margin-bottom: 12px;">${wp.desc}</div>
      <button id="close-wp-panel" style="background: #00ffff; color: #000; border: none; padding: 6px 12px; font-weight: bold; border-radius: 4px; cursor: pointer;">Close Panel</button>
    `;
    this.infoPanel.style.display = 'block';
    const closeBtn = document.getElementById('close-wp-panel');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.infoPanel.style.display = 'none';
        this.selectedWaypoint = null;
      };
    }
  }

  onPointerClick(event) {
    if (this.isDragging) return;

    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
      return; 
    }

    this.clickTimeout = setTimeout(() => {
      this.clickTimeout = null;
      this.handleRaycast(event, (hitObject) => {
        if (hitObject && hitObject.userData && hitObject.userData.id) {
          this.showWaypointInfo(hitObject.userData);
        }
      });
    }, 250);
  }

  onPointerDblClick(event) {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

    this.handleRaycast(event, (hitObject) => {
      if (hitObject && hitObject.userData && hitObject.userData.id) {
        const targetPos = hitObject.position.clone();
        const startPos = this.camera.position.clone();
        const endPos = targetPos.clone().multiplyScalar(1.5);
        
        let progress = 0;
        const animateZoom = () => {
          progress += 0.05;
          this.camera.position.lerpVectors(startPos, endPos, progress);
          this.controls.target.copy(targetPos);
          this.controls.update();
          if (progress < 1) requestAnimationFrame(animateZoom);
        };
        animateZoom();
      }
    });
  }

  handleRaycast(event, callback) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.waypointGroup.children);

    if (intersects.length > 0) {
      callback(intersects[0].object);
    } else {
      callback(null);
    }
  }

  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    if (this.marsMesh) {
      this.marsMesh.rotation.y += 0.0005;
      this.waypointGroup.rotation.y += 0.0005;
    }

    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  renderErrorState(message) {
    let
