import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('advise recommends context and output mode for a task', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-advise-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), `
export function resetPasswordEmail(user: { email: string }) {
  return user.email;
}
`);
  fs.writeFileSync(path.join(dir, 'src/util.ts'), `export function formatName(name: string) { return name.trim(); }\n`);

  execFileSync(process.execPath, [path.join(root, 'scripts/build-graph.mjs')], {
    cwd: dir,
    stdio: 'ignore',
  });

  const output = execFileSync(process.execPath, [
    path.join(root, 'bin/cli.js'),
    'advise',
    dir,
    'Add password reset email flow',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  const advice = JSON.parse(output);

  assert.equal(advice.risk, 'high');
  assert.equal(advice.recommendedReasoning, 'high');
  assert.equal(advice.outputMode, 'compact_patch');
  assert.ok(advice.filesToInspect.some((file) => file.path === 'src/auth.ts'));
  assert.ok(advice.why.length > 0);
});
