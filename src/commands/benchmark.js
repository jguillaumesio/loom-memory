import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';
import { estimateTokens } from '../utils/llm-log.js';

const DEFAULT_RETRIEVAL_CHUNKS = 8;

export async function benchmarkCommand(repoPath = '.', options = {}) {
  const repoRoot = path.resolve(repoPath);
  const config = await loadConfig(repoRoot);
  const graphDir = config.output?.graph || '_graph';
  const wikiDir = config.output?.wiki || '_wiki';
  const dbPath = path.join(repoRoot, graphDir, 'codebase.db');

  if (!fs.existsSync(dbPath)) {
    console.error(chalk.red(`No graph database found at ${path.relative(repoRoot, dbPath)}.`));
    console.error(chalk.gray('Run `loom-memory init` or `npm run graph` first.'));
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const report = buildBenchmarkReport(db, repoRoot, { wikiDir, retrievalChunks: parseLimit(options.chunks) });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    printReport(report);
  } finally {
    db.close();
  }
}

export function buildBenchmarkReport(db, repoRoot, { wikiDir = '_wiki', retrievalChunks = DEFAULT_RETRIEVAL_CHUNKS } = {}) {
  const files = db.prepare('SELECT path, zone, lang FROM files ORDER BY path').all();
  const fileStats = files.map((file) => {
    const abs = path.join(repoRoot, file.path);
    const bytes = fs.existsSync(abs) ? fs.statSync(abs).size : 0;
    return { ...file, bytes, tokens: estimateTokensFromBytes(bytes), exists: fs.existsSync(abs) };
  });

  const coldReadTokens = sum(fileStats.map((file) => file.tokens));
  const wikiTokens = estimateWikiTokens(path.join(repoRoot, wikiDir));
  const chunkStats = semanticChunkStats(db, retrievalChunks);
  const memoryAssistedTokens = wikiTokens + chunkStats.retrievalTokens;
  const reductionPercent = coldReadTokens > 0
    ? Number((100 * (1 - (memoryAssistedTokens / coldReadTokens))).toFixed(1))
    : 0;

  return {
    repo: repoRoot,
    graph: {
      files: files.length,
      symbols: tableCount(db, 'symbols'),
      imports: tableCount(db, 'imports'),
      calls: tableCount(db, 'calls'),
      semanticChunks: tableCount(db, 'semantic_chunks'),
    },
    coverage: {
      languages: groupedCount(files, 'lang'),
      zones: groupedCount(files, 'zone'),
      missingFiles: fileStats.filter((file) => !file.exists).map((file) => file.path),
      filesWithoutSymbols: filesWithoutSymbols(db),
      filesWithoutSearchChunks: filesWithoutSearchChunks(db),
    },
    tokens: {
      coldRead: coldReadTokens,
      wikiMemory: wikiTokens,
      retrievalChunks: chunkStats.retrievalTokens,
      memoryAssisted: memoryAssistedTokens,
      reductionPercent,
      retrievalChunkCount: chunkStats.countUsed,
    },
    largestFiles: fileStats
      .filter((file) => file.exists)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10)
      .map(({ path, zone, lang, tokens }) => ({ path, zone, lang, tokens })),
    recommendations: recommendations({
      coldReadTokens,
      memoryAssistedTokens,
      semanticChunks: tableCount(db, 'semantic_chunks'),
      filesWithoutSearchChunks: filesWithoutSearchChunks(db),
      filesWithoutSymbols: filesWithoutSymbols(db),
      missingFiles: fileStats.filter((file) => !file.exists),
    }),
  };
}

