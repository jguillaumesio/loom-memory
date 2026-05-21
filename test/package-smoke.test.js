import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('npm package contains the CLI runtime and excludes local/dev artifacts', () => {
  const cache = path.join(os.tmpdir(), `loom-npm-cache-${Date.now()}`);
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: cache,
    },
  });

  const [pack] = JSON.parse(output.slice(output.indexOf('[')));
  const files = pack.files.map((file) => file.path);

  for (const required of [
    'package.json',
    'README.md',
    'bin/cli.js',
    'src/commands/init.js',
    'src/commands/update.js',
    'src/commands/verify.js',
    'src/utils/wiki-section.js',
    'scripts/build-graph.mjs',
    'scripts/graph-mcp.mjs',
    'scripts/prepare.mjs',
    'prompts/wiki-section.md',
  ]) {
    assert.ok(files.includes(required), `expected package to include ${required}`);
  }

  for (const unwanted of [
    '_graph/codebase.db',
    '.idea/loom-memory.iml',
    '.husky/post-commit',
    'bun.lock',
    'test/build-graph.test.js',
  ]) {
    assert.ok(!files.includes(unwanted), `expected package to exclude ${unwanted}`);
  }
});
