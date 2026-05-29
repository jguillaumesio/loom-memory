import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { callLLM } from '../llm.js';
import { loadConfig } from '../config.js';

const TRIVIAL_NAMES = new Set([
  'toString', 'toJSON', 'valueOf', 'constructor',
  'componentDidMount', 'componentWillUnmount', 'render', 'getSnapshotBeforeUpdate',
  'shouldComponentUpdate', 'componentDidUpdate', 'componentDidCatch',
  'getDefaultProps', 'getInitialState', 'getChildContext',
]);

function isTrivialName(name) {
  // getName, setId, isReady, hasValue, toArray, toJSON, getX, setX...
  if (/^(get|set|is|has|to|should)[A-Z]/.test(name)) return true;
  if (TRIVIAL_NAMES.has(name)) return true;
  return false;
}

export async function runFunctionAnalysis(absPath, repoRoot, options = {}) {
  const config = await loadConfig(absPath);
  const graphDir = path.join(absPath, config.output?.graph || '_graph');
  const wikiDir = path.join(absPath, config.output?.wiki || '_wiki');
  const dbPath = path.join(graphDir, 'codebase.db');

  if (!fs.existsSync(dbPath)) {
    console.log(chalk.yellow('  No graph DB found. Skipping function analysis.'));
    return { analyzed: 0, skipped: 0, descriptions: {} };
  }

  const { Database } = await import('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });

  // Gather functions from DB
  let allFunctions;
  try {
    allFunctions = db.prepare('SELECT name, file, start_line, end_line, lines FROM functions').all();
  } catch {
    // Table may not exist yet
    db.close();
    console.log(chalk.yellow('  No functions table in graph. Skipping function analysis.'));
    return { analyzed: 0, skipped: 0, descriptions: {} };
  }
  db.close();

  if (allFunctions.length === 0) {
    console.log(chalk.dim('  No functions detected in graph.'));
    return { analyzed: 0, skipped: 0, descriptions: {} };
  }

  // Filter out trivial ones
  const candidates = allFunctions.filter(fn => {
    if (fn.lines < 4) return false; // too short
    if (isTrivialName(fn.name)) return false;
    return true;
  });

  const skippedCount = allFunctions.length - candidates.length;
  console.log(chalk.dim(`  ${allFunctions.length} functions found, ${candidates.length} to analyze (${skippedCount} trivial skipped)`));

  if (candidates.length === 0) {
    return { analyzed: 0, skipped: skippedCount, descriptions: {} };
  }

  // Group functions by file for code extraction
  const grouped = new Map(); // file -> [{name, startLine, endLine, lines}]
  for (const fn of candidates) {
    if (!grouped.has(fn.file)) grouped.set(fn.file, []);
    grouped.get(fn.file).push(fn);
  }

  // Extract source for each function and batch
  const BATCH_SIZE = 12;
  const batches = [];
  let currentBatch = [];
  let currentEntries = [];

  for (const [file, fns] of grouped) {
    const absFile = path.join(absPath, file);
    let lines = [];
    try {
      lines = fs.readFileSync(absFile, 'utf8').split('\n');
    } catch {
      continue;
    }

    for (const fn of fns) {
      const startIdx = Math.max(0, fn.start_line - 1);
      const endIdx = Math.min(lines.length, fn.end_line);
      const source = lines.slice(startIdx, endIdx).join('\n');
      currentBatch.push(`${fn.name} (${file}:${fn.start_line}-${fn.end_line}):\n${source}`);
      currentEntries.push({ name: fn.name, file });

      if (currentBatch.length >= BATCH_SIZE) {
        batches.push({ text: currentBatch.join('\n---\n'), entries: currentEntries });
        currentBatch = [];
        currentEntries = [];
      }
    }
  }
  if (currentBatch.length > 0) {
    batches.push({ text: currentBatch.join('\n---\n'), entries: currentEntries });
  }

  console.log(chalk.dim(`  Analyzing in ${batches.length} batch(es)...`));

  // Prompt template
  const promptTemplate = fs.readFileSync(
    new URL('../../prompts/function-describe.md', import.meta.url), 'utf8'
  );

  const descriptions = {}; // { file: { name: description } }
  let analyzed = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const prompt = promptTemplate.replace('{{FUNCTIONS}}', batch.text);

    try {
      const result = await callLLM(prompt, null, {
        repoRoot,
        config,
        task: 'function-describe',
        model: options.model || config?.llm?.models?.functionDescribe || config?.llm?.model || 'qwen2.5-coder:7b',
      });

      // Parse result
      for (const line of result.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes(':')) continue;
        const colonIdx = trimmed.indexOf(':');
        const fnName = trimmed.slice(0, colonIdx).trim();
        const desc = trimmed.slice(colonIdx + 1).trim();

        if (!fnName || !desc || desc.toLowerCase() === 'skip') continue;

        // Find which file this belongs to
        const entry = batch.entries.find(e => e.name === fnName);
        if (!entry) continue;
        if (!descriptions[entry.file]) descriptions[entry.file] = {};
        descriptions[entry.file][fnName] = desc;
        analyzed++;
      }

      console.log(chalk.dim(`  Batch ${i + 1}/${batches.length} done`));
    } catch (err) {
      console.error(chalk.yellow(`  ! Batch ${i + 1} failed: ${err.message}`));
    }
  }

  // Write function-descriptions.json
  const descPath = path.join(graphDir, 'function-descriptions.json');
  fs.mkdirSync(graphDir, { recursive: true });
  fs.writeFileSync(descPath, JSON.stringify(descriptions, null, 2) + '\n', 'utf8');
  console.log(chalk.gray(`  Wrote ${descPath}`));

  // Generate _wiki/06-Function-Descriptions.md
  generateWiki(wikiDir, descriptions);
  console.log(chalk.gray(`  Wrote _wiki/06-Function-Descriptions.md`));

  return { analyzed, skipped: skippedCount, descriptions };
}

function generateWiki(wikiDir, descriptions) {
  let md = '# Function Descriptions\n\n';
  md += '> Auto-generated by loom-memory. Short descriptions of non-trivial functions.\n\n';

  const files = Object.keys(descriptions).sort();
  if (files.length === 0) {
    md += 'No functions require description (all trivial or very short).\n';
  } else {
    for (const file of files) {
      const fns = descriptions[file];
      md += `## \`${file}\`\n\n`;
      md += '| Function | Description |\n';
      md += '|----------|-------------|\n';
      for (const [name, desc] of Object.entries(fns).sort()) {
        md += `| \`${name}\` | ${desc} |\n`;
      }
      md += '\n';
    }
  }

  fs.mkdirSync(wikiDir, { recursive: true });
  fs.writeFileSync(path.join(wikiDir, '06-Function-Descriptions.md'), md, 'utf8');
}
