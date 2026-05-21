import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { estimateLlmUsage, summarizeUsage } from '../src/utils/cost-estimator.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('estimateLlmUsage estimates paid provider cost and local Ollama as zero cost', () => {
  const paid = estimateLlmUsage('hello '.repeat(400), {
    provider: 'openai',
    model: 'gpt-4o-mini',
    maxOutputTokens: 1000,
  });
  assert.equal(paid.provider, 'openai');
  assert.ok(paid.inputTokens > 0);
  assert.ok(paid.estimatedCostUsd > 0);

  const local = estimateLlmUsage('hello', {
    provider: 'ollama',
    model: 'qwen2.5-coder:7b',
  });
  assert.equal(local.estimatedCostUsd, 0);

  const total = summarizeUsage([paid, local]);
  assert.ok(total.inputTokens >= paid.inputTokens);
  assert.equal(total.estimatedCostUsd, paid.estimatedCostUsd);
});

test('detailed map dry run estimates cost without writing maps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-cost-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/main.ts'), `export function main() { return true; }\n`);
  fs.writeFileSync(path.join(dir, 'loom-memory.config.mjs'), `
export default {
  llm: { provider: 'openai', model: 'gpt-4o-mini' },
  zones: [{ name: 'src', path: 'src' }],
};
`);

  const output = execFileSync(process.execPath, [path.join(root, 'scripts/update-detailed-maps.mjs'), '--dry-run'], {
    cwd: dir,
    encoding: 'utf8',
  });

  assert.match(output, /Dry run total/);
  assert.match(output, /No LLM calls were made/);
  assert.equal(fs.existsSync(path.join(dir, '_wiki/maps/detailed/src.detailed.md')), false);
});
