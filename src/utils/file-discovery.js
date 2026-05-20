import fs from 'node:fs';
import path from 'node:path';

export const INDEXED_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.php', '.rb']);

export function getIndexableFiles(repoRoot, ig, { extensions = INDEXED_EXTS } = {}) {
  const files = [];
  walk(repoRoot, repoRoot, ig, extensions, files);
  return files;
}

function walk(root, dir, ig, extensions, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);

    if (entry.name.startsWith('.')) continue;
    if (ig.ignores(rel) || (entry.isDirectory() && ig.ignores(rel + '/'))) continue;

    if (entry.isDirectory()) {
      walk(root, abs, ig, extensions, files);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(abs);
    }
  }
}
