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
  assert.ok(parsed.symbols.includes('runInit'));
  assert.ok(parsed.calls.some((call) => call.caller === 'runInit' && call.callee === 'helper'));
  assert.ok(parsed.calls.some((call) => call.caller === 'runInit' && call.callee === 'localThing'));
});

