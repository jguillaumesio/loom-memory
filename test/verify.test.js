import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyRepository, extractPathReferences, extractSymbolReferences } from '../src/commands/verify.js';
import { sectionMarkers } from '../src/utils/wiki-section.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('verify extracts conservative path and symbol references', () => {
  const content = 'See `runTask()` in apps/api/src/task.ts, not package names. Also `MissingThing()`.';
  assert.deepEqual(extractPathReferences(content), ['apps/api/src/task.ts']);
  assert.deepEqual(extractSymbolReferences(content), ['runTask', 'MissingThing']);
});

test('verify reports strong wiki drift and marker warnings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-verify-'));
  fs.mkdirSync(path.join(dir, 'apps/api/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps/api/src/task.ts'), `
export function runTask() {
  return true;
}
`);
  fs.writeFileSync(path.join(dir, 'loom-memory.config.js'), `
export default {
  zones: {
    'apps/api': 'apps/api',
    'apps/admin': 'apps/admin'
  }
};
`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  fs.mkdirSync(path.join(dir, '_wiki'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_wiki/01-Architecture-Stack.md'), `
# Architecture

Known code: apps/api/src/task.ts calls \`runTask()\`.
Stale file: apps/api/src/deleted.ts.
Stale symbol: \`missingTask()\`.
`);

  const result = await verifyRepository(dir);
  assert.ok(result.errors.some((error) => error.includes('Configured zone has no indexed files: apps/admin')));
  assert.ok(result.errors.some((error) => error.includes('references missing file: apps/api/src/deleted.ts')));
  assert.ok(result.errors.some((error) => error.includes('references missing symbol: missingTask')));
  assert.ok(result.warnings.some((warning) => warning.includes('missing generated section markers for apps/api')));
});

test('verify accepts current files, symbols, and generated section markers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-verify-clean-'));
  fs.mkdirSync(path.join(dir, 'apps/api/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps/api/src/task.ts'), `
export function runTask() {
  return true;
}
`);
  fs.writeFileSync(path.join(dir, 'loom-memory.config.js'), `
export default {
  zones: {
    'apps/api': 'apps/api'
  }
};
`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  fs.mkdirSync(path.join(dir, '_wiki'), { recursive: true });
  const markers = sectionMarkers('zone-apps-api');
  for (const file of ['01-Architecture-Stack.md', '02-Fonctionnalites-Actuelles.md', '03-Regles-LLM.md']) {
    fs.writeFileSync(path.join(dir, '_wiki', file), `
# Wiki

${markers.start}
apps/api/src/task.ts exposes \`runTask()\`.
${markers.end}
`);
  }

  const result = await verifyRepository(dir);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});
