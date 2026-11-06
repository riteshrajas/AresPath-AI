import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceRaytrace} from '../src/globe-raytrace.js';

test('completed view stops tracing, keeps compositing, and resumes after invalidation',()=>{
  const tracer={samples:0,pausePathTracing:false,frames:0,queuedReset:false,
    renderSample(){
      this.frames++;
      if(this.queuedReset){this.samples=0;this.queuedReset=false;}
      // Four tile passes form a complete sample in the configured renderer.
      if(!this.pausePathTracing)this.samples+=.25;
    }};
  for(let frame=0;frame<1200;frame++)advanceRaytrace(tracer);
  assert.equal(tracer.samples,256);
  assert.equal(tracer.frames,1200);
  assert.equal(tracer.pausePathTracing,true);
  tracer.queuedReset=true;
  advanceRaytrace(tracer,true);
  assert.equal(tracer.samples,.25);
  assert.equal(tracer.pausePathTracing,false);
  advanceRaytrace(tracer);
  assert.equal(tracer.samples,.5);
});
