import * as THREE from "three";

// Derived from the displayed DEM samples, once per mesh. Never resample or
// rebuild geometry when a display preference changes. Missing tiles, visual
// collars and source transitions must not masquerade as measured slopes.
export function analyzeTerrain(data) {
  const { rows, cols, bounds, heights, radii, sources, measured } = data;
  const metrics = new Float32Array(rows * cols * 4),
    quality = new Float32Array(rows * cols * 2);
  const metadata = new Map(
    (data.sourceMetadata || []).map((source) => [source.id, source]),
  );
  const rad = Math.PI / 180;
  const valid = (i) =>
    (!measured || measured[i]) && Number.isFinite(heights[i]);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!valid(i)) {
        metrics[i * 4 + 3] = -1;
        continue;
      }
      const latitude =
        (bounds[3] - ((bounds[3] - bounds[1]) * y) / (rows - 1)) * rad;
      const dx = Math.max(
        0.01,
        Math.abs(
          ((bounds[2] - bounds[0]) * rad * radii[i] * Math.cos(latitude)) /
            (cols - 1),
        ),
      );
      const dy = Math.max(
        0.01,
        Math.abs(((bounds[3] - bounds[1]) * rad * radii[i]) / (rows - 1)),
      );
      const same = (j) => valid(j) && (!sources || sources[j] === sources[i]);
      const left = x > 0 && same(i - 1) ? i - 1 : i;
      const right = x < cols - 1 && same(i + 1) ? i + 1 : i;
      const top = y > 0 && same(i - cols) ? i - cols : i;
      const bottom = y < rows - 1 && same(i + cols) ? i + cols : i;
      const gx =
        right === left
          ? 0
          : (heights[right] - heights[left]) / ((right - left) * dx);
      const gy =
        bottom === top
          ? 0
          : (heights[bottom] - heights[top]) / (((bottom - top) / cols) * dy);
      let sum = 0,
        count = 0,
        seam = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(rows - 1, y + 1); yy++)
        for (
          let xx = Math.max(0, x - 1);
          xx <= Math.min(cols - 1, x + 1);
          xx++
        ) {
          const j = yy * cols + xx;
          if (same(j)) {
            sum += heights[j];
            count++;
          } else if (valid(j)) seam = 1;
        }
      const resolution =
        metadata.get(sources?.[i])?.prepared_resolution_m ??
        data.resolution ??
        -1;
      metrics.set(
        [
          heights[i],
          Math.atan(Math.hypot(gx, gy)) / rad,
          Math.abs(heights[i] - sum / count),
          resolution,
        ],
        i * 4,
      );
      quality.set([1, seam], i * 2);
    }
  return { metrics, quality };
}

export function attachTerrainAnalysis(geometry, data) {
  const analysis = analyzeTerrain(data),
    count = geometry.attributes.position.count;
  const metrics = new Float32Array(count * 4),
    quality = new Float32Array(count * 2);
  metrics.set(analysis.metrics);
  quality.set(analysis.quality);
  // Extra collar vertices retain valid=0 and are shown as unavailable.
  geometry.setAttribute(
    "terrainMetrics",
    new THREE.BufferAttribute(metrics, 4),
  );
  geometry.setAttribute(
    "terrainQuality",
    new THREE.BufferAttribute(quality, 2),
  );
}

export const layerUniforms = {
  terrainMode: { value: 0 },
  layerOpacity: { value: 0.8 },
  contoursEnabled: { value: 0 },
  contourInterval: { value: 100 },
  steepEnabled: { value: 0 },
  steepThreshold: { value: 20 },
  seamsEnabled: { value: 0 },
  graticuleEnabled: { value: 0 },
  graticuleInterval: { value: 10 },
  basemapEnabled: { value: 1 },
};
export const TERRAIN_MODES = [
  { value: "natural", label: "Natural imagery" },
  { value: "elevation", label: "Elevation colors" },
  { value: "slope", label: "Slope heatmap" },
  { value: "roughness", label: "Local roughness" },
  { value: "resolution", label: "Source resolution" },
  { value: "coverage", label: "Loaded data / fallback" },
  { value: "relief", label: "Shaded relief" },
];

