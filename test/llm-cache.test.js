import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cacheKey, readCachedLlmOutput, writeCachedLlmOutput } from '../src/utils/llm-cache.js';

test('LLM cache stores and retrieves output by stable key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-llm-cache-'));
  const key = cacheKey({
    task: 'zone-map',
    zone: 'apps/api',
    provider: 'ollama',
    model: 'qwen2.5-coder:7b',
    input: 'prompt',
  });

  assert.equal(readCachedLlmOutput(dir, key), null);
  writeCachedLlmOutput(dir, key, { task: 'zone-map' }, 'cached map');
  assert.equal(readCachedLlmOutput(dir, key), 'cached map');
});

test('LLM cache keys differ by input and zone', () => {
  const base = {
    task: 'zone-map',
    provider: 'ollama',
    model: 'qwen2.5-coder:7b',
    input: 'prompt',
  };

  assert.notEqual(cacheKey({ ...base, zone: 'apps/api' }), cacheKey({ ...base, zone: 'apps/admin' }));
  assert.notEqual(cacheKey({ ...base, zone: 'apps/api', input: 'changed' }), cacheKey({ ...base, zone: 'apps/api' }));
});
