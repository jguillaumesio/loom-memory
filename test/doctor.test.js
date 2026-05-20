import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBetterSqliteNative, nodeRuntimeInfo } from '../src/commands/doctor.js';
import { listModels } from '../src/utils/ollama.js';

test('doctor exposes active Node runtime information', () => {
  const info = nodeRuntimeInfo();
  assert.equal(info.path, process.execPath);
  assert.equal(info.version, process.version);
  assert.equal(info.abi, process.versions.modules);
});

test('doctor native sqlite check reports load status', () => {
  const result = checkBetterSqliteNative();
  assert.equal(typeof result.ok, 'boolean');
  if (!result.ok) {
    assert.match(result.message, new RegExp(process.versions.modules));
  }
});

test('Ollama EPERM fetch failures are reported as local-network permission issues', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const error = new TypeError('fetch failed');
  error.cause = { code: 'EPERM' };
  globalThis.fetch = async () => {
    throw error;
  };

  await assert.rejects(
    () => listModels('http://localhost:11434'),
    /local-network permission/
  );
});
