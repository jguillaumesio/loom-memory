export async function withRetry(fn, {
  retries = 2,
  delayMs = 500,
  factor = 2,
  shouldRetry = isRetryableError,
  onRetry,
  sleep = defaultSleep,
} = {}) {
  let attempt = 0;
  let delay = delayMs;

  while (true) {
    try {
      return await fn({ attempt });
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      attempt += 1;
      await onRetry?.(err, attempt);
      await sleep(delay);
      delay *= factor;
    }
  }
}

export function isRetryableError(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;

  const code = err?.code ?? err?.cause?.code;
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)) return true;

  return /429|rate.?limit|timeout|timed out|ECONNRESET|ECONNREFUSED|EAI_AGAIN|HTTP 5\d\d/i.test(err?.message ?? '');
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
