#!/usr/bin/env node
// Deploys with wrangler.prod.toml when present (maintainer's private config
// carrying real bindings like the REPORTS KV namespace), otherwise wrangler.toml.
// Keeps `pnpm run deploy` safe for both self-hosters and production.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const config = existsSync('wrangler.prod.toml') ? 'wrangler.prod.toml' : 'wrangler.toml';
console.log(`deploy: using ${config}`);
const args = process.argv.slice(2).filter((a) => a !== '--');
const result = spawnSync('pnpm', ['exec', 'wrangler', 'deploy', '-c', config, ...args], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
