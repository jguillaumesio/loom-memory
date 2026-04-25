#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

import { readFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { getParser, getAllExtensions } from './parsers/index.mjs';
import { loadLoomIgnore } from '../src/utils/loomignore.js';
import { parseFile, isTsFile } from '../src/parser/ts-parser.js';

const ROOT = process.cwd();
const DB_PATH = './_graph/codebase.db';

mkdirSync('./_graph', { recursive: true });
const db = new Database(DB_PATH);

db.exec(`
    DROP TABLE IF EXISTS imports;
    DROP TABLE IF EXISTS symbols;
    DROP TABLE IF EXISTS files;

    CREATE TABLE files (
                           id      INTEGER PRIMARY KEY AUTOINCREMENT,
                           path    TEXT UNIQUE NOT NULL,
                           zone    TEXT,
                           lang    TEXT,
                           symbols TEXT
    );

    CREATE TABLE imports (
                             id          INTEGER PRIMARY KEY AUTOINCREMENT,
                             importer_id INTEGER NOT NULL REFERENCES files(id),
                             importee_id INTEGER NOT NULL REFERENCES files(id),
                             UNIQUE(importer_id, importee_id)
    );

    CREATE TABLE symbols (
                             id   INTEGER PRIMARY KEY AUTOINCREMENT,
                             name TEXT NOT NULL,
                             file TEXT NOT NULL REFERENCES files(path)
    );
`);

const insertFile   = db.prepare(`INSERT OR IGNORE INTO files (path, zone, lang, symbols) VALUES (?, ?, ?, ?)`);
const getFileId    = db.prepare(`SELECT id FROM files WHERE path = ?`);
const insertImport = db.prepare(`INSERT OR IGNORE INTO imports (importer_id, importee_id) VALUES (?, ?)`);
const insertSymbol = db.prepare(`INSERT INTO symbols (name, file) VALUES (?, ?)`);

// ── auto-detect zones from filesystem ─────────────────────────────────────
function detectZone(filePath) {
    const rel = relative(ROOT, filePath);
    const parts = rel.split('/');
    if (['apps', 'packages', 'services', 'libs'].includes(parts[0])) {
        return `${parts[0]}/${parts[1]}`;
    }
    if (parts[0] === 'src') return 'src';
    return parts[0];
}

// ── walk files, pick parser by extension ──────────────────────────────────
const ALL_EXTENSIONS = getAllExtensions();

function getAllFiles(dir, ig) {
    const results = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        const rel = relative(ROOT, full);
        if (ig.ignores(rel)) continue;
        if (entry.isDirectory()) results.push(...getAllFiles(full, ig));
        else if (ALL_EXTENSIONS.includes(extname(entry.name))) results.push(full);
    }
    return results;
}

// ── resolve import path to actual file ────────────────────────────────────
const TS_RESOLVE_EXTS = [
    '', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs',
];

function resolveImport(fromFile, importPath, parser) {
    // skip bare node_modules / composer / pip packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/') &&
        !importPath.startsWith('\\')) return null;

    const base = join(dirname(fromFile), importPath);
    const extensions = isTsFile(fromFile)
        ? TS_RESOLVE_EXTS.map(e => base + e)
        : parser.resolveExtensions(base);
    for (const candidate of extensions) {
        try { statSync(candidate); return relative(ROOT, candidate); } catch {}
    }
    return null;
}

// ── build ─────────────────────────────────────────────────────────────────
const ig = loadLoomIgnore(ROOT);
const files = getAllFiles(ROOT, ig);
console.log(`📂 Found ${files.length} files`);

const build = db.transaction((files) => {
    // Pass 1 — insert all files
    for (const file of files) {
        const rel     = relative(ROOT, file);
        const zone    = detectZone(file);

        if (isTsFile(file)) {
            try {
                const parsed = parseFile(file);
                const lang   = extname(file).replace('.', '');
                insertFile.run(rel, zone, lang, parsed.symbols.join(','));
                for (const sym of parsed.symbols) insertSymbol.run(sym, rel);
            } catch (err) {
                console.error(`! parse failed: ${rel} — ${err.message}`);
                insertFile.run(rel, zone, extname(file).replace('.', ''), '');
            }
        } else {
            const parser = getParser(file);
            if (!parser) continue;
            const lang    = parser.extensions[0].replace('.', '');
            const content = readFileSync(file, 'utf8');
            const syms    = parser.extractSymbols(content, file);
            insertFile.run(rel, zone, lang, syms.join(','));
            for (const sym of syms) insertSymbol.run(sym, rel);
        }
    }

    // Pass 2 — insert imports
    for (const file of files) {
        const rel    = relative(ROOT, file);
        const fromId = getFileId.get(rel)?.id;
        if (!fromId) continue;

        let importPaths;

        if (isTsFile(file)) {
            try {
                importPaths = parseFile(file).imports;
            } catch {
                continue;
            }
        } else {
            const parser = getParser(file);
            if (!parser) continue;
            const content = readFileSync(file, 'utf8');
            importPaths = parser.extractImports(content, file);
        }

        for (const imp of importPaths) {
            const resolved = resolveImport(file, imp, getParser(file));
            if (!resolved) continue;
            const toId = getFileId.get(resolved)?.id;
            if (!toId) continue;
            insertImport.run(fromId, toId);
        }
    }
});

build(files);

const fc = db.prepare('SELECT COUNT(*) as c FROM files').get().c;
const ic = db.prepare('SELECT COUNT(*) as c FROM imports').get().c;
const sc = db.prepare('SELECT COUNT(*) as c FROM symbols').get().c;

console.log(`✅ Graph built: ${fc} files, ${ic} import edges, ${sc} symbols`);
db.close();
