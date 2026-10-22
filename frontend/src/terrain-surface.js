import * as THREE from 'three';
import { planetPoint, terrainIndices } from './globe-math.js';

export function createTerrainSurface(data, texture, baseRadiusAt) {
  const { rows, cols, bounds, radii, heights, sources } = data;
  const [west, south, east, north] = bounds;
  const point = (lon, lat, radius) => new THREE.Vector3(...planetPoint(lon, lat, radius));
  const center = point((west + east) / 2, (south + north) / 2, radii[Math.floor(radii.length / 2)]);
  const positions = [], colors = [], uvs = [], measured = [];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < heights.length; i++) if (sources[i] !== 0) { min = Math.min(min, heights[i]); max = Math.max(max, heights[i]); }
  const add = (longitude, latitude, radius, index) => {
    positions.push(...point(longitude, latitude, radius).sub(center).toArray());
    uvs.push((longitude + 180) / 360, (latitude + 90) / 180);
    const t = sources[index] === 0 ? .5 : (heights[index] - min) / Math.max(1, max - min);
    colors.push(.35 + .24 * t, .19 + .20 * t, .12 + .16 * t);
    measured.push(sources[index] === 0 ? 0 : 1);
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    add(west + (east - west) * x / (cols - 1), north - (north - south) * y / (rows - 1), radii[y * cols + x], y * cols + x);
  const indices = terrainIndices(heights, rows, cols), border = [];
  for (let x = 0; x < cols; x++) border.push(x);
  for (let y = 1; y < rows; y++) border.push(y * cols + cols - 1);
  for (let x = cols - 2; x >= 0; x--) border.push((rows - 1) * cols + x);
  for (let y = rows - 2; y > 0; y--) border.push(y * cols);
  // Render-only one-cell collar joins the actual coarse globe triangles.
  // Interior source samples remain untouched; the collar is not measured data.
  const padLon = (east - west) / (cols - 1), padLat = (north - south) / (rows - 1);
  const outer = [west - padLon, Math.max(-90, south - padLat), east + padLon, Math.min(90, north + padLat)];
  let previous = border;
  for (let ring = 1; ring <= 3; ring++) {
    const current = [], t = Math.min(ring / 2, 1);
    for (const index of border) {
      const y = Math.floor(index / cols), x = index % cols;
      const longitude = west + (east - west) * x / (cols - 1), latitude = north - (north - south) * y / (rows - 1);
      const outerLon = outer[0] + (outer[2] - outer[0]) * x / (cols - 1);
      const outerLat = outer[3] - (outer[3] - outer[1]) * y / (rows - 1);
      const lon = longitude + t * (outerLon - longitude), lat = latitude + t * (outerLat - latitude);
      current.push(positions.length / 3);
      add(lon, lat, (1 - t) * radii[index] + t * (baseRadiusAt(lon, lat) + 2) - (ring === 3 ? 2000 : 0), index);
    }
    for (let i = 0; i < border.length; i++) {
      const j = (i + 1) % border.length;
      indices.push(previous[i], current[i], previous[j], previous[j], current[i], current[j]);
    }
    previous = current;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('measured', new THREE.Float32BufferAttribute(measured, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float measured; attribute vec3 color; varying float isMeasured; varying vec3 elevationColor;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nisMeasured=measured; elevationColor=color;');
    shader.fragmentShader = 'varying float isMeasured; varying vec3 elevationColor;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,elevationColor,isMeasured);');
  };
  const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(center);
  return { mesh, data, outer };
}
