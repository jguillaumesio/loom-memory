#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!fs.existsSync('.git')) {
  process.exit(0);
}

try {
  fs.accessSync('.git/config', fs.constants.W_OK);
} catch {
  console.warn('husky skipped: .git/config is not writable in this environment');
  process.exit(0);
}

try {
  execFileSync(process.platform === 'win32' ? 'husky.cmd' : 'husky', {
    stdio: 'inherit',
    shell: true,
  });
} catch (err) {
  if (err.code === 'ENOENT') {
    console.warn('husky skipped: binary not found');
    process.exit(0);
  }
  process.exit(err.status ?? 1);
}
