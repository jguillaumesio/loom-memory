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
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM semantic_chunks WHERE kind = ?').get('code').n >= 2);
  db.close();
});

test('status uses the same dot-directory discovery rules as graph build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-status-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.agent/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/main.ts'), `export function main() { return true; }\n`);
  fs.writeFileSync(path.join(dir, '.agent/src/App.tsx'), `export function App() { return null; }\n`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const output = execFileSync(process.execPath, [path.join(root, 'bin/cli.js'), 'status', dir], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.match(output, /Index is up to date/);
  assert.doesNotMatch(output, /\.agent/);
});

test('query graph defaults to exact symbols and quieter unused exports', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-query-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/User.ts'), `export function User() { return true; }\n`);
  fs.writeFileSync(path.join(dir, 'src/UserProfile.ts'), `export function UserProfile() { return true; }\n`);
  fs.writeFileSync(path.join(dir, 'src/default.ts'), `export default function Thing() { return true; }\n`);
  fs.writeFileSync(path.join(dir, 'src/index.ts'), `export { User } from './User';\n`);
  fs.writeFileSync(path.join(dir, 'src/main.ts'), `
import { User } from './User';
export function main() {
  return User();
}
`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const exact = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/query-graph.mjs'), 'symbol', 'User'], {
    cwd: dir,
    encoding: 'utf8',
  }));
  assert.ok(exact.some((row) => row.name === 'User' && row.file === 'src/User.ts'));
  assert.ok(exact.every((row) => row.name === 'User'));

  const fuzzy = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/query-graph.mjs'), 'symbol', 'User', '--fuzzy'], {
    cwd: dir,
    encoding: 'utf8',
  }));
  assert.ok(fuzzy.some((row) => row.name === 'UserProfile'));

  const unused = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/query-graph.mjs'), 'unused'], {
    cwd: dir,
    encoding: 'utf8',
  }));
  assert.ok(unused.some((row) => row.name === 'UserProfile'));
  assert.ok(unused.every((row) => row.name !== 'default'));
  assert.ok(unused.every((row) => !row.file.endsWith('/index.ts')));

  const allUnused = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/query-graph.mjs'), 'unused', '--all'], {
    cwd: dir,
    encoding: 'utf8',
  }));
  assert.ok(allUnused.some((row) => row.file === 'src/index.ts'));
});

test('query graph returns compact zone summaries and recent indexed changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-context-'));
  fs.mkdirSync(path.join(dir, 'apps/web/src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'packages/core/src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'packages/core/src/math.ts'), `
export function add(a: number, b: number) {
  return a + b;
}
`);
  fs.writeFileSync(path.join(dir, 'apps/web/src/app.ts'), `
import { add } from '../../../packages/core/src/math';
export function render() {
  return add(1, 2);
}
`);

  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.name=Loom Test', '-c', 'user.email=loom@example.test', 'commit', '-m', 'fixture'], {
    cwd: dir,
    stdio: 'ignore',
  });

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const summary = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/query-graph.mjs'), 'zoneSummary', 'apps/web'], {
    cwd: dir,
    encoding: 'utf8',
  }));
  assert.equal(summary.length, 1);
  assert.equal(summary[0].zone, 'apps/web');
  assert.deepEqual(summary[0].dependencies, [{ zone: 'packages/core', count: 1 }]);
  assert.ok(summary[0].exports.some((row) => row.name === 'render'));

  const recent = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/query-graph.mjs'), 'recent', '--limit=1'], {
    cwd: dir,
    encoding: 'utf8',
  }));
  assert.equal(recent.length, 1);
  assert.equal(recent[0].path, 'apps/web/src/app.ts');
  assert.equal(recent[0].zone, 'apps/web');
  assert.deepEqual(recent[0].symbols, ['render']);
});

test('query graph searches local code and wiki chunks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-search-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, '_wiki'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/billing.ts'), `
export function calculateInvoiceTotal(lineItems: number[]) {
  return lineItems.reduce((sum, value) => sum + value, 0);
}
`);
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), `
export function validateSession() {
  return true;
}
`);
  fs.writeFileSync(path.join(dir, '_wiki/01-Architecture-Stack.md'), `
# Billing

Invoices are calculated from line items before payment capture.
`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const results = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/query-graph.mjs'), 'search', 'invoice line items', '--limit=2'], {
    cwd: dir,
    encoding: 'utf8',
  }));

  assert.ok(results.length > 0);
  assert.equal(results[0].path, 'src/billing.ts');
  assert.ok(results[0].score > 0);
});

test('build-graph resolves calls through import bindings instead of global names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-import-aware-'));
  fs.mkdirSync(path.join(dir, 'src/a'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src/b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/a/helper.ts'), `export function helper() { return 'a'; }\n`);
  fs.writeFileSync(path.join(dir, 'src/b/helper.ts'), `export function helper() { return 'b'; }\n`);
  fs.writeFileSync(path.join(dir, 'src/main.ts'), `
import { helper as runHelper } from './b/helper';
import * as api from './a/helper';

export function main() {
  runHelper();
  api.helper();
}
`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const db = new Database(path.join(dir, '_graph/codebase.db'), { readonly: true });
  const calls = db.prepare(`
    SELECT caller_symbol, callee_symbol, callee_file
    FROM calls
    WHERE caller_file = 'src/main.ts'
    ORDER BY line
  `).all();
  assert.deepEqual(calls, [
    { caller_symbol: 'main', callee_symbol: 'runHelper', callee_file: 'src/b/helper.ts' },
    { caller_symbol: 'main', callee_symbol: 'helper', callee_file: 'src/a/helper.ts' },
  ]);
  db.close();
});