export function applyAnalysisShader(shader) {
  Object.assign(shader.uniforms, layerUniforms);
  shader.vertexShader =
    "attribute vec4 terrainMetrics; attribute vec2 terrainQuality; varying vec4 vMetrics; varying vec2 vQuality; varying vec2 vLayerUv;\n" +
    shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvMetrics=terrainMetrics; vQuality=terrainQuality; vLayerUv=uv;",
  );
  shader.fragmentShader =
    `varying vec4 vMetrics; varying vec2 vQuality; varying vec2 vLayerUv;
    uniform float terrainMode, layerOpacity, contoursEnabled, contourInterval, steepEnabled, steepThreshold, seamsEnabled, graticuleEnabled, graticuleInterval, basemapEnabled;
    vec3 terrainRamp(float t) {
      t=clamp(t,0.0,1.0);
      return t<0.5 ? mix(vec3(0.025,0.16,0.5),vec3(0.04,0.8,0.55),t*2.0) : mix(vec3(0.04,0.8,0.55),vec3(1.0,0.18,0.07),(t-0.5)*2.0);
    }
    float layerLine(float v) {
      float fw=max(fwidth(v),0.00001);
      return (1.0-smoothstep(fw*0.6,fw*1.4,abs(fract(v+0.5)-0.5)))*(1.0-smoothstep(0.2,0.5,fw));
    }
    ` + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <roughnessmap_fragment>",
    `
    if(basemapEnabled<0.5 || terrainMode>5.5) diffuseColor.rgb=vec3(0.42);
    #include <roughnessmap_fragment>`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    `
    vec3 layerColor=outgoingLight;
    if(terrainMode>0.5 && terrainMode<5.5) {
      if(terrainMode<1.5) layerColor=terrainRamp((vMetrics.x+8000.0)/30000.0);
      else if(terrainMode<2.5) layerColor=terrainRamp(vMetrics.y/35.0);
      else if(terrainMode<3.5) layerColor=terrainRamp(log2(1.0+vMetrics.z)/log2(101.0));
      else if(terrainMode<4.5) layerColor=vMetrics.w>0.0 ? terrainRamp(log2(max(1.0,vMetrics.w))/log2(16000.0)) : vec3(0.34);
      else layerColor=vMetrics.w>1000.0 ? vec3(0.55,0.3,0.06) : vec3(0.04,0.65,0.48);
      if(vQuality.x<0.99 || vQuality.y>0.1) layerColor=vec3(0.32,0.3,0.36);
      outgoingLight=mix(outgoingLight,layerColor,layerOpacity);
    }
    if(contoursEnabled>0.5 && vQuality.x>0.99 && vQuality.y<0.1) outgoingLight=mix(outgoingLight,vec3(0.88,0.94,1.0),layerLine(vMetrics.x/contourInterval)*0.85);
    if(steepEnabled>0.5 && vQuality.x>0.99 && vQuality.y<0.1 && vMetrics.y>steepThreshold) outgoingLight=mix(outgoingLight,vec3(1.0,0.05,0.18),0.75);
    if(seamsEnabled>0.5 && vQuality.y>0.1) outgoingLight=mix(outgoingLight,vec3(1.0,0.1,0.85),smoothstep(0.1,0.6,vQuality.y));
    if(graticuleEnabled>0.5) {
      float gridLine=max(layerLine((vLayerUv.x*360.0-180.0)/graticuleInterval),layerLine((vLayerUv.y*180.0-90.0)/graticuleInterval));
      outgoingLight=mix(outgoingLight,vec3(0.25,0.8,1.0),gridLine*0.65);
    }
    #include <opaque_fragment>`,
  );
}
