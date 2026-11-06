import * as THREE from 'three';

export function createRealTimeSky(scene, camera, sun, ambient, inspection, apiBase) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const button = document.querySelector('#rt-toggle');
  const caption = document.createElement('p');
  caption.className = 'subtitle'; caption.hidden = true;
  caption.textContent = 'Live positions · star visibility enhanced';
  document.querySelector('header').appendChild(caption);
  let enabled = false, busy = false, last = 0, stars, sunlight, savedInspection = 0;
  const originalSun = sun.position.clone(), originalAmbient = ambient.intensity;
  function clear() {
    for (const child of [...group.children]) {
      child.geometry?.dispose(); child.material?.map?.dispose(); child.material?.dispose(); group.remove(child);
    }
  }
  async function refresh() {
    if (busy) return;
    busy = true; button.textContent = 'RT · Loading';
    try {
      const response = await fetch(apiBase + '/api/v1/sky', { cache: 'no-cache' });
      if (!response.ok) throw Error('Sky data unavailable. Prepare the NASA sky archive first.');
      const data = await response.json();
      if (!enabled) return;
      clear();
      const positions = [], colors = [];
      for (const [x,y,z,magnitude] of data.stars) {
        positions.push(x*15000,y*15000,z*15000);
        const light = Math.max(.22, Math.min(1, 1.6 * 10 ** (-.14*magnitude)));
        colors.push(light,light,light);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
      const starMaterial = new THREE.PointsMaterial({size:2.2,sizeAttenuation:false,vertexColors:true,transparent:true,depthWrite:false,toneMapped:false});
      starMaterial.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if(length(gl_PointCoord-vec2(0.5))>0.5) discard;`);
      };
      stars = new THREE.Points(geometry,starMaterial);
      group.add(stars);
      for (const body of data.bodies) {
        if (body.name === 'Sun') sunlight = new THREE.Vector3(...body.direction);
        if (body.name === 'Sun') {
          const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=256;
          const ctx=canvas.getContext('2d');
          const glow=ctx.createRadialGradient(128,128,48,128,128,128);
          glow.addColorStop(0,'rgba(255,224,157,0.55)');
          glow.addColorStop(.35,'rgba(255,189,100,0.12)');
          glow.addColorStop(1,'rgba(255,170,80,0)');
          ctx.fillStyle=glow; ctx.fillRect(0,0,256,256);
          ctx.fillStyle='#fff5df'; ctx.beginPath(); ctx.arc(128,128,48,0,Math.PI*2); ctx.fill();
          const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
          const disk=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
          const skyDistance=14500;
          // Solar radius 696,340 km. The disk spans 96/256 of the sprite;
          // the surrounding halo is an illustrative exposure effect.
          const diameter=2*696340/body.distance_km*skyDistance*(256/96);
          disk.scale.set(diameter,diameter,1);
          disk.position.set(...body.direction).multiplyScalar(skyDistance); group.add(disk);
          continue;
        }
        const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=64;
        const ctx=canvas.getContext('2d'); ctx.fillStyle=body.name==='Sun'?'#fff2bb':'#cce0ff';
        ctx.beginPath(); ctx.arc(128,18,body.name==='Sun'?8:3,0,Math.PI*2); ctx.fill();
        ctx.font='16px system-ui'; ctx.textAlign='center'; ctx.fillText(body.name,128,48);
        const texture=new THREE.CanvasTexture(canvas);
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
        sprite.position.set(...body.direction).multiplyScalar(14500); sprite.scale.set(750,187.5,1); group.add(sprite);
      }
      last=Date.now(); button.textContent='RT · On'; button.title=`${data.source}\nUTC ${data.utc}\nStar visibility enhanced, including daylight; planet markers enlarged. Stars use J2000 positions.`;
    } catch (error) {
      enabled=false; inspection.intensity=savedInspection; button.textContent='RT · Unavailable'; button.title=error.message;
      button.classList.remove('active'); button.setAttribute('aria-pressed','false');
    } finally { busy=false; }
  }
  button.addEventListener('click',()=> {
    enabled=!enabled; button.classList.toggle('active',enabled); button.setAttribute('aria-pressed',String(enabled));
    if (enabled) { savedInspection=inspection.intensity; last=0; refresh(); }
    else { inspection.intensity=savedInspection; button.textContent='RT'; }
  });
  return { update() {
    group.visible=enabled && !!sunlight;
    if (caption.hidden === group.visible) caption.hidden=!group.visible;
    if (enabled && Date.now()-last>60000 && !busy) refresh();
    if (enabled && sunlight) {
      group.position.copy(camera.position); sun.position.copy(sunlight).multiplyScalar(10000);
      ambient.intensity=.08; inspection.intensity=0;
      // Educational overlay: keep real catalog directions visible in daylight.
      // Terrain still occludes stars below the geometric horizon.
      if (stars) stars.material.opacity=1;
    } else { sun.position.copy(originalSun); ambient.intensity=originalAmbient; }
  }};
}
