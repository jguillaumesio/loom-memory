import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const fixtures = [
  {
    name: 'typescript app',
    files: {
      'src/helper.ts': `export function helper() { return true; }\n`,
      'src/main.ts': `
import { helper } from './helper';
export function main() {
  return helper();
}
`,
    },
    expected: {
      files: 2,
      imports: [{ from: 'src/main.ts', to: 'src/helper.ts' }],
      symbols: ['helper', 'main'],
      calls: [{ caller: 'main', callee: 'helper', file: 'src/helper.ts' }],
    },
  },
  {
    name: 'python package',
    files: {
      'src/helpers.py': `def helper():\n    return True\n`,
      'src/main.py': `from .helpers import helper\n\nclass Runner:\n    pass\n`,
    },
    expected: {
      files: 2,
      imports: [{ from: 'src/main.py', to: 'src/helpers.py' }],
      symbols: ['helper', 'Runner'],
      calls: [],
    },
  },
  {
    name: 'php package',
    files: {
      'src/helper.php': `<?php\nfunction helper() { return true; }\n`,
      'src/main.php': `<?php\nrequire_once './helper.php';\nclass Controller { public function index() {} }\n`,
    },
    expected: {
      files: 2,
      imports: [{ from: 'src/main.php', to: 'src/helper.php' }],
      symbols: ['helper', 'Controller', 'index'],
      calls: [],
    },
  },
  {
    name: 'ruby package',
    files: {
      'src/helper.rb': `def helper\n  true\nend\n`,
      'src/main.rb': `require_relative './helper'\n\nclass Runner\nend\n`,
    },
    expected: {
      files: 2,
      imports: [{ from: 'src/main.rb', to: 'src/helper.rb' }],
      symbols: ['helper', 'Runner'],
      calls: [],
    },
  },
  {
    name: 'cross-language OpenAPI contract',
    files: {
      'services/api/openapi.yaml': `openapi: 3.0.0\ninfo:\n  title: Billing API\n  version: 1.0.0\n`,
      'packages/client/src/generated.ts': `
// @openapi ../../../services/api/openapi.yaml
export function createBillingClient() {
  return true;
}
`,
    },
    expected: {
      files: 2,
      imports: [{ from: 'packages/client/src/generated.ts', to: 'services/api/openapi.yaml' }],
      symbols: ['createBillingClient'],
      calls: [],
    },
  },
];

for (const fixture of fixtures) {
  test(`build-graph indexes fixture repo: ${fixture.name}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-fixture-'));
    for (const [file, content] of Object.entries(fixture.files)) {
      const abs = path.join(dir, file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }

    execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
      cwd: dir,
      stdio: 'ignore',
    });

    const db = new Database(path.join(dir, '_graph/codebase.db'), { readonly: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM files').get().n, fixture.expected.files);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM semantic_chunks').get().n >= fixture.expected.files);

    for (const symbol of fixture.expected.symbols) {
      assert.ok(
        db.prepare('SELECT COUNT(*) AS n FROM symbols WHERE name = ?').get(symbol).n >= 1,
        `expected symbol ${symbol}`
      );
    }

    for (const edge of fixture.expected.imports) {
      assert.equal(db.prepare(`
        SELECT COUNT(*) AS n
        FROM imports i
        JOIN files importer ON importer.id = i.importer_id
        JOIN files importee ON importee.id = i.importee_id
        WHERE importer.path = ? AND importee.path = ?
      `).get(edge.from, edge.to).n, 1);
    }

    for (const call of fixture.expected.calls) {
      assert.equal(db.prepare(`
        SELECT COUNT(*) AS n
        FROM calls
        WHERE caller_symbol = ? AND callee_symbol = ? AND callee_file = ?
      `).get(call.caller, call.callee, call.file).n, 1);
    }
    db.close();
  });
}
