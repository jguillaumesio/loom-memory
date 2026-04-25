import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import Database from 'better-sqlite3';
import { loadLoomIgnore } from '../utils/loomignore.js';

export async function statusCommand() {
  const repoRoot = process.cwd();
  const dbPath = path.join(repoRoot, '_graph', 'codebase.db');

  console.log(chalk.bold('\nloom-memory status\n'));

  if (!fs.existsSync(dbPath)) {
    console.log(chalk.red('✗ No graph database found at _graph/codebase.db'));
    console.log(chalk.gray('  Run `loom-memory init` then `loom-memory update`.\n'));
    process.exit(1);
  }

  const dbStat = fs.statSync(dbPath);
  const lastIndex = dbStat.mtime;
  const db = new Database(dbPath, { readonly: true });

  // ── Index info ──────────────────────────────────────────
  console.log(chalk.bold('Index'));
  console.log(`  Last updated: ${chalk.cyan(formatRelative(lastIndex))} ${chalk.gray('(' + lastIndex.toISOString() + ')')}`);
  console.log(`  Database size: ${chalk.cyan(formatBytes(dbStat.size))}`);

  // ── Counts ──────────────────────────────────────────────
  const fileCount = db.prepare('SELECT COUNT(*) as n FROM files').get().n;
  const symbolCount = db.prepare('SELECT COUNT(*) as n FROM symbols').get().n;
  let edgeCount = null;
  try {
    edgeCount = db.prepare('SELECT COUNT(*) as n FROM imports').get().n;
  } catch { /* table may not exist */ }

  console.log(`  Files indexed: ${chalk.cyan(fileCount)}`);
  console.log(`  Symbols: ${chalk.cyan(symbolCount)}`);
  if (edgeCount !== null) console.log(`  Edges: ${chalk.cyan(edgeCount)}`);

  // ── Stale files ─────────────────────────────────────────
  console.log(chalk.bold('\nFreshness'));
  const indexedPaths = db.prepare('SELECT path FROM files').all().map(r => r.path);
  const ig = loadLoomIgnore(repoRoot);

  const stale = [];
  const missing = [];
  for (const rel of indexedPaths) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const mtime = fs.statSync(abs).mtime;
    if (mtime > lastIndex) stale.push({ path: rel, mtime });
  }

  const newFiles = findNewFiles(repoRoot, indexedPaths, ig);

  if (stale.length === 0 && missing.length === 0 && newFiles.length === 0) {
    console.log(`  ${chalk.green('✓')} Index is up to date.`);
  } else {
    if (stale.length > 0) {
      console.log(`  ${chalk.yellow('!')} ${stale.length} file(s) modified since last index:`);
      for (const f of stale.slice(0, 10)) {
        console.log(chalk.gray(`      ${f.path}`));
      }
      if (stale.length > 10) console.log(chalk.gray(`      ... and ${stale.length - 10} more`));
    }
    if (newFiles.length > 0) {
      console.log(`  ${chalk.yellow('!')} ${newFiles.length} new file(s) not yet indexed:`);
      for (const f of newFiles.slice(0, 10)) {
        console.log(chalk.gray(`      ${f}`));
      }
      if (newFiles.length > 10) console.log(chalk.gray(`      ... and ${newFiles.length - 10} more`));
    }
    if (missing.length > 0) {
      console.log(`  ${chalk.yellow('!')} ${missing.length} indexed file(s) no longer exist on disk:`);
      for (const f of missing.slice(0, 10)) {
        console.log(chalk.gray(`      ${f}`));
      }
      if (missing.length > 10) console.log(chalk.gray(`      ... and ${missing.length - 10} more`));
    }
    console.log(chalk.gray('\n  Run `loom-memory update` to refresh.'));
  }

  console.log();
  db.close();
}

function findNewFiles(repoRoot, indexedSet, ig) {
  const indexed = new Set(indexedSet);
  const found = [];
  walk(repoRoot, repoRoot, ig, (rel) => {
    if (!indexed.has(rel)) found.push(rel);
  });
  return found;
}

function walk(root, dir, ig, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);
    if (ig.ignores(rel) || ig.ignores(rel + '/')) continue;
    if (entry.isDirectory()) walk(root, abs, ig, onFile);
    else if (entry.isFile()) onFile(rel);
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatRelative(date) {
  const ms = Date.now() - date.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
