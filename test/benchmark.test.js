import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('benchmark reports graph coverage and token reduction estimates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-benchmark-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, '_wiki'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/main.ts'), `
import { helper } from './helper';
export function main() {
  return helper();
}
`);
  fs.writeFileSync(path.join(dir, 'src/helper.ts'), `export function helper() { return true; }\n`);
  fs.writeFileSync(path.join(dir, '_wiki/00-Index.md'), '# Index\n\nSmall repository memory.\n');

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const json = JSON.parse(execFileSync(process.execPath, [path.join(root, 'bin/cli.js'), 'benchmark', dir, '--json'], {
    cwd: root,
    encoding: 'utf8',
  }));

  assert.equal(json.graph.files, 2);
  assert.equal(json.graph.imports, 1);
  assert.ok(json.graph.symbols >= 2);
  assert.ok(json.graph.semanticChunks >= 2);
  assert.ok(json.tokens.coldRead > 0);
  assert.ok(json.tokens.memoryAssisted > 0);
  assert.ok(Array.isArray(json.recommendations));

  const human = execFileSync(process.execPath, [path.join(root, 'bin/cli.js'), 'benchmark', dir, '--chunks', '2'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(human, /loom-memory benchmark/);
  assert.match(human, /Token Estimate/);
  assert.match(human, /Estimated reduction/);
});
