import path from 'node:path';
import { createRequire } from 'node:module';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { createGraphQueries } from '../../scripts/lib/graph-queries.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const HIGH_RISK = [
  'auth', 'authentication', 'authorization', 'password', 'permission',
  'payment', 'billing', 'invoice', 'migration', 'database', 'schema',
  'security', 'token', 'secret', 'admin', 'delete', 'encrypt',
];

const LOW_RISK = [
  'copy', 'text', 'label', 'docs', 'readme', 'comment', 'format',
  'rename', 'typo', 'style', 'lint',
];

const CODEGEN_HINTS = ['openapi', 'schema', 'crud', 'sdk', 'client', 'generate', 'boilerplate'];

export async function adviseCommand(repoPath = '.', task, options = {}) {
  const repoRoot = path.resolve(repoPath);
  const config = await loadConfig(repoRoot);
  const graphDir = config.output?.graph || '_graph';
  const dbPath = path.join(repoRoot, graphDir, 'codebase.db');
  const db = new Database(dbPath, { readonly: true });
  try {
    const advice = buildTaskAdvice(db, task, {
      cwd: repoRoot,
      limit: parseLimit(options.limit, 8),
    });
    if (options.json) {
      console.log(JSON.stringify(advice, null, 2));
      return;
    }
    printAdvice(advice);
  } finally {
    db.close();
  }
}

export function buildTaskAdvice(db, task, { cwd = process.cwd(), limit = 8 } = {}) {
  const queries = createGraphQueries(db, { cwd });
  const searchResults = queries.search(task, { limit });
  const files = summarizeFiles(searchResults);
  const risk = classifyRisk(task, files);
  const taskSize = classifyTaskSize(task, files);
  const outputMode = chooseOutputMode(task, risk, taskSize);
  const reasoning = chooseReasoning(risk, taskSize);
  const contextStrategy = files.length === 0
    ? 'graph_search_then_targeted_reads'
    : 'memory_first_then_targeted_reads';

  return {
    task,
    taskSize,
    risk,
    recommendedReasoning: reasoning,
    contextStrategy,
    outputMode,
    filesToInspect: files,
    searchResults,
    why: reasons({ task, risk, taskSize, files, outputMode }),
  };
}

function summarizeFiles(results) {
  const seen = new Map();
  for (const result of results) {
    if (!seen.has(result.path)) {
      seen.set(result.path, {
        path: result.path,
        zone: result.zone,
        kind: result.kind,
        score: result.score,
        symbols: result.symbol ? result.symbol.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      continue;
    }
    const existing = seen.get(result.path);
    existing.score = Math.max(existing.score, result.score);
  }
  return [...seen.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 10);
}

function classifyRisk(task, files) {
  const text = `${task} ${files.map((file) => `${file.path} ${file.zone}`).join(' ')}`.toLowerCase();
  if (HIGH_RISK.some((word) => text.includes(word))) return 'high';
  if (LOW_RISK.some((word) => text.includes(word)) && files.length <= 3) return 'low';
  return files.length > 8 ? 'medium' : 'low';
}

function classifyTaskSize(task, files) {
  const words = task.trim().split(/\s+/).filter(Boolean).length;
  if (files.length >= 8 || words >= 20) return 'large';
  if (files.length >= 4 || words >= 10) return 'medium';
  return 'small';
}

function chooseOutputMode(task, risk, taskSize) {
  const lower = task.toLowerCase();
  if (CODEGEN_HINTS.some((word) => lower.includes(word)) && risk !== 'high') return 'codegen';
  if (taskSize === 'small' && risk === 'low') return 'compact_patch';
  if (taskSize === 'large' || risk === 'high') return 'compact_patch';
  return 'recipe';
}

function chooseReasoning(risk, taskSize) {
  if (risk === 'high' || taskSize === 'large') return 'high';
  if (taskSize === 'medium') return 'medium';
  return 'low';
}

function reasons({ risk, taskSize, files, outputMode }) {
  const items = [];
  items.push(`Task classified as ${taskSize}.`);
  items.push(`Risk classified as ${risk}.`);
  if (files.length > 0) items.push(`Memory search found ${files.length} relevant file(s) to inspect first.`);
  else items.push('No strong memory hits; start with graph/search, then inspect source.');
  items.push(`Use ${outputMode} output to reduce response tokens while preserving reviewability.`);
  if (risk === 'high') items.push('High-risk keywords or zones require tests and targeted source confirmation.');
  return items;
}

function printAdvice(advice) {
  console.log(chalk.bold.cyan('\nloom-memory advise\n'));
  console.log(`Task size: ${chalk.cyan(advice.taskSize)}`);
  console.log(`Risk: ${formatRisk(advice.risk)}`);
  console.log(`Reasoning: ${chalk.cyan(advice.recommendedReasoning)}`);
  console.log(`Context strategy: ${chalk.cyan(advice.contextStrategy)}`);
  console.log(`Output mode: ${chalk.cyan(advice.outputMode)}`);

  console.log(chalk.bold('\nFiles To Inspect'));
  if (advice.filesToInspect.length === 0) {
    console.log(chalk.gray('  none from memory search'));
  } else {
    for (const file of advice.filesToInspect.slice(0, 8)) {
      console.log(chalk.gray(`  ${file.path} — score ${file.score}`));
    }
  }

  console.log(chalk.bold('\nWhy'));
  for (const reason of advice.why) console.log(`  ${reason}`);
  console.log();
}

function formatRisk(risk) {
  if (risk === 'high') return chalk.red(risk);
  if (risk === 'medium') return chalk.yellow(risk);
  return chalk.green(risk);
}

function parseLimit(value, fallback) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
