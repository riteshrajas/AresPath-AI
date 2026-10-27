import React from 'react';
import { RouteResult, Point2D } from '../algorithms/pathfinding';
import { SensorMode, CameraMode } from './MartianCanvas';
import { MarsSector, TerrainData } from '../engine/terrainGenerator';
import {
  ShieldAlert,
  Compass,
  Navigation,
  Activity,
  Sun,
  Eye,
  Video,
  Layers,
  Globe2,
  Sliders,
  Crosshair,
  Wifi
} from 'lucide-react';

interface HUDOverlayProps {
  terrain: TerrainData;
  startPoint: Point2D;
  goalPoint: Point2D;
  route: RouteResult | null;
  sensorMode: SensorMode;
  setSensorMode: (mode: SensorMode) => void;
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
  selectedSector: MarsSector;
  setSelectedSector: (s: MarsSector) => void;
  showHazardHeatmap: boolean;
  setShowHazardHeatmap: (val: boolean) => void;
  showContourLines: boolean;
  setShowContourLines: (val: boolean) => void;
  showGridLines: boolean;
  setShowGridLines: (val: boolean) => void;
  pinMode: 'start' | 'goal';
  setPinMode: (mode: 'start' | 'goal') => void;
  onRecalculate: () => void;
  onResetPoints: () => void;
  onUploadImage?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessingAI?: boolean;
}

