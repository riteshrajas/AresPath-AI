import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TerrainData } from '../engine/terrainGenerator';
import { Point2D, RouteResult } from '../algorithms/pathfinding';

export type SensorMode = 'optical' | 'flir' | 'nvg' | 'lidar' | 'crt';
export type CameraMode = 'orbital' | 'rover' | 'cinematic';

interface MartianCanvasProps {
  terrain: TerrainData;
  startPoint: Point2D;
  goalPoint: Point2D;
  route: RouteResult | null;
  sensorMode: SensorMode;
  cameraMode: CameraMode;
  showHazardHeatmap: boolean;
  showContourLines: boolean;
  showGridLines: boolean;
  onSelectPoint?: (pt: Point2D) => void;
}

export const MartianCanvas: React.FC<MartianCanvasProps> = ({
  terrain,
  startPoint,
  goalPoint,
  route,
  sensorMode,
  cameraMode,
  showHazardHeatmap,
  showContourLines,
  showGridLines,
  onSelectPoint
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const routeLineRef = useRef<THREE.Line | null>(null);
  const startMarkerRef = useRef<THREE.Group | null>(null);
  const goalMarkerRef = useRef<THREE.Group | null>(null);
  const roverMeshRef = useRef<THREE.Group | null>(null);

  // Animation & Camera state
  const isDragging = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const cameraSpherical = useRef({ radius: 220, theta: Math.PI / 4, phi: Math.PI / 3 });
  const cameraTarget = useRef(new THREE.Vector3(0, 0, 0));
  const roverProgress = useRef(0.0);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(getBgColor(sensorMode));
    scene.fog = new THREE.FogExp2(getBgColor(sensorMode), 0.0025);
    sceneRef.current = scene;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 3000);
    updateCameraPosition(camera);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = sensorMode === 'nvg' ? 1.8 : 1.2;
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting
    setupLighting(scene, sensorMode);

    // 5. Grid Helper
    if (showGridLines) {
      const grid = new THREE.GridHelper(terrain.width, 32, 0x00F0FF, 0x1F293D);
      grid.position.y = terrain.minElevation * 0.8 - 2;
      scene.add(grid);
      gridHelperRef.current = grid;
    }

    // 6. Terrain Mesh
    buildTerrain(scene);

    // 7. Markers & Rover
    createMarkerPins(scene);
    createRoverModel(scene);

    // 8. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Animate Rover movement along route
      if (route && route.path.length > 1 && roverMeshRef.current) {
        roverProgress.current = (roverProgress.current + delta * 0.08) % 1.0;
        const totalNodes = route.path.length;
        const floatIdx = roverProgress.current * (totalNodes - 1);
        const baseIdx = Math.floor(floatIdx);
        const nextIdx = Math.min(totalNodes - 1, baseIdx + 1);
        const frac = floatIdx - baseIdx;

        const p1 = route.path[baseIdx];
        const p2 = route.path[nextIdx];

        const halfW = terrain.width / 2;
        const halfH = terrain.height / 2;

        const curX = (p1.x + (p2.x - p1.x) * frac) - halfW;
        const curY = (p1.z + (p2.z - p1.z) * frac) * 0.8 + 1.2;
        const curZ = (p1.y + (p2.y - p1.y) * frac) - halfH;

        roverMeshRef.current.position.set(curX, curY, curZ);

        const heading = Math.atan2((p2.x - p1.x), (p2.y - p1.y));
        roverMeshRef.current.rotation.y = heading;

        // Camera Follow Modes
        if (cameraRef.current) {
          if (cameraMode === 'rover') {
            // First-person cockpit view behind rover
            cameraRef.current.position.set(
              curX - Math.sin(heading) * 12,
              curY + 5,
              curZ - Math.cos(heading) * 12
            );
            cameraRef.current.lookAt(curX + Math.sin(heading) * 20, curY + 2, curZ + Math.cos(heading) * 20);
          } else if (cameraMode === 'cinematic') {
            // Smooth orbiting tracking shot
            const time = clock.getElapsedTime() * 0.3;
            cameraRef.current.position.set(
              curX + Math.cos(time) * 35,
              curY + 20,
              curZ + Math.sin(time) * 35
            );
            cameraRef.current.lookAt(curX, curY, curZ);
          }
        }
      }

      if (cameraMode === 'orbital' && cameraRef.current) {
        updateCameraPosition(cameraRef.current);
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
    window.removeEventListener('resize', handleResize);
    cancelAnimationFrame(animationFrameId);

    scene.traverse(object => {
      if (object instanceof THREE.Mesh ||
          object instanceof THREE.Line) {
        object.geometry.dispose();

        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        materials.forEach(material => material.dispose());
      }
    });

    renderer.dispose();
  };
  }, [terrain]);

  // Update shaders / sensor mode
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.background = new THREE.Color(getBgColor(sensorMode));
    sceneRef.current.fog = new THREE.FogExp2(getBgColor(sensorMode), 0.0025);
    setupLighting(sceneRef.current, sensorMode);
    buildTerrain(sceneRef.current);
  }, [sensorMode, showHazardHeatmap, showContourLines]);

  useEffect(() => {
    if (!sceneRef.current) return;
    updateRouteLine(sceneRef.current);
    updateMarkers();
  }, [route, startPoint, goalPoint]);

  function getBgColor(mode: SensorMode): number {
    switch (mode) {
      case 'nvg': return 0x021105;
      case 'flir': return 0x0B0418;
      case 'crt': return 0x120C02;
      case 'lidar': return 0x040814;
      default: return 0x07090e;
    }
  }

  function setupLighting(scene: THREE.Scene, mode: SensorMode) {
    // Clear old lights
    const oldSun = scene.getObjectByName('__sunMesh__');

    if (oldSun instanceof THREE.Mesh) {
      scene.remove(oldSun);
      oldSun.geometry.dispose();
    const materials = Array.isArray(oldSun.material)
      ? oldSun.material
      : [oldSun.material];
    materials.forEach(material => material.dispose());
    }
    const toRemove = scene.children.filter(c => c instanceof THREE.Light);
    toRemove.forEach(l => scene.remove(l));

    let sunColor = 0xffecd0;
    let ambColor = 0x3a4055;

    if (mode === 'nvg') {
      sunColor = 0x22ff55;
      ambColor = 0x0a3311;
    } else if (mode === 'flir') {
      sunColor = 0xff6622;
      ambColor = 0x220033;
    } else if (mode === 'crt') {
      sunColor = 0xffb703;
      ambColor = 0x2a1b04;
    }

    const ambientLight = new THREE.AmbientLight(ambColor, 0.9);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(sunColor, 2.5);
    sunLight.position.set(150, 180, 120);
    sunLight.castShadow = true;
    scene.add(sunLight);
    // Visible Sun in the Martian sky
    const sunGeometry = new THREE.SphereGeometry(5, 32, 32);

    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff5cc,
      fog: false,
      depthWrite: false
    });
    const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.name = '__sunMesh__';

    sunMesh.position.copy(sunLight.position);
    scene.add(sunMesh);
    }  

  function updateCameraPosition(cam: THREE.PerspectiveCamera) {
    const { radius, theta, phi } = cameraSpherical.current;
    cam.position.x = cameraTarget.current.x + radius * Math.sin(phi) * Math.sin(theta);
    cam.position.y = cameraTarget.current.y + radius * Math.cos(phi);
    cam.position.z = cameraTarget.current.z + radius * Math.sin(phi) * Math.cos(theta);
    cam.lookAt(cameraTarget.current);
  }

  function buildTerrain(scene: THREE.Scene) {
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();

      const materials = Array.isArray(meshRef.current.material)
        ? meshRef.current.material
        : [meshRef.current.material];

      materials.forEach(material => material.dispose());

      meshRef.current = null;
    }

    const { width, height, elevations, slopes, hazards, thermalInertia, minElevation, maxElevation } = terrain;
    const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1);
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const elev = elevations[i];
      posAttr.setY(i, elev * 0.8);

      const slope = slopes[i];
      const hazard = hazards[i];
      const normElev = (elev - minElevation) / (maxElevation - minElevation || 1);

      let r = 0.78, g = 0.35, b = 0.22; // Optical Mars rust

      if (showHazardHeatmap) {
        if (hazard === 2 || slope >= 20) {
          r = 0.95; g = 0.12; b = 0.12; // Red Danger
        } else if (hazard === 1 || slope >= 12) {
          r = 0.95; g = 0.75; b = 0.1; // Amber Caution
        } else {
          r = 0.1; g = 0.85; b = 0.55; // Cyan Safe
        }
      } else if (sensorMode === 'flir') {
        // FLIR Thermal Ironbow palette
        const t = thermalInertia[i] || 0.5;
        r = Math.min(1.0, t * 1.8);
        g = Math.max(0.0, (t - 0.3) * 1.5);
        b = Math.max(0.1, 1.0 - t * 1.5);
      } else if (sensorMode === 'nvg') {
        // Night Vision Green Phosphor
        const v = 0.3 + normElev * 0.65;
        r = v * 0.15;
        g = v * 0.98;
        b = v * 0.25;
      } else if (sensorMode === 'lidar') {
        // Rainbow LiDAR Elevation Bands
        r = Math.sin(normElev * Math.PI * 2) * 0.5 + 0.5;
        g = Math.sin((normElev + 0.33) * Math.PI * 2) * 0.5 + 0.5;
        b = Math.sin((normElev + 0.66) * Math.PI * 2) * 0.5 + 0.5;
      } else if (sensorMode === 'crt') {
        // Amber Monochrome CRT
        const v = 0.4 + normElev * 0.6;
        r = v * 0.98;
        g = v * 0.65;
        b = v * 0.05;
      } else {
        // Standard Optical Mars
        r = 0.55 + normElev * 0.35;
        g = 0.25 + normElev * 0.2;
        b = 0.15 + normElev * 0.15;

        if (showContourLines && Math.floor(elev * 1.5) % 4 === 0) {
          r *= 1.35; g *= 1.35; b *= 1.35;
        }
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: sensorMode === 'crt'
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;
  }

  function createMarkerPins(scene: THREE.Scene) {
    // Start Pin (Cyan)
    const startGrp = new THREE.Group();
    const startGeo = new THREE.ConeGeometry(2, 6, 8);
    startGeo.rotateX(Math.PI);
    const startMat = new THREE.MeshStandardMaterial({ color: 0x00F0FF, emissive: 0x00A0CC });
    startGrp.add(new THREE.Mesh(startGeo, startMat));
    scene.add(startGrp);
    startMarkerRef.current = startGrp;

    // Goal Pin (Orange)
    const goalGrp = new THREE.Group();
    const goalGeo = new THREE.ConeGeometry(2, 6, 8);
    goalGeo.rotateX(Math.PI);
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xFF7A59, emissive: 0xCC4420 });
    goalGrp.add(new THREE.Mesh(goalGeo, goalMat));
    scene.add(goalGrp);
    goalMarkerRef.current = goalGrp;

    updateMarkers();
  }

  function createRoverModel(scene: THREE.Scene) {
    const roverGrp = new THREE.Group();
    // Chassis
    const bodyGeo = new THREE.BoxGeometry(2.4, 1.2, 3.2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xDDDDDD, metalness: 0.8, roughness: 0.2 });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.8;
    roverGrp.add(bodyMesh);

    // Mastcam & Beacon
    const mastGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.6);
    const mastMesh = new THREE.Mesh(mastGeo, bodyMat);
    mastMesh.position.set(0.6, 2.0, -0.8);
    roverGrp.add(mastMesh);

    const beaconGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00F0FF });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.set(0.6, 2.8, -0.8);
    roverGrp.add(beaconMesh);

    scene.add(roverGrp);
    roverMeshRef.current = roverGrp;
  }

  function updateMarkers() {
    const { width, height, elevations } = terrain;
    const halfW = width / 2;
    const halfH = height / 2;

    if (startMarkerRef.current) {
      const sIdx = startPoint.y * width + startPoint.x;
      const sElev = elevations[sIdx] || 0;
      startMarkerRef.current.position.set(startPoint.x - halfW, sElev * 0.8 + 4, startPoint.y - halfH);
    }

    if (goalMarkerRef.current) {
      const gIdx = goalPoint.y * width + goalPoint.x;
      const gElev = elevations[gIdx] || 0;
      goalMarkerRef.current.position.set(goalPoint.x - halfW, gElev * 0.8 + 4, goalPoint.y - halfH);
    }
  }

  function updateRouteLine(scene: THREE.Scene) {
    if (routeLineRef.current) {
      scene.remove(routeLineRef.current);
      routeLineRef.current.geometry.dispose();
      routeLineRef.current.material.dispose();
      routeLineRef.current = null;
    }

    if (!route || route.path.length < 2) return;

    const { width, height } = terrain;
    const halfW = width / 2;
    const halfH = height / 2;

    const points: THREE.Vector3[] = [];
    for (const pt of route.path) {
      points.push(new THREE.Vector3(pt.x - halfW, pt.z * 0.8 + 0.8, pt.y - halfH));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const smoothPoints = curve.getPoints(Math.max(60, points.length * 4));
    const geometry = new THREE.BufferGeometry().setFromPoints(smoothPoints);

    const material = new THREE.LineBasicMaterial({
      color: sensorMode === 'nvg' ? 0x00FF66 : 0x00F0FF,
      linewidth: 3
    });

    const line = new THREE.Line(geometry, material);
    scene.add(line);
    routeLineRef.current = line;
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || cameraMode !== 'orbital') return;
    const deltaX = e.clientX - prevMousePos.current.x;
    const deltaY = e.clientY - prevMousePos.current.y;
    prevMousePos.current = { x: e.clientX, y: e.clientY };

    cameraSpherical.current.theta -= deltaX * 0.008;
    cameraSpherical.current.phi = Math.max(0.12, Math.min(Math.PI / 2 - 0.05, cameraSpherical.current.phi - deltaY * 0.008));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (cameraMode !== 'orbital') return;
    cameraSpherical.current.radius = Math.max(30, Math.min(480, cameraSpherical.current.radius + e.deltaY * 0.15));
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !meshRef.current || !onSelectPoint) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersects = raycaster.intersectObject(meshRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0].point;
      const { width, height } = terrain;
      const x = Math.round(hit.x + width / 2);
      const y = Math.round(hit.z + height / 2);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        onSelectPoint({ x, y });
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative ${cameraMode === 'orbital' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleClick}
    />
  );
};
