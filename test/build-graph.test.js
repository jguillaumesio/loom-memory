import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('build-graph indexes an external repository cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-repo-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/helper.ts'), `export function helper() { return true; }\n`);
  fs.writeFileSync(path.join(dir, 'src/main.ts'), `
import { helper } from './helper';
export function main() {
  return helper();
}
`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const db = new Database(path.join(dir, '_graph/codebase.db'), { readonly: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM files').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM imports').get().n, 1);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM calls WHERE caller_symbol = ? AND callee_symbol = ?').get('main', 'helper').n >= 1);
  db.close();
});

