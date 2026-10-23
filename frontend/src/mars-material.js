import * as THREE from 'three';

// Display grading in linear light, after sRGB texture decoding. This is an
// illustrative white balance/saturation adjustment, not calibrated true color.
export function gradeMarsColor(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', `
    float marsHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float marsNoise(vec2 p){
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      float a=marsHash(i), b=marsHash(i+vec2(1.0,0.0));
      float c=marsHash(i+vec2(0.0,1.0)), d=marsHash(i+vec2(1.0,1.0));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }
    void main() {`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    float marsLuma=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
    diffuseColor.rgb=mix(vec3(marsLuma),diffuseColor.rgb,0.72)*vec3(0.94,1.0,1.08);
    // The basemap is finite-resolution imagery. Add a restrained, deterministic
    // regolith grain so close views do not turn into a magnified flat bitmap.
    // This is a display enhancement; the measured DEM remains the topology.
    float marsDetail=mix(marsNoise(vMapUv*180.0),marsNoise(vMapUv*420.0),0.35);
    float marsVariation=(marsDetail-0.5)*0.22;
    diffuseColor.rgb*=1.0+marsVariation;
    diffuseColor.rgb+=vec3(0.018,0.012,0.008)*marsVariation;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    #ifdef USE_COLOR
      // A small amount of DEM-derived tint keeps measured relief legible when
      // the photographic basemap has reached its native pixel size.
      diffuseColor.rgb=mix(diffuseColor.rgb,vColor,0.18);
    #endif`);
}

export function marsMaterial(texture, side = THREE.FrontSide) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side });
  material.onBeforeCompile = gradeMarsColor;
  return material;
}
