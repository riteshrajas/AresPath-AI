export async function replayCache(name) {
  if (!globalThis.indexedDB) throw Error('Cinematic Replay needs browser storage (IndexedDB) for prepared HD terrain.');
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('frames');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  let closed=false;
  function transaction(mode, action) {
    return new Promise((resolve,reject)=>{
      if(closed){reject(new DOMException('Replay canceled','AbortError'));return;}
      const tx=db.transaction('frames',mode),request=action(tx.objectStore('frames'));
      tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Browser storage could not save HD terrain. Free storage or choose a shorter route.'));
    });
  }
  return {put:(key,value)=>transaction('readwrite',store=>store.put(value,key)),get:key=>transaction('readonly',store=>store.get(key)),
    close(){if(closed)return;closed=true;db.close();indexedDB.deleteDatabase(name);}};
}
