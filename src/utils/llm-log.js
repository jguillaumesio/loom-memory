import fs from 'node:fs';
import path from 'node:path';

export function appendLlmLog(repoRoot, entry) {
  if (!repoRoot) return;
  const graphDir = path.join(repoRoot, '_graph');
  fs.mkdirSync(graphDir, { recursive: true });
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    provider: entry.provider,
    model: entry.model,
    task: entry.task || 'unknown',
    zone: entry.zone || null,
    prompt_tokens: entry.promptTokens ?? null,
    completion_tokens: entry.completionTokens ?? null,
    duration_ms: entry.durationMs ?? null,
    error: entry.error || null,
  });
  fs.appendFileSync(path.join(graphDir, 'runs.jsonl'), line + '\n', 'utf8');
}

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

