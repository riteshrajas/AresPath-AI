const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const vite = path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];
let stopping = false;

function resolveDataRoot() {
  if (process.env.ARESPATH_DATA_ROOT) return process.env.ARESPATH_DATA_ROOT;
  if (fs.existsSync(path.join(root, 'data', 'verified_terrain'))) return undefined;
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
    const sharedData = path.join(path.resolve(root, path.dirname(commonDir)), 'data');
    if (fs.existsSync(path.join(sharedData, 'verified_terrain'))) {
      console.log(`Using shared data directory: ${sharedData}`);
      return sharedData;
    }
  } catch {}
  return undefined;
}

function waitForPort(port, host, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise(resolve => {
    const attempt = () => {
      if (stopping || Date.now() >= deadline) return resolve();
      const socket = net.connect({ port, host });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); setTimeout(attempt, 100); });
    };
    attempt();
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}

function start(name, command, args, cwd, env = process.env) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(`${name} failed to start: ${error.message}`); stop(1); });
  child.on('exit', (code, signal) => {
    if (!stopping) { console.error(`${name} stopped (${signal || code}).`); stop(code || 1); }
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
const sharedData = resolveDataRoot();
const apiEnv = sharedData ? { ...process.env, ARESPATH_DATA_ROOT: sharedData } : process.env;
start('Terrain API', 'python', ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8001'], root, apiEnv);
waitForPort(8001, '127.0.0.1').then(() => {
  if (!stopping) start('Mars globe', process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], path.join(root, 'frontend'));
});
