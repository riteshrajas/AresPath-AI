import * as THREE from 'three';
import { pointToTile } from './terrain-client.js';
import { planetPoint, SCALE } from './globe-math.js';

const OVERVIEW_HOLD = 1;
const DESCENT_DURATION = 5;
const ARRIVAL_HOLD = 2;

export function routeTrack(points) {
  if (!Array.isArray(points) || points.length < 2 || points.some(p => p.length < 3 || !p.every(Number.isFinite))) throw Error('Replay needs a completed route with valid elevation points.');
  const positions = points.map(p => new THREE.Vector3(...planetPoint(...p)));
  const lengths = [0];
  for (let i=1;i<positions.length;i++) lengths.push(lengths[i-1]+positions[i].distanceTo(positions[i-1])/SCALE);
  const total = lengths.at(-1);
  if (!(total > 0)) throw Error('This route has no replayable length.');
  const bounds = new THREE.Box3().setFromPoints(positions).getBoundingSphere(new THREE.Sphere());
  return { total, bounds, at(distance) {
    distance = THREE.MathUtils.clamp(distance,0,total);
    let low=0,high=lengths.length-1;
    while(low+1<high){const mid=(low+high)>>1;if(lengths[mid]<=distance)low=mid;else high=mid;}
    const t=(distance-lengths[low])/Math.max(1e-9,lengths[high]-lengths[low]);
    const position=positions[low].clone().lerp(positions[high],t);
    const radius=THREE.MathUtils.lerp(points[low][2],points[high][2],t);
    position.normalize().multiplyScalar(radius*SCALE);
    const normal=position.clone().normalize();
    return {position,normal,longitude:Math.atan2(-normal.z,normal.x)*180/Math.PI,latitude:Math.asin(THREE.MathUtils.clamp(normal.y,-1,1))*180/Math.PI,radius};
  } };
}

export function replayPlan(route, result) {
  const track=routeTrack(route.points);
  const sourceIds=new Set(route.source_ids);
  const sources=result.sources.filter(source=>sourceIds.has(source.id));
  const resolution=Math.min(...sources.map(source=>source.prepared_resolution_m || 14818));
  if (!Number.isFinite(resolution)) throw Error('Source resolution is missing for this route. Recalculate it first.');
  const z=Math.max(2,Math.min(18,Math.ceil(Math.log2(21344000/(128*resolution)))));
  const n=2**z, tileWidth=21344000/n;
  const windows=new Map(), sequence=[];
  function windowAt(point,level,size){
    const center=pointToTile(point.longitude,point.latitude,level),count=2**level;
    const left=center.x-1,right=center.x+1,top=Math.max(0,center.y-1),bottom=Math.min(count-1,center.y+1),tiles=[];
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)tiles.push({z:level,x:(x+count)%count,y,column:x-left,row:y-top,size});
    return {key:`${level}/${center.x}/${center.y}`,z:level,size,columns:3,rows:bottom-top+1,tiles,bounds:[-180+360*left/count,90-180*(bottom+1)/count,-180+360*(right+1)/count,90-180*top/count]};
  }
  function planAt(distance) {
    const point=track.at(distance), center=pointToTile(point.longitude,point.latitude,z);
    const key=`${z}/${center.x}/${center.y}`;
    if(!windows.has(key)) {
      const window=windowAt(point,z,129);
      if(z>=8)window.context=windowAt(point,z-3,65);
      windows.set(key,window);
    }
    if(sequence.at(-1)?.key!==key)sequence.push({distance,key});
  }
  const steps=Math.ceil(track.total/(tileWidth*.25));
  if(steps>10000)throw Error('This route exceeds the replay preparation budget. Split it into shorter legs.');
  for(let i=0;i<=steps;i++)planAt(track.total*i/steps);
  const tiles=new Map();for(const plan of windows.values())for(const tile of [...plan.tiles,...(plan.context?.tiles||[])])tiles.set(`${tile.z}/${tile.x}/${tile.y}`,tile);
  if(windows.size>512 || tiles.size>2048)throw Error('This route needs too many HD terrain sections. Replay a shorter leg.');
  const introDuration = OVERVIEW_HOLD + DESCENT_DURATION;
  const travelDuration = THREE.MathUtils.clamp(track.total / Math.max(3, resolution * 3), 25, 150);
  const arrivalTime = introDuration + travelDuration;
  return {track,windows,sequence,tiles,resolution,sources,z,
    introDuration, arrivalTime, duration: arrivalTime + ARRIVAL_HOLD,
    altitude:Math.max(35,resolution*30),
    distanceAt(elapsed) {
      return track.total * THREE.MathUtils.clamp((elapsed - introDuration) / travelDuration, 0, 1);
    },
    frameKey(distance) {let i=0;while(i+1<sequence.length&&sequence[i+1].distance<=distance)i++;return sequence[i].key;},
  };
}

