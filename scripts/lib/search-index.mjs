import fs from 'node:fs';
import path from 'node:path';
import { embedText, cosineSimilarity, tokenize } from '../../src/utils/local-embeddings.js';

const CHUNK_LINES = 80;
const CHUNK_OVERLAP = 10;

export function rebuildSearchIndex(db, repoRoot, codeFiles, { wikiDir = '_wiki' } = {}) {
  db.exec(`
    DROP TABLE IF EXISTS semantic_chunks;
    CREATE TABLE semantic_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      zone TEXT,
      symbol TEXT,
      start_line INTEGER,
      end_line INTEGER,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO semantic_chunks (path, kind, zone, symbol, start_line, end_line, text, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getFile = db.prepare(`SELECT zone, symbols FROM files WHERE path = ?`);
  const chunks = [
    ...codeChunks(repoRoot, codeFiles, getFile),
    ...wikiChunks(repoRoot, wikiDir),
  ];

  const write = db.transaction((rows) => {
    for (const chunk of rows) {
      insert.run(
        chunk.path,
        chunk.kind,
        chunk.zone ?? null,
        chunk.symbol ?? null,
        chunk.startLine ?? null,
        chunk.endLine ?? null,
        chunk.text,
        JSON.stringify(embedText(chunk.text))
      );
    }
  });
  write(chunks);
  return chunks.length;
}

export function searchSemanticChunks(db, query, { limit = 8 } = {}) {
  const queryVector = embedText(query);
  const queryTokens = tokenize(query);
  const normalizedQuery = normalizeText(query);
  const rows = db.prepare(`
    SELECT path, kind, zone, symbol, start_line, end_line, text, embedding
    FROM semantic_chunks
  `).all();

  return rows
    .map((row) => {
      const embedding = JSON.parse(row.embedding);
      const vectorScore = cosineSimilarity(queryVector, embedding);
      const score = vectorScore + lexicalBoost(row, normalizedQuery, queryTokens);
      return {
        path: row.path,
        kind: row.kind,
        zone: row.zone,
        symbol: row.symbol,
        start_line: row.start_line,
        end_line: row.end_line,
        score: Number(score.toFixed(4)),
        preview: preview(row.text),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function codeChunks(repoRoot, files, getFile) {
  const chunks = [];
  for (const absPath of files) {
    const rel = path.relative(repoRoot, absPath);
    const metadata = getFile.get(rel);
    if (!metadata) continue;
    const content = fs.readFileSync(absPath, 'utf8');
    const symbols = splitSymbols(metadata.symbols);
    chunks.push(...lineChunks({
      path: rel,
      kind: 'code',
      zone: metadata.zone,
      symbol: symbols.slice(0, 5).join(', ') || null,
      content,
    }));
  }
  return chunks;
}

function wikiChunks(repoRoot, wikiDir) {
  const root = path.join(repoRoot, wikiDir);
  if (!fs.existsSync(root)) return [];
  const chunks = [];
  for (const file of walkMarkdown(root)) {
    const rel = path.relative(repoRoot, file);
    chunks.push(...lineChunks({
      path: rel,
      kind: 'wiki',
      zone: null,
      symbol: null,
      content: fs.readFileSync(file, 'utf8'),
    }));
  }
  return chunks;
}

function lineChunks({ path, kind, zone, symbol, content }) {
  const lines = content.split(/\r?\n/);
  const chunks = [];
  for (let start = 0; start < lines.length; start += CHUNK_LINES - CHUNK_OVERLAP) {
    const slice = lines.slice(start, start + CHUNK_LINES);
    const text = slice.join('\n').trim();
    if (!text) continue;
    chunks.push({
      path,
      kind,
      zone,
      symbol,
      startLine: start + 1,
      endLine: start + slice.length,
      text,
    });
    if (start + CHUNK_LINES >= lines.length) break;
  }
  return chunks;
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

function splitSymbols(symbols) {
  return String(symbols || '')
    .split(',')
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}

function lexicalBoost(row, normalizedQuery, queryTokens) {
  const text = normalizeText(row.text);
  const symbol = normalizeText(row.symbol);
  const filePath = normalizeText(row.path);
  let boost = 0;

  if (normalizedQuery && symbol.split(/\s*,\s*/).includes(normalizedQuery)) boost += 3;
  if (normalizedQuery && text.includes(normalizedQuery)) boost += 2;
  if (normalizedQuery && filePath.includes(normalizedQuery)) boost += 0.75;
  if (queryTokens.length > 0 && queryTokens.every((token) => text.includes(token))) boost += 0.5;
  if (queryTokens.length > 0 && queryTokens.every((token) => symbol.includes(token))) boost += 1;

  return boost;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

function preview(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}
