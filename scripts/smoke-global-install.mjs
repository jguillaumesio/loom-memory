#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const timeout = Number(process.env.LOOM_GLOBAL_INSTALL_TIMEOUT_MS || 120_000);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-global-install-'));
const cache = path.join(tmp, 'npm-cache');
let tarball;

try {
  const packOutput = execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, npm_config_cache: cache },
  });
  const [pack] = JSON.parse(packOutput.slice(packOutput.indexOf('[')));
  tarball = path.join(ROOT, pack.filename);

  execFileSync('npm', [
    'install',
    '-g',
    tarball,
    '--prefix',
    tmp,
    '--ignore-scripts',
    '--prefer-offline',
    '--no-audit',
    '--no-fund',
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout,
    env: { ...process.env, npm_config_cache: cache },
  });

  execFileSync(path.join(tmp, 'bin', 'loom-memory'), ['--help'], {
    stdio: 'inherit',
    timeout,
  });
} finally {
  if (tarball && fs.existsSync(tarball)) fs.rmSync(tarball, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}
