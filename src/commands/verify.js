import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';
import { sectionMarkers } from '../utils/wiki-section.js';

const WIKI_FILES = [
  '00-Index.md',
  '01-Architecture-Stack.md',
  '02-Fonctionnalites-Actuelles.md',
  '03-Regles-LLM.md',
  '04-Code-Map.md',
  '05-Call-Graph.md',
];

const SECTION_WIKI_FILES = [
  '01-Architecture-Stack.md',
  '02-Fonctionnalites-Actuelles.md',
  '03-Regles-LLM.md',
];

export async function verifyCommand(repoPath = '.') {
  const repoRoot = path.resolve(repoPath);
  const result = await verifyRepository(repoRoot);
  printVerifyResult(result);
  process.exit(result.errors.length > 0 ? 1 : 0);
}

export async function verifyRepository(repoRoot) {
  const config = await loadConfig(repoRoot);
  const wikiDir = path.join(repoRoot, config.output.wiki);
  const dbPath = path.join(repoRoot, config.output.graph, 'codebase.db');
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(dbPath)) {
    errors.push(`Missing graph database: ${path.relative(repoRoot, dbPath)}`);
    return { repoRoot, errors, warnings };
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const indexedFiles = new Set(db.prepare('SELECT path FROM files').all().map((row) => row.path));
    const symbols = new Set(db.prepare('SELECT DISTINCT name FROM symbols').all().map((row) => row.name));

    for (const zone of config.zones) {
      const hasFiles = [...indexedFiles].some((file) => file === zone.path || file.startsWith(zone.path.replace(/\/$/, '') + '/'));
      if (!hasFiles) errors.push(`Configured zone has no indexed files: ${zone.name} (${zone.path})`);
    }

    if (!fs.existsSync(wikiDir)) {
      warnings.push(`Missing wiki directory: ${config.output.wiki}`);
      return { repoRoot, errors, warnings };
    }

    const wikiFiles = WIKI_FILES
      .map((file) => path.join(wikiDir, file))
      .filter((file) => fs.existsSync(file));

    for (const filePath of wikiFiles) {
      const relWiki = path.relative(repoRoot, filePath);
      const content = fs.readFileSync(filePath, 'utf8');

      for (const ref of extractPathReferences(content)) {
        if (indexedFiles.has(ref)) continue;
        if (fs.existsSync(path.join(repoRoot, ref))) continue;
        errors.push(`${relWiki} references missing file: ${ref}`);
      }

      for (const symbol of extractSymbolReferences(content)) {
        if (!symbols.has(symbol)) errors.push(`${relWiki} references missing symbol: ${symbol}`);
      }
    }

    for (const zone of config.zones) {
      const sectionId = zoneSectionId(zone.name);
      for (const file of SECTION_WIKI_FILES) {
        const filePath = path.join(wikiDir, file);
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf8');
        const markers = sectionMarkers(sectionId);
        if (!content.includes(markers.start) || !content.includes(markers.end)) {
          warnings.push(`${path.relative(repoRoot, filePath)} is missing generated section markers for ${zone.name}`);
        }
      }
    }
  } finally {
    db.close();
  }

  return { repoRoot, errors: unique(errors), warnings: unique(warnings) };
}

export function extractPathReferences(content) {
  const refs = new Set();
  const candidates = content.match(/(?:^|[\s([`'"])((?:apps|packages|services|libs|src|docs|_wiki)\/[A-Za-z0-9._/@+:-]+(?:\/[A-Za-z0-9._/@+:-]+)*)(?=$|[\s)\]`'",.:;])/gm) || [];
  for (const match of candidates) {
    const cleaned = match.trim().replace(/^[([`'"]+|[)\]`'",.:;]+$/g, '');
    if (path.extname(cleaned)) refs.add(cleaned);
  }
  return [...refs];
}

export function extractSymbolReferences(content) {
  const refs = new Set();
  const regex = /`([A-Za-z_$][\w$]{2,})\(\)`/g;
  let match;
  while ((match = regex.exec(content)) !== null) refs.add(match[1]);
  return [...refs];
}

function zoneSectionId(zoneName) {
  return `zone-${zoneName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root'}`;
}

function unique(items) {
  return [...new Set(items)];
}

function printVerifyResult(result) {
  console.log(chalk.bold('\nloom-memory verify\n'));

  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log(`${chalk.green('✓')} No memory drift detected.\n`);
    return;
  }

  if (result.errors.length > 0) {
    console.log(chalk.bold.red('Errors'));
    for (const error of result.errors) console.log(`  ${chalk.red('✗')} ${error}`);
  }

  if (result.warnings.length > 0) {
    if (result.errors.length > 0) console.log();
    console.log(chalk.bold.yellow('Warnings'));
    for (const warning of result.warnings) console.log(`  ${chalk.yellow('!')} ${warning}`);
  }

  console.log();
}
