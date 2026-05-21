import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function cacheKey({ task, zone, provider, model, input }) {
  const hash = crypto.createHash('sha256')
    .update([task, zone, provider, model, input].filter(Boolean).join('\n---\n'))
    .digest('hex');
  return hash.slice(0, 24);
}

export function readCachedLlmOutput(repoRoot, key) {
  const file = cachePath(repoRoot, key);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).output ?? null;
}

export function writeCachedLlmOutput(repoRoot, key, metadata, output) {
  const file = cachePath(repoRoot, key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    ...metadata,
    cached_at: new Date().toISOString(),
    output,
  }, null, 2) + '\n', 'utf8');
}

function cachePath(repoRoot, key) {
  return path.join(repoRoot, '_graph', 'llm-cache', `${key}.json`);
}
