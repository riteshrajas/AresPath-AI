import * as THREE from 'three';

// Artistic display grading in linear light, after sRGB decoding. The image
// controls the large-scale pattern; this is not calibrated true color.
export function gradeMarsColor(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', `
    float marsHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float marsNoise(vec2 p){
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      float a=marsHash(i), b=marsHash(i+vec2(1.0,0.0));
      float c=marsHash(i+vec2(0.0,1.0)), d=marsHash(i+vec2(1.0,1.0));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }
    // Fade subpixel detail out before it can shimmer in distant views.
    float marsGrain(vec2 p){
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      float visible=1.0-smoothstep(0.2,0.7,footprint);
      if (visible < 0.001) return 0.0;
      return (marsNoise(p)-0.5)*visible;
    }
    void main() {`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    float marsLuma=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
    // Contrast follows the existing image rather than inventing a new map:
    // darker plains get a gentle cool tint, midtones retain a warm hue, and
    // bright areas keep their neutral highlights.
    float dark=1.0-smoothstep(0.08,0.32,marsLuma);
    float bright=smoothstep(0.25,0.7,marsLuma);
    vec3 grade=mix(vec3(1.04,0.98,0.91),vec3(0.89,0.99,1.13),dark*0.7);
    grade=mix(grade,vec3(1.01,1.02,1.04),bright*0.6);
    diffuseColor.rgb=mix(vec3(marsLuma),diffuseColor.rgb,0.9)*grade;
    // Some basemap regions are nearly black at close range. Lift only those
    // very dark colors so measured geometry remains visible; this is an
    // illustrative display grade and does not reveal new image information.
    float deepShadow=1.0-smoothstep(0.015,0.18,marsLuma);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.105,0.065,0.046),deepShadow*0.48);
    // Small, view-filtered procedural grains add visual texture only; they do
    // not add measured terrain detail or represent satellite observations.
    float grain=0.10*marsGrain(vMapUv*25000.0)+0.04*marsGrain(vMapUv*100000.0);
    diffuseColor.rgb*=1.0+grain;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #ifdef USE_COLOR
      // A light elevation tint gives the local mesh depth without multiplying
      // the whole basemap by dark vertex colors.
      diffuseColor.rgb*=mix(vec3(1.0),vec3(0.82)+0.45*vColor.rgb,0.22);
    #endif`);
}

export function marsMaterial(texture, side = THREE.FrontSide) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side });
  material.onBeforeCompile = gradeMarsColor;
  return material;
}