export function applyReplayCamera(camera, plan, frame, distance, elapsed) {
  const { track, altitude } = plan;
  const point = track.at(distance);
  const ahead = track.at(distance + altitude * .8);
  const behind = track.at(distance - altitude * .8);
  const { normal } = point;
  const tangent = ahead.position.sub(behind.position).projectOnPlane(normal);
  if (tangent.lengthSq() < 1e-12) tangent.set(-normal.z, 0, normal.x);
  if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
  tangent.normalize();

  const ground = sampleReplayRadius(frame, point.longitude, point.latitude) ?? point.radius;
  const surface = normal.clone().multiplyScalar(ground * SCALE);
  const target = surface.clone().addScaledVector(tangent, Math.min(altitude * .2, track.total - distance) * SCALE);
  const position = surface.addScaledVector(tangent, -altitude * SCALE * .5).addScaledVector(normal, altitude * SCALE);
  const up = normal.clone();

  if (elapsed < plan.introDuration) {
    const { center, radius } = track.bounds;
    const fraction = THREE.MathUtils.smootherstep(elapsed, OVERVIEW_HOLD, plan.introDuration);
    // Fit the route inside the narrower of the visible height and viewport width.
    const halfFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2;
    const visibleHalfFov = Math.atan(Math.tan(halfFov) * Math.min(.82, camera.aspect));
    const approach = position.clone().sub(target);
    const nearRange = approach.length();
    const wideRange = Math.max(nearRange * 8, radius * 1.15 / Math.sin(visibleHalfFov));
    const range = wideRange * (nearRange / wideRange) ** fraction;
    target.lerp(center, 1 - fraction);
    position.lerpVectors(normal, approach.normalize(), fraction).normalize()
      .multiplyScalar(range).add(target);
    up.lerpVectors(tangent, normal, fraction).normalize();
  }

  const cameraNormal = position.clone().normalize();
  const longitude = THREE.MathUtils.radToDeg(Math.atan2(-cameraNormal.z, cameraNormal.x));
  const latitude = THREE.MathUtils.radToDeg(Math.asin(cameraNormal.y));
  const underCamera = sampleReplayRadius(frame, longitude, latitude);
  if (underCamera !== null && position.length() < (underCamera + 20) * SCALE) {
    position.setLength((underCamera + 20) * SCALE);
  }
  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return { longitude: point.longitude, latitude: point.latitude, target };
}

export function sampleReplayRadius(data, longitude, latitude) {
  const [west,south,east,north]=data.bounds,mid=(west+east)/2;
  const lon=mid+((longitude-mid+540)%360)-180;
  if(lon<west||lon>east||latitude<south||latitude>north)return null;
  const x=(lon-west)/(east-west)*(data.cols-1),y=(north-latitude)/(north-south)*(data.rows-1);
  const x0=Math.min(data.cols-2,Math.floor(x)),y0=Math.min(data.rows-2,Math.floor(y)),fx=x-x0,fy=y-y0;
  const at=(dx,dy)=>data.radii[(y0+dy)*data.cols+x0+dx];
  return (1-fy)*((1-fx)*at(0,0)+fx*at(1,0))+fy*((1-fx)*at(0,1)+fx*at(1,1));
}
