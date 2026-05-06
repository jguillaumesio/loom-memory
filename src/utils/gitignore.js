import fs from 'node:fs';
import path from 'node:path';

const MANAGED_ENTRIES = [
  '_graph/*.db',
  '_graph/*.db-shm',
  '_graph/*.db-wal',
  '_graph/runs.jsonl',
];

const LOOM_BLOCK_START = '# loom-memory — auto-managed (do not edit this block)';
const LOOM_BLOCK_END   = '# end loom-memory';

export function ensureGitignore(repoRoot) {
  const gitignorePath = path.join(repoRoot, '.gitignore');

  let original = '';
  if (fs.existsSync(gitignorePath)) {
    original = fs.readFileSync(gitignorePath, 'utf8');
  }

  // If our block already exists, replace it cleanly (idempotent)
  if (original.includes(LOOM_BLOCK_START)) {
    const before = original.slice(0, original.indexOf(LOOM_BLOCK_START));
    const afterBlock = original.indexOf(LOOM_BLOCK_END);
    const after = afterBlock !== -1
      ? original.slice(afterBlock + LOOM_BLOCK_END.length)
      : '';
    const block = buildBlock();
    const updated = before.trimEnd() + '\n\n' + block + '\n' + after.trimStart();
    fs.writeFileSync(gitignorePath, updated, 'utf8');
    return { action: 'updated', path: gitignorePath };
  }

  // Block does not exist — append it
  const separator = original.length > 0 && !original.endsWith('\n') ? '\n' : '';
  const appended = original + separator + '\n' + buildBlock() + '\n';
  fs.writeFileSync(gitignorePath, appended, 'utf8');
  return { action: 'appended', path: gitignorePath };
}

function buildBlock() {
  return [
    LOOM_BLOCK_START,
    ...MANAGED_ENTRIES,
    LOOM_BLOCK_END,
  ].join('\n');
}
