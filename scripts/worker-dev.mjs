import { spawn } from 'node:child_process';

const WRANGLER_ARGS = [
  'exec',
  'wrangler',
  'dev',
  '--env',
  'local',
  '--var',
  'LOCAL_DEV:true',
  '--assets',
  './public',
  '--ip',
  '127.0.0.1',
  '--port',
  '8787',
];

function run(args) {
  return spawn('pnpm', args, { stdio: 'inherit' });
}

const children = [run(['dev']), run(WRANGLER_ARGS)];

let stopped = false;
const shutdown = (code) => {
  if (stopped) return;
  stopped = true;
  process.exitCode = code;
  children.forEach((child) => child.kill('SIGTERM'));
};

children.forEach((child) => {
  child.on('error', (error) => {
    console.error(error.message);
    shutdown(1);
  });
  child.on('exit', (code) => shutdown(code ?? 1));
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
