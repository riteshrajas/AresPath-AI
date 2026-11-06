import * as THREE from 'three';

export function tracingGeometry(geometry,bounds) {
  const result=clippedGeometry(geometry,bounds);
  result.deleteAttribute('color');
  return result;
}

// Subtract a longitude/latitude rectangle from a UV polygon, retaining the
// outside pieces. Attributes are interpolated at the actual cut edges.
export function subtractRect(polygon, rect) {
  let inside=polygon; const outside=[];
  for(const [axis,bound,sign] of [[0,rect[0],1],[0,rect[2],-1],[1,rect[1],1],[1,rect[3],-1]]){
    const a=[],b=[];
    for(let i=0;i<inside.length;i++){
      const p=inside[i],q=inside[(i+1)%inside.length];
      const dp=(p[axis]-bound)*sign,dq=(q[axis]-bound)*sign;
      (dp>=0?a:b).push(p);
      if((dp>=0)!==(dq>=0)){
        const t=dp/(dp-dq),v=p.map((value,j)=>value+t*(q[j]-value)); a.push(v);b.push(v);
      }
    }
    if(b.length>=3)outside.push(b); inside=a;
    if(inside.length<3)break;
  }
  return outside;
}

export function clippedGeometry(geometry,bounds) {
  if(!bounds)return geometry.clone();
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,idx=geometry.index;
  const outP=[],outN=[],outUv=[];
  const rect=[(bounds[0]+180)/360,(bounds[1]+90)/180,(bounds[2]+180)/360,(bounds[3]+90)/180];
  const mid=(rect[0]+rect[2])/2;
  for(let i=0;i<(idx?idx.count:p.count);i+=3){
    const triangle=[];
    for(let j=0;j<3;j++){
      const k=idx?idx.getX(i+j):i+j; let u=uv.getX(k);
      u=mid+((u-mid+1.5)%1)-.5;
      triangle.push([u,uv.getY(k),p.getX(k),p.getY(k),p.getZ(k),n.getX(k),n.getY(k),n.getZ(k)]);
    }
    // A triangle far from the cut requires no polygon work.
    const minU=Math.min(...triangle.map(v=>v[0])),maxU=Math.max(...triangle.map(v=>v[0]));
    const minV=Math.min(...triangle.map(v=>v[1])),maxV=Math.max(...triangle.map(v=>v[1]));
    const polygons=maxU<rect[0]||minU>rect[2]||maxV<rect[1]||minV>rect[3]?[triangle]:subtractRect(triangle,rect);
    for(const poly of polygons)for(let j=1;j<poly.length-1;j++)for(const v of [poly[0],poly[j],poly[j+1]]){
      outUv.push(v[0],v[1]);outP.push(v[2],v[3],v[4]);outN.push(v[5],v[6],v[7]);
    }
  }
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(outP,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(outN,3));
  result.setAttribute('uv',new THREE.Float32BufferAttribute(outUv,2));
  return result;
}
