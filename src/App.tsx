import React, { useState, useMemo, useCallback } from 'react';
import { generateMartianTerrain, MarsSector, TerrainData } from './engine/terrainGenerator';
import { findOptimalMartianRoute, Point2D, RouteResult } from './algorithms/pathfinding';
import { MartianCanvas, SensorMode, CameraMode } from './components/MartianCanvas';
import { HUDOverlay } from './components/HUDOverlay';

export default function App() {
  const [selectedSector, setSelectedSector] = useState<MarsSector>('jezero');
  const [gridSize] = useState(128);
  const [resolution] = useState(10); // 10m per grid cell

  // Sensor & Camera Modes (God's Eye View style)
  const [sensorMode, setSensorMode] = useState<SensorMode>('optical');
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbital');

  // Layer Toggles
  const [showHazardHeatmap, setShowHazardHeatmap] = useState(false);
  const [showContourLines, setShowContourLines] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);

  // Custom AI Reconstructed Terrain State
  const [customTerrain, setCustomTerrain] = useState<TerrainData | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  // Generate or use custom terrain data
  const terrain = useMemo(() => {
    if (customTerrain) return customTerrain;
    return generateMartianTerrain(selectedSector, gridSize, resolution);
  }, [selectedSector, gridSize, resolution, customTerrain]);

  // Waypoints state
  const [startPoint, setStartPoint] = useState<Point2D>({ x: 22, y: 28 });
  const [goalPoint, setGoalPoint] = useState<Point2D>({ x: 104, y: 98 });
  const [pinMode, setPinMode] = useState<'start' | 'goal'>('goal');

  // Compute 3D A* route
  const route = useMemo<RouteResult | null>(() => {
    return findOptimalMartianRoute(terrain, startPoint, goalPoint);
  }, [terrain, startPoint, goalPoint]);

  const handleSelectPoint = useCallback((pt: Point2D) => {
    if (pinMode === 'start') {
      setStartPoint(pt);
      setPinMode('goal');
    } else {
      setGoalPoint(pt);
    }
  }, [pinMode]);

  const handleReset = () => {
    setStartPoint({ x: 22, y: 28 });
    setGoalPoint({ x: 104, y: 98 });
    setCustomTerrain(null);
  };

  const handleSectorChange = (sector: MarsSector) => {
    setCustomTerrain(null);
    setSelectedSector(sector);
  };

  // Upload 2D satellite photo -> Reconstruct 3D with AI
  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingAI(true);

    try {
      // 1. Try remote yoko GPU server first
      const formData = new FormData();
      formData.append('file', file);

      let data;
      try {
        const response = await fetch('http://localhost:8000/api/reconstruct-3d', {
          method: 'POST',
          body: formData,
        });
        if (response.ok) {
          data = await response.json();
        }
      } catch (err) {
        console.warn('Yoko server offline, using local client-side depth synthesis', err);
      }

      // 2. Client-side fallback if server offline
      if (!data) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise((res) => (img.onload = res));

        const canvas = document.createElement('canvas');
        canvas.width = gridSize;
        canvas.height = gridSize;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, gridSize, gridSize);
        const imgData = ctx.getImageData(0, 0, gridSize, gridSize);

        const elevations = new Float32Array(gridSize * gridSize);
        const slopes = new Float32Array(gridSize * gridSize);
        const hazards = new Uint8Array(gridSize * gridSize);
        const thermalInertia = new Float32Array(gridSize * gridSize);

        let minElev = Infinity;
        let maxElev = -Infinity;

        for (let i = 0; i < elevations.length; i++) {
          const r = imgData.data[i * 4];
          const g = imgData.data[i * 4 + 1];
          const b = imgData.data[i * 4 + 2];
          // Grayscale luminance
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
          const elev = lum * 48.0;
          elevations[i] = elev;
          thermalInertia[i] = Math.max(0.1, Math.min(0.95, lum));

          if (elev < minElev) minElev = elev;
          if (elev > maxElev) maxElev = elev;
        }

        // Slopes & Hazards
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const idx = y * gridSize + x;
            const x0 = Math.max(0, x - 1);
            const x1 = Math.min(gridSize - 1, x + 1);
            const y0 = Math.max(0, y - 1);
            const y1 = Math.min(gridSize - 1, y + 1);

            const dzdx = (elevations[y * gridSize + x1] - elevations[y * gridSize + x0]) / ((x1 - x0) * resolution);
            const dzdy = (elevations[y1 * gridSize + x] - elevations[y0 * gridSize + x]) / ((y1 - y0) * resolution);
            const slopeDeg = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);
            slopes[idx] = slopeDeg;
            hazards[idx] = slopeDeg >= 20 ? 2 : slopeDeg >= 12 ? 1 : 0;
          }
        }

        setCustomTerrain({
          sector: selectedSector,
          name: `Custom Recon: ${file.name.slice(0, 18)}`,
          coordinates: 'Custom Tile | DepthPro Synthesized',
          width: gridSize,
          height: gridSize,
          resolution,
          elevations,
          slopes,
          hazards,
          thermalInertia,
          minElevation: minElev,
          maxElevation: maxElev
        });
      }
    } finally {
      setIsProcessingAI(false);
    }
  };

  return (
    <main className="relative w-screen h-screen bg-[#07090e] overflow-hidden select-none">
      {/* 3D WebGL Canvas Layer */}
      <MartianCanvas
        terrain={terrain}
        startPoint={startPoint}
        goalPoint={goalPoint}
        route={route}
        sensorMode={sensorMode}
        cameraMode={cameraMode}
        showHazardHeatmap={showHazardHeatmap}
        showContourLines={showContourLines}
        showGridLines={showGridLines}
        onSelectPoint={handleSelectPoint}
      />

      {/* Sci-Fi God's Eye View HUD Layer */}
      <HUDOverlay
        terrain={terrain}
        startPoint={startPoint}
        goalPoint={goalPoint}
        route={route}
        sensorMode={sensorMode}
        setSensorMode={setSensorMode}
        cameraMode={cameraMode}
        setCameraMode={setCameraMode}
        selectedSector={selectedSector}
        setSelectedSector={handleSectorChange}
        showHazardHeatmap={showHazardHeatmap}
        setShowHazardHeatmap={setShowHazardHeatmap}
        showContourLines={showContourLines}
        setShowContourLines={setShowContourLines}
        showGridLines={showGridLines}
        setShowGridLines={setShowGridLines}
        pinMode={pinMode}
        setPinMode={setPinMode}
        onRecalculate={() => {
          setStartPoint({ ...startPoint });
        }}
        onResetPoints={handleReset}
        onUploadImage={handleUploadImage}
        isProcessingAI={isProcessingAI}
      />
    </main>
  );
}
