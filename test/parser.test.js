import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFile } from '../src/parser/ts-parser.js';

test('TypeScript parser extracts exports, imports, and calls', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-parser-'));
  const file = path.join(dir, 'sample.ts');
  fs.writeFileSync(file, `
import { helper } from './helper';

export function runInit() {
  helper();
  localThing();
}

function localThing() {
  return true;
}
`);

  const parsed = parseFile(file);
  assert.deepEqual(parsed.imports, ['./helper']);
  assert.deepEqual(parsed.importBindings, [{ local: 'helper', imported: 'helper', source: './helper', namespace: false }]);
  assert.ok(parsed.symbols.includes('runInit'));
  assert.ok(parsed.calls.some((call) => call.caller === 'runInit' && call.callee === 'helper'));
  assert.ok(parsed.calls.some((call) => call.caller === 'runInit' && call.callee === 'localThing'));
});

test('TypeScript parser records default, alias, and namespace import bindings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-parser-imports-'));
  const file = path.join(dir, 'sample.ts');
  fs.writeFileSync(file, `
import defaultThing from './default-thing';
import { helper as runHelper } from './helper';
import * as api from './api';

export function runInit() {
  defaultThing();
  runHelper();
  api.loadData();
}
`);

  const parsed = parseFile(file);
  assert.deepEqual(parsed.importBindings, [
    { local: 'defaultThing', imported: 'default', source: './default-thing', namespace: false },
    { local: 'runHelper', imported: 'helper', source: './helper', namespace: false },
    { local: 'api', imported: '*', source: './api', namespace: true },
  ]);
  assert.ok(parsed.calls.some((call) => call.callee === 'loadData' && call.qualifier === 'api'));
});
