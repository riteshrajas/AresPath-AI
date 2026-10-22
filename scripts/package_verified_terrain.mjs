// Bundle the existing Three.js dependency for a portable, offline terrain viewer.
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output=path.join(root,'data','verified_terrain');
let html=await readFile(path.join(root,'web','verified-terrain.html'),'utf8');
const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
await build({stdin:{contents:code,resolveDir:path.join(root,'web'),sourcefile:'verified-terrain.js',loader:'js'},bundle:true,format:'esm',minify:true,outfile:path.join(output,'viewer.js'),legalComments:'eof'});
html=html.replace('<html lang="en">','<html lang="en" data-terrain-root=".">')
 .replace(/<script type="importmap">[\s\S]*?<\/script>/,'')
 .replace(/<script type="module">[\s\S]*?<\/script>/,'<script type="module" src="viewer.js"></script>');
await writeFile(path.join(output,'index.html'),html);
await copyFile(path.join(root,'docs','TERRAIN_HANDOFF.md'),path.join(output,'README.md'));
console.log('Portable viewer written to data/verified_terrain/index.html. Serve that directory over localhost HTTP; no npm dependencies required to view.');