export const HUDOverlay: React.FC<HUDOverlayProps> = ({
  terrain,
  startPoint,
  goalPoint,
  route,
  sensorMode,
  setSensorMode,
  cameraMode,
  setCameraMode,
  selectedSector,
  setSelectedSector,
  showHazardHeatmap,
  setShowHazardHeatmap,
  showContourLines,
  setShowContourLines,
  showGridLines,
  setShowGridLines,
  pinMode,
  setPinMode,
  onRecalculate,
  onResetPoints,
  onUploadImage,
  isProcessingAI
}) => {
  return (
    <div className="pointer-events-none absolute inset-0 p-4 flex flex-col justify-between overflow-hidden">
      {/* 1. TOP HEADER / TACTICAL MISSION STATUS */}
      <div className="flex items-center justify-between pointer-events-auto">
        {/* Brand & Sector info */}
        <div className="glass-panel px-4 py-2.5 rounded-lg flex items-center gap-3 border border-mars-border glow-cyan">
          <div className="w-3 h-3 rounded-full bg-mars-cyan animate-ping" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase font-mono text-white">
                AresPath AI
              </h1>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-mars-cyan border border-mars-cyan/40 font-mono">
                GOD'S EYE MARS
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-mono flex items-center gap-2">
              <Globe2 className="w-3 h-3 text-mars-cyan inline" />
              <span>{terrain.name} [{terrain.coordinates}]</span>
            </p>
          </div>
        </div>

        {/* Global Live Feeds & Sensor Status */}
        <div className="flex items-center gap-2">
          {/* Sector Quick Switcher */}
          <div className="glass-panel px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-mono">
            <span className="text-gray-400 text-[10px] px-1">ZONE:</span>
            {(['jezero', 'gale', 'olympus', 'valles'] as MarsSector[]).map((sec) => (
              <button
                key={sec}
                onClick={() => setSelectedSector(sec)}
                className={`px-2 py-1 rounded text-[11px] font-bold uppercase transition-all ${
                  selectedSector === sec
                    ? 'bg-mars-cyan text-black font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>

          <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-mono text-gray-300">
            <Wifi className="w-3.5 h-3.5 text-mars-safe animate-pulse" />
            <span>EARTH LOS: <strong className="text-mars-safe">ACTIVE</strong></span>
          </div>

          <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-mono text-gray-300">
            <Sun className="w-3.5 h-3.5 text-yellow-400" />
            <span>SOL 1042</span>
          </div>
        </div>
      </div>

      {/* 2. TACTICAL RETICLE & SENSOR SUITE (LEFT PANEL) */}
      <div className="absolute top-20 left-4 pointer-events-auto flex flex-col gap-3 w-64">
        {/* Sensor Shader Modes */}
        <div className="glass-panel p-3.5 rounded-xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs font-mono text-gray-300 font-semibold border-b border-mars-border pb-1.5">
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-mars-cyan" /> SENSOR LOOKS
            </span>
            <span className="text-[10px] text-mars-cyan uppercase font-mono">{sensorMode}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
            {(
              [
                { id: 'optical', label: 'Optical RGB' },
                { id: 'flir', label: 'FLIR Thermal' },
                { id: 'nvg', label: 'NVG Phosphor' },
                { id: 'lidar', label: 'LiDAR Elevation' },
                { id: 'crt', label: 'CRT Amber' }
              ] as { id: SensorMode; label: string }[]
            ).map((mode) => (
              <button
                key={mode.id}
                onClick={() => setSensorMode(mode.id)}
                className={`px-2.5 py-1.5 rounded-md border transition-all text-left ${
                  sensorMode === mode.id
                    ? 'bg-mars-cyan/25 border-mars-cyan text-white glow-cyan'
                    : 'bg-mars-card/50 border-mars-border text-gray-400 hover:text-white'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Camera Views */}
        <div className="glass-panel p-3.5 rounded-xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs font-mono text-gray-300 font-semibold border-b border-mars-border pb-1.5">
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-mars-cyan" /> CAMERA VIEWS
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
            {(
              [
                { id: 'orbital', label: 'God View' },
                { id: 'rover', label: 'Cockpit' },
                { id: 'cinematic', label: 'Flyby' }
              ] as { id: CameraMode; label: string }[]
            ).map((cam) => (
              <button
                key={cam.id}
                onClick={() => setCameraMode(cam.id)}
                className={`py-1.5 rounded-md border transition-all text-center ${
                  cameraMode === cam.id
                    ? 'bg-mars-cyan text-black font-bold'
                    : 'bg-mars-card/50 border-mars-border text-gray-400 hover:text-white'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>
        </div>

        {/* Map Layers Toggles */}
        <div className="glass-panel p-3.5 rounded-xl flex flex-col gap-2 text-xs font-mono">
          <div className="flex items-center justify-between text-gray-300 font-semibold border-b border-mars-border pb-1.5">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-mars-cyan" /> GIS OVERLAYS
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between cursor-pointer text-gray-300">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> AI Hazard Heatmap
              </span>
              <input
                type="checkbox"
                checked={showHazardHeatmap}
                onChange={(e) => setShowHazardHeatmap(e.target.checked)}
                className="rounded accent-mars-cyan"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-gray-300">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Topo Contours
              </span>
              <input
                type="checkbox"
                checked={showContourLines}
                onChange={(e) => setShowContourLines(e.target.checked)}
                className="rounded accent-mars-cyan"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer text-gray-300">
              <span className="flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-gray-400" /> Tactical Grid
              </span>
              <input
                type="checkbox"
                checked={showGridLines}
                onChange={(e) => setShowGridLines(e.target.checked)}
                className="rounded accent-mars-cyan"
              />
            </label>
          </div>

          {/* AI4MARS Official Classification Legend */}
          <div className="mt-1 pt-2 border-t border-mars-border">
            <span className="text-[10px] text-gray-400 font-mono block mb-1.5 font-semibold text-mars-cyan">
              NASA JPL AI4MARS CLASSES:
            </span>
            <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
              <div className="flex items-center gap-1.5 text-gray-300">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Soil (0) - Safe</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Bedrock (1) - Safe</span>
              </div>
              <div className="flex items-center gap-1.5 text-yellow-400">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <span>Sand (2) - Slip Risk</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-400">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Boulders (3) - Hazard</span>
              </div>
            </div>
          </div>

          {/* AI DepthPro Reconstruct Tile Button */}
          <div className="mt-2 pt-2 border-t border-mars-border">
            <label className="w-full py-1.5 px-2.5 rounded-lg bg-cyan-950/60 border border-mars-cyan/40 hover:bg-cyan-900/60 text-mars-cyan font-mono text-[11px] cursor-pointer flex items-center justify-center gap-2 transition-all">
              <span>{isProcessingAI ? '⚡ PROCESSING ON YOKO...' : '📷 RECONSTRUCT 2D TILE (AI)'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={onUploadImage}
                className="hidden"
                disabled={isProcessingAI}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 3. NAVIGATION CONTROLS & ROUTE TELEMETRY (RIGHT PANEL) */}
      <div className="absolute top-20 right-4 pointer-events-auto flex flex-col gap-3 w-80">
        {/* Waypoint Pins & A* Solver */}
        <div className="glass-panel p-4 rounded-xl flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-gray-300 font-semibold border-b border-mars-border pb-2">
            <span className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-mars-cyan" /> MISSION WAYPOINTS
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-mono text-gray-400">Click 3D Terrain to Place:</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPinMode('start')}
                className={`px-3 py-2 text-xs font-mono rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                  pinMode === 'start'
                    ? 'bg-mars-cyan/30 border-mars-cyan text-white ring-1 ring-mars-cyan'
                    : 'bg-mars-card/60 border-mars-border text-gray-400'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-mars-cyan" />
                <span>Base ({startPoint.x}, {startPoint.y})</span>
              </button>

              <button
                onClick={() => setPinMode('goal')}
                className={`px-3 py-2 text-xs font-mono rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                  pinMode === 'goal'
                    ? 'bg-mars-orange/30 border-mars-orange text-white ring-1 ring-mars-orange'
                    : 'bg-mars-card/60 border-mars-border text-gray-400'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-mars-orange" />
                <span>Target ({goalPoint.x}, {goalPoint.y})</span>
              </button>
            </div>
          </div>

          <button
            onClick={onRecalculate}
            className="w-full mt-1 py-2.5 rounded-lg bg-mars-cyan text-black font-mono font-bold text-xs hover:bg-cyan-300 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>CALCULATE 3D A* TRAVERSE</span>
          </button>
        </div>

        {/* Tactical Telemetry Metrics */}
        {route && (
          <div className="glass-panel p-4 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-mono font-semibold text-gray-300 border-b border-mars-border pb-2">
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-mars-cyan" /> EVA TELEMETRY
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  route.safeRoute
                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-900/60 text-rose-300 border border-rose-500/40'
                }`}
              >
                {route.safeRoute ? 'NOMINAL' : 'SLOPE ALERT'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-mars-card/60 border border-mars-border">
                <span className="text-[10px] text-gray-400 block">TRAVERSE DISTANCE</span>
                <span className="text-base font-bold text-white">{route.totalDistance} m</span>
              </div>

              <div className="p-2.5 rounded-lg bg-mars-card/60 border border-mars-border">
                <span className="text-[10px] text-gray-400 block">EST. EVA TIME</span>
                <span className="text-base font-bold text-mars-cyan">{route.estimatedEvaMinutes} min</span>
              </div>

              <div className="p-2.5 rounded-lg bg-mars-card/60 border border-mars-border">
                <span className="text-[10px] text-gray-400 block">MAX / AVG SLOPE</span>
                <span className="text-sm font-bold text-yellow-400">{route.maxSlope}° / {route.avgSlope}°</span>
              </div>

              <div className="p-2.5 rounded-lg bg-mars-card/60 border border-mars-border">
                <span className="text-[10px] text-gray-400 block">O₂ CONSUMPTION</span>
                <span className="text-sm font-bold text-emerald-400">{route.oxygenCostLiters} L</span>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-mars-card/60 border border-mars-border text-[11px] font-mono flex items-center justify-between">
              <span className="text-gray-400">Elevation Δ:</span>
              <span className="text-gray-200">+{route.elevationGain}m / -{route.elevationLoss}m</span>
            </div>
          </div>
        )}
      </div>

      {/* 4. BOTTOM TACTICAL RETICLE & CONTROLS FOOTER */}
      <div className="glass-panel px-4 py-2 rounded-lg flex items-center justify-between pointer-events-auto border border-mars-border max-w-2xl self-center text-xs font-mono text-gray-400">
        <div className="flex items-center gap-3">
          <Crosshair className="w-4 h-4 text-mars-cyan animate-spin" />
          <span>Left-Click Drag: Rotate 3D View • Scroll: Zoom • Click Terrain: Place Waypoint</span>
        </div>
        <button
          onClick={onResetPoints}
          className="text-gray-400 hover:text-white underline ml-4"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
