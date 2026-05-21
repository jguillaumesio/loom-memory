import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, isRetryableError } from '../src/utils/retry.js';

test('withRetry retries retryable failures and returns successful result', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) {
      const err = new Error('HTTP 500');
      err.status = 500;
      throw err;
    }
    return 'ok';
  }, {
    retries: 3,
    delayMs: 1,
    sleep: async () => {},
  });

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('withRetry does not retry non-retryable failures', async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    const err = new Error('bad request');
    err.status = 400;
    throw err;
  }, {
    retries: 3,
    sleep: async () => {},
  }), /bad request/);

  assert.equal(calls, 1);
});

test('isRetryableError recognizes rate limits, server errors, and transient network codes', () => {
  assert.equal(isRetryableError({ status: 429 }), true);
  assert.equal(isRetryableError({ status: 503 }), true);
  assert.equal(isRetryableError({ cause: { code: 'ECONNRESET' } }), true);
  assert.equal(isRetryableError({ status: 404, message: 'not found' }), false);
});
