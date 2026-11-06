import { buildReplayGeometry } from './cinematic-geometry.js';
let globe;
self.onmessage=event=>{
  try {
    if(event.data.globe){globe=event.data.globe;self.postMessage({ready:true});return;}
    const snapshot=buildReplayGeometry(event.data.data,globe,event.data.contextData);
    const buffers=new Set();
    function collect(value){buffers.add(value.index.buffer);for(const a of Object.values(value.attributes))buffers.add(a.array.buffer);for(const a of Object.values(value.data))if(ArrayBuffer.isView(a))buffers.add(a.buffer);if(value.context)collect(value.context);}
    collect(snapshot);
    self.postMessage({snapshot},[...buffers]);
  }catch(error){self.postMessage({error:error.message});}
};
