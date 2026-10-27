export type MarsSector = 'jezero' | 'gale' | 'olympus' | 'valles';

export interface TerrainData {
  sector: MarsSector;
  name: string;
  coordinates: string;
  width: number;
  height: number;
  resolution: number; // meters per grid cell
  elevations: Float32Array;
  slopes: Float32Array; // slope in degrees for each cell
  hazards: Uint8Array; // 0 = safe, 1 = warning, 2 = impassable hazard
  thermalInertia: Float32Array; // 0.0 - 1.0 (for FLIR sensor mode)
  minElevation: number;
  maxElevation: number;
}

export function generateMartianTerrain(sector: MarsSector = 'jezero', size = 128, resolution = 10): TerrainData {
  const elevations = new Float32Array(size * size);
  const slopes = new Float32Array(size * size);
  const hazards = new Uint8Array(size * size);
  const thermalInertia = new Float32Array(size * size);

  let minElevation = Infinity;
  let maxElevation = -Infinity;

  let sectorName = 'Jezero Crater Delta';
  let coordinates = '18.38° N, 77.58° E';

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const nx = (x / size);
      const ny = (y / size);
      let elev = 0;

      if (sector === 'jezero') {
        sectorName = 'Jezero Crater Delta (Perseverance Site)';
        coordinates = '18.38° N, 77.58° E';
        // Base rolling bed
        elev = Math.sin(nx * 6) * Math.cos(ny * 6) * 8 + Math.sin(nx * 14) * 3;
        // Large crater bowl
        const cx = 0.5, cy = 0.5, radius = 0.38;
        const dist = Math.hypot(nx - cx, ny - cy);
        if (dist < radius * 1.4) {
          const normDist = dist / radius;
          if (normDist < 1.0) {
            elev -= (1.0 - Math.pow(normDist, 2)) * 36;
          } else if (normDist < 1.25) {
            elev += Math.sin((normDist - 1.0) / 0.25 * Math.PI) * 12; // Raised crater rim
          }
        }
        // River delta fan protrusion on west rim
        const deltaDist = Math.hypot(nx - 0.22, ny - 0.5);
        if (deltaDist < 0.18) {
          elev += (1.0 - deltaDist / 0.18) * 14;
        }

      } else if (sector === 'gale') {
        sectorName = 'Gale Crater & Mount Sharp';
        coordinates = '5.37° S, 137.81° E';
        // Huge central mountain peak (Mount Sharp / Aeolis Mons)
        const distCenter = Math.hypot(nx - 0.5, ny - 0.5);
        elev = Math.max(0, (0.45 - distCenter) * 110) + Math.sin(nx * 10) * Math.cos(ny * 10) * 6;
        // Outer moat floor
        if (distCenter > 0.35) {
          elev -= (distCenter - 0.35) * 40;
        }

      } else if (sector === 'olympus') {
        sectorName = 'Olympus Mons Caldera Summit';
        coordinates = '18.65° N, 226.2° E';
        // High altitude volcano plateau with steep nested calderas
        elev = 60 + Math.sin(nx * 4) * Math.cos(ny * 4) * 10;
        // Nested Caldera pits
        const p1 = Math.hypot(nx - 0.45, ny - 0.45);
        if (p1 < 0.25) elev -= (1.0 - Math.pow(p1 / 0.25, 2)) * 42;
        const p2 = Math.hypot(nx - 0.65, ny - 0.55);
        if (p2 < 0.18) elev -= (1.0 - Math.pow(p2 / 0.18, 2)) * 28;

      } else if (sector === 'valles') {
        sectorName = 'Valles Marineris (Canyon Chasma)';
        coordinates = '13.9° S, 59.2° W';
        // Massive rift valley cutting east-west
        const distFromCanyon = Math.abs(ny - 0.5 + Math.sin(nx * 5) * 0.08);
        if (distFromCanyon < 0.2) {
          const depthFactor = (0.2 - distFromCanyon) / 0.2;
          elev = -depthFactor * 65 + Math.sin(nx * 20) * 4;
        } else {
          elev = 25 + Math.sin(nx * 6) * 5;
        }
      }

      elevations[idx] = elev;
      if (elev < minElevation) minElevation = elev;
      if (elev > maxElevation) maxElevation = elev;

      // Thermal Inertia simulation (solid rock / basalt retains heat vs loose cold fine dust)
      thermalInertia[idx] = Math.max(0.1, Math.min(0.95, 0.5 + (elev / 50.0) * 0.3 + Math.sin(nx * 18 + ny * 12) * 0.15));
    }
  }

  // Calculate slopes and hazard classification
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;

      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(size - 1, x + 1);
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(size - 1, y + 1);

      const dzdx = (elevations[y * size + x1] - elevations[y * size + x0]) / ((x1 - x0) * resolution);
      const dzdy = (elevations[y1 * size + x] - elevations[y0 * size + x]) / ((y1 - y0) * resolution);

      const gradient = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
      const slopeDeg = Math.atan(gradient) * (180 / Math.PI);
      slopes[idx] = slopeDeg;

      if (slopeDeg >= 20.0) {
        hazards[idx] = 2; // Impassable cliff / escarpment
      } else if (slopeDeg >= 12.0) {
        hazards[idx] = 1; // Caution
      } else {
        // High roughness sand trap or boulder field
        const isRough = Math.sin(x * 17 + y * 13) > 0.82;
        hazards[idx] = isRough ? 2 : 0;
      }
    }
  }

  return {
    sector,
    name: sectorName,
    coordinates,
    width: size,
    height: size,
    resolution,
    elevations,
    slopes,
    hazards,
    thermalInertia,
    minElevation,
    maxElevation
  };
}
