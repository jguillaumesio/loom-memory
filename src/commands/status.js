import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import Database from 'better-sqlite3';
import { loadLoomIgnore } from '../utils/loomignore.js';
import { promptHash, readWikiFrontmatter } from '../utils/wiki-frontmatter.js';
import { getIndexableFiles } from '../utils/file-discovery.js';

export async function statusCommand(repoPath = '.') {
  const repoRoot = path.resolve(repoPath);
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
  let callCount = null;
  try {
    edgeCount = db.prepare('SELECT COUNT(*) as n FROM imports').get().n;
  } catch { /* table may not exist */ }
  try {
    callCount = db.prepare('SELECT COUNT(*) as n FROM calls').get().n;
  } catch { /* table may not exist */ }

  console.log(`  Files indexed: ${chalk.cyan(fileCount)}`);
  console.log(`  Symbols: ${chalk.cyan(symbolCount)}`);
  if (edgeCount !== null) console.log(`  Edges: ${chalk.cyan(edgeCount)}`);
  if (callCount !== null) console.log(`  Calls: ${chalk.cyan(callCount)}`);

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

  reportPromptFreshness(repoRoot);

  console.log();
  db.close();
}

function reportPromptFreshness(repoRoot) {
  const wikiDir = path.join(repoRoot, '_wiki');
  if (!fs.existsSync(wikiDir)) return;

  const promptMap = {
    '00-Index.md': 'wiki',
    '01-Architecture-Stack.md': 'wiki',
    '02-Fonctionnalites-Actuelles.md': 'wiki',
    '03-Regles-LLM.md': 'wiki',
    '04-Code-Map.md': 'map',
    '05-Call-Graph.md': 'callgraph',
  };

  const stale = [];
  const missingMeta = [];
  for (const [file, promptName] of Object.entries(promptMap)) {
    const filePath = path.join(wikiDir, file);
    if (!fs.existsSync(filePath)) continue;
    const meta = readWikiFrontmatter(filePath);
    if (!meta?.loom_prompt_hash) {
      missingMeta.push(file);
      continue;
    }
    const promptPath = new URL(`../../prompts/${promptName}.md`, import.meta.url);
    const currentHash = promptHash(fs.readFileSync(promptPath, 'utf8'));
    if (meta.loom_prompt_hash !== currentHash) stale.push(file);
  }

  console.log(chalk.bold('\nPrompt Versions'));
  if (stale.length === 0 && missingMeta.length === 0) {
    console.log(`  ${chalk.green('✓')} Wiki prompt metadata is current.`);
    return;
  }
  for (const file of stale) console.log(`  ${chalk.yellow('!')} ${file} was generated with an older prompt.`);
  for (const file of missingMeta) console.log(`  ${chalk.yellow('!')} ${file} has no loom prompt metadata.`);
}

function findNewFiles(repoRoot, indexedSet, ig) {
  const indexed = new Set(indexedSet);
  return getIndexableFiles(repoRoot, ig)
    .map((abs) => path.relative(repoRoot, abs))
    .filter((rel) => !indexed.has(rel));
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
