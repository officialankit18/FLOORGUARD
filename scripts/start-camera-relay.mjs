import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('Starting local Wi-Fi camera relay (no internet tunnel)…');
const relay = spawn(process.execPath, [path.join(root, 'scripts/camera-relay.mjs')], { cwd: root, stdio: 'inherit', windowsHide: true });
let stopping = false;
function stop() { if (stopping) return; stopping = true; relay.kill(); }
relay.on('error', error => { console.error(error.message); stop(); });
relay.on('exit', () => { if (!stopping) process.exitCode = 1; });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
