import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

test('loadConfig normalizes object zones and defaults output paths', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-config-'));
  fs.writeFileSync(path.join(dir, 'loom-memory.config.js'), `
export default {
  llm: { provider: 'ollama', model: 'qwen2.5-coder:3b' },
  zones: { api: 'src/api' }
};
`);

  const config = await loadConfig(dir);
  assert.equal(config.output.wiki, '_wiki');
  assert.equal(config.output.graph, '_graph');
  assert.equal(config.llm.retries, 2);
  assert.equal(config.llm.retryDelayMs, 500);
  assert.deepEqual(config.zones, [{ name: 'api', path: 'src/api' }]);
});

test('loadConfig rejects invalid providers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-config-bad-'));
  fs.writeFileSync(path.join(dir, 'loom-memory.config.js'), `
export default {
  llm: { provider: 'openai ' }
};
`);

  await assert.rejects(() => loadConfig(dir), /Invalid loom-memory config/);
});
