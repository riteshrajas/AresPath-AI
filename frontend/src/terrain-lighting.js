// Local horizon approximation, baked once per incoming grid. Work is bounded
// to 24 neighbours per vertex; orbiting and lighting changes never rebake it.
// This is display shading, not a measured product or directional cast shadow.
const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
export const terrainShading = { value: 1 };

export function terrainOcclusion({ rows, cols, bounds, radii }) {
  const result = new Float32Array(rows * cols);
  const radians = Math.PI / 180;
  const [west, south, east, north] = bounds;
  for (let y = 0; y < rows; y++) {
    const latitude = (north - (north - south) * y / (rows - 1)) * radians;
    for (let x = 0; x < cols; x++) {
      const index = y * cols + x, radius = radii[index];
      const dx = Math.max(.01, Math.abs((east - west) * radians * radius * Math.cos(latitude) / (cols - 1)));
      const dy = Math.max(.01, Math.abs((north - south) * radians * radius / (rows - 1)));
      let blocked = 0;
      for (const [ox, oy] of directions) {
        let horizon = 0;
        for (const step of [1, 2, 4]) {
          const nx = x + ox * step, ny = y + oy * step;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          const distance = Math.hypot(ox * dx, oy * dy) * step;
          // Account for the planet curving away, so a flat sphere stays open.
          const rise = radii[ny * cols + nx] - radius - distance * distance / (2 * radius);
          horizon = Math.max(horizon, rise / distance);
        }
        blocked += horizon * horizon / (1 + horizon * horizon);
      }
      result[index] = Math.max(.4, 1 - blocked / directions.length * .75);
    }
  }
  return result;
}

export function applyTerrainLighting(shader) {
  shader.uniforms.terrainShading = terrainShading;
  shader.vertexShader = 'attribute float terrainAO; varying float vTerrainAO;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainAO = terrainAO;');
  shader.fragmentShader = 'uniform float terrainShading; varying float vTerrainAO;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
    reflectedLight.indirectDiffuse *= mix(1.0, vTerrainAO, terrainShading);`);
}

export function setupTerrainShading(button) {
  const update = () => {
    const enabled = terrainShading.value === 1;
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Terrain lighting · On' : 'Terrain lighting · Off';
  };
  button.addEventListener('click', () => {
    terrainShading.value = terrainShading.value === 1 ? 0 : 1;
    update();
  });
  update();
}
