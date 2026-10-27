import { TerrainData } from '../engine/terrainGenerator';

export interface Point2D {
  x: number;
  y: number;
}

export interface Waypoint3D {
  x: number;
  y: number;
  z: number;
  slope: number;
  hazard: number;
  cumulativeDist: number;
}

export interface RouteResult {
  path: Waypoint3D[];
  totalDistance: number;
  elevationGain: number;
  elevationLoss: number;
  maxSlope: number;
  avgSlope: number;
  estimatedEvaMinutes: number;
  oxygenCostLiters: number;
  safeRoute: boolean;
}

interface PriorityNode {
  x: number;
  y: number;
  f: number;
  g: number;
}

export function findOptimalMartianRoute(
  terrain: TerrainData,
  start: Point2D,
  goal: Point2D,
  avoidCautionZones = false
): RouteResult | null {
  const { width, height, resolution, elevations, slopes, hazards } = terrain;

  if (start.x < 0 || start.x >= width || start.y < 0 || start.y >= height ||
      goal.x < 0 || goal.x >= width || goal.y < 0 || goal.y >= height) {
    return null;
  }

  const openSet: PriorityNode[] = [];
  const gScore = new Float32Array(width * height).fill(Infinity);
  const cameFrom = new Int32Array(width * height).fill(-1);
  const closedSet = new Uint8Array(width * height);

  const startIdx = start.y * width + start.x;

  gScore[startIdx] = 0;
  openSet.push({
    x: start.x,
    y: start.y,
    g: 0,
    f: heuristic(start, goal, resolution)
  });

  const neighbors = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: -1 }
  ];

  while (openSet.length > 0) {
    // Pick node with lowest f
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    const curIdx = current.y * width + current.x;

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(terrain, cameFrom, start, goal);
    }

    closedSet[curIdx] = 1;

    for (const nb of neighbors) {
      const nx = current.x + nb.dx;
      const ny = current.y + nb.dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (closedSet[nIdx]) continue;

      const hazardLevel = hazards[nIdx];
      // Impassable hazard
      if (hazardLevel === 2) continue;
      if (avoidCautionZones && hazardLevel === 1) continue;

      const slope = slopes[nIdx];
      const curElev = elevations[curIdx];
      const nextElev = elevations[nIdx];
      const dElev = nextElev - curElev;

      // 3D step distance
      const horizDist = (nb.dx !== 0 && nb.dy !== 0 ? 1.4142 : 1.0) * resolution;
      const dist3D = Math.sqrt(horizDist * horizDist + dElev * dElev);

      // Metabolic cost function (Tobler-like exponential penalty for steep Martian slopes)
      let slopeMultiplier = 1.0 + Math.pow(slope / 8.0, 2.2);
      if (dElev > 0) {
        slopeMultiplier += (dElev / horizDist) * 3.5; // Extra energy climbing uphill in pressurized suit
      }

      if (hazardLevel === 1) {
        slopeMultiplier += 4.0; // Moderate penalty for caution regolith zones
      }

      const tentativeG = current.g + dist3D * slopeMultiplier;

      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = curIdx;
        gScore[nIdx] = tentativeG;
        const f = tentativeG + heuristic({ x: nx, y: ny }, goal, resolution);

        const existing = openSet.find(n => n.x === nx && n.y === ny);
        if (existing) {
          existing.g = tentativeG;
          existing.f = f;
        } else {
          openSet.push({ x: nx, y: ny, g: tentativeG, f });
        }
      }
    }
  }

  return null; // No safe path found
}

function heuristic(a: Point2D, b: Point2D, res: number): number {
  const dx = (a.x - b.x) * res;
  const dy = (a.y - b.y) * res;
  return Math.sqrt(dx * dx + dy * dy);
}

function reconstructPath(
  terrain: TerrainData,
  cameFrom: Int32Array,
  start: Point2D,
  goal: Point2D
): RouteResult {
  const { width, resolution, elevations, slopes, hazards } = terrain;
  const path: Waypoint3D[] = [];

  let curIdx = goal.y * width + goal.x;
  const startIdx = start.y * width + start.x;

  while (curIdx !== -1) {
    const cx = curIdx % width;
    const cy = Math.floor(curIdx / width);
    path.push({
      x: cx,
      y: cy,
      z: elevations[curIdx],
      slope: slopes[curIdx],
      hazard: hazards[curIdx],
      cumulativeDist: 0
    });
    if (curIdx === startIdx) break;
    curIdx = cameFrom[curIdx];
  }

  path.reverse();

  let totalDistance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let maxSlope = 0;
  let totalSlope = 0;

  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    if (pt.slope > maxSlope) maxSlope = pt.slope;
    totalSlope += pt.slope;

    if (i > 0) {
      const prev = path[i - 1];
      const dx = (pt.x - prev.x) * resolution;
      const dy = (pt.y - prev.y) * resolution;
      const dz = pt.z - prev.z;
      const stepDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      totalDistance += stepDist;

      if (dz > 0) elevationGain += dz;
      else elevationLoss += Math.abs(dz);
    }
    pt.cumulativeDist = totalDistance;
  }

  // Astronaut metabolic estimates:
  // Base walking speed on Mars: ~1.0 m/s (~3.6 km/h) reduced on incline
  const avgSpeedMps = Math.max(0.4, 1.1 - (maxSlope / 40.0));
  const estimatedEvaMinutes = Math.round((totalDistance / avgSpeedMps) / 60);

  // Oxygen rate: ~0.8 L/min nominal, up to 1.6 L/min on heavy slope
  const o2RatePerMin = 0.85 + (elevationGain / totalDistance || 0) * 1.5;
  const oxygenCostLiters = Math.round(estimatedEvaMinutes * o2RatePerMin);

  return {
    path,
    totalDistance: Math.round(totalDistance),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    maxSlope: Math.round(maxSlope * 10) / 10,
    avgSlope: Math.round((totalSlope / path.length) * 10) / 10,
    estimatedEvaMinutes,
    oxygenCostLiters,
    safeRoute: maxSlope < 20.0
  };
}