function printReport(report) {
  console.log(chalk.bold.cyan('\nloom-memory benchmark\n'));
  console.log(chalk.dim(`Repo: ${report.repo}\n`));

  console.log(chalk.bold('Graph'));
  console.log(`  Files: ${chalk.cyan(report.graph.files)}`);
  console.log(`  Symbols: ${chalk.cyan(report.graph.symbols)}`);
  console.log(`  Imports: ${chalk.cyan(report.graph.imports)}`);
  console.log(`  Calls: ${chalk.cyan(report.graph.calls)}`);
  console.log(`  Search chunks: ${chalk.cyan(report.graph.semanticChunks)}`);

  console.log(chalk.bold('\nToken Estimate'));
  console.log(`  Cold read indexed files: ${chalk.cyan(formatNumber(report.tokens.coldRead))} tokens`);
  console.log(`  Wiki memory: ${chalk.cyan(formatNumber(report.tokens.wikiMemory))} tokens`);
  console.log(`  ${report.tokens.retrievalChunkCount} retrieval chunks: ${chalk.cyan(formatNumber(report.tokens.retrievalChunks))} tokens`);
  console.log(`  Memory-assisted context: ${chalk.cyan(formatNumber(report.tokens.memoryAssisted))} tokens`);
  console.log(`  Estimated reduction: ${chalk.green(`${report.tokens.reductionPercent}%`)}`);

  console.log(chalk.bold('\nCoverage'));
  console.log(`  Languages: ${formatGrouped(report.coverage.languages)}`);
  console.log(`  Zones: ${formatGrouped(report.coverage.zones)}`);
  console.log(`  Missing indexed files: ${formatRiskCount(report.coverage.missingFiles.length)}`);
  console.log(`  Files without symbols: ${formatRiskCount(report.coverage.filesWithoutSymbols.length)}`);
  console.log(`  Files without search chunks: ${formatRiskCount(report.coverage.filesWithoutSearchChunks.length)}`);

  if (report.largestFiles.length > 0) {
    console.log(chalk.bold('\nLargest Indexed Files'));
    for (const file of report.largestFiles.slice(0, 5)) {
      console.log(chalk.gray(`  ${file.path} — ${formatNumber(file.tokens)} tokens`));
    }
  }

  console.log(chalk.bold('\nRecommendations'));
  for (const item of report.recommendations) {
    console.log(`  ${item}`);
  }
  console.log();
}

function semanticChunkStats(db, retrievalChunks) {
  if (!hasTable(db, 'semantic_chunks')) return { countUsed: 0, retrievalTokens: 0 };
  const rows = db.prepare(`
    SELECT text
    FROM semantic_chunks
    ORDER BY length(text) DESC
    LIMIT ?
  `).all(retrievalChunks);
  return {
    countUsed: rows.length,
    retrievalTokens: sum(rows.map((row) => estimateTokens(row.text))),
  };
}

function estimateWikiTokens(wikiPath) {
  if (!fs.existsSync(wikiPath)) return 0;
  let total = 0;
  for (const file of walkMarkdown(wikiPath)) {
    total += estimateTokens(fs.readFileSync(file, 'utf8'));
  }
  return total;
}

function walkMarkdown(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(abs));
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(abs);
  }
  return files;
}

function filesWithoutSymbols(db) {
  if (!hasTable(db, 'symbols')) return [];
  return db.prepare(`
    SELECT f.path
    FROM files f
    LEFT JOIN symbols s ON s.file = f.path
    WHERE s.id IS NULL
    ORDER BY f.path
  `).all().map((row) => row.path);
}

function filesWithoutSearchChunks(db) {
  if (!hasTable(db, 'semantic_chunks')) return [];
  return db.prepare(`
    SELECT f.path
    FROM files f
    LEFT JOIN semantic_chunks c ON c.path = f.path
    WHERE c.id IS NULL
    ORDER BY f.path
  `).all().map((row) => row.path);
}

function recommendations({ coldReadTokens, memoryAssistedTokens, semanticChunks, filesWithoutSearchChunks, filesWithoutSymbols, missingFiles }) {
  const items = [];
  if (semanticChunks === 0) items.push('Run `npm run graph` or `loom-memory update` to build semantic search chunks.');
  if (missingFiles.length > 0) items.push('Refresh the graph; some indexed files no longer exist.');
  if (filesWithoutSearchChunks.length > 0) items.push('Inspect files without search chunks; they may be contracts or parser gaps.');
  if (filesWithoutSymbols.length > 0) items.push('Review symbol coverage for parser blind spots in low-signal files.');
  if (coldReadTokens > 1_000 && memoryAssistedTokens / coldReadTokens > 0.5) {
    items.push('Memory context is still large; improve search ranking or split oversized wiki/maps.');
  }
  if (items.length === 0) items.push('Benchmark looks healthy. Use this baseline when testing larger repositories.');
  return items;
}

function tableCount(db, table) {
  if (!hasTable(db, table)) return 0;
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

function hasTable(db, table) {
  return Boolean(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table));
}

function groupedCount(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key] || 'unknown', (counts.get(row[key] || 'unknown') ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function parseLimit(value) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_RETRIEVAL_CHUNKS), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_RETRIEVAL_CHUNKS;
}

function estimateTokensFromBytes(bytes) {
  return Math.ceil(bytes / 4);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function formatNumber(n) {
  return Math.round(n).toLocaleString();
}

function formatGrouped(rows) {
  if (rows.length === 0) return chalk.gray('none');
  return rows.slice(0, 8).map((row) => `${row.name}:${row.count}`).join(', ');
}

function formatRiskCount(count) {
  return count === 0 ? chalk.green('0') : chalk.yellow(String(count));
}
