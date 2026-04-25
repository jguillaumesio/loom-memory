#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DB_PATH = './_graph/codebase.db';
const db = new Database(DB_PATH, { readonly: true });

const queries = {
  hotspots: () => db.prepare(`
        SELECT f.path, f.zone, COUNT(*) as import_count
        FROM imports i
        JOIN files f ON f.id = i.importee_id
        GROUP BY f.id
        ORDER BY import_count DESC
        LIMIT 20
    `).all(),

  crossZone: () => db.prepare(`
        SELECT a.zone as from_zone, b.zone as to_zone, COUNT(*) as count
        FROM imports i
        JOIN files a ON a.id = i.importer_id
        JOIN files b ON b.id = i.importee_id
        WHERE a.zone != b.zone
        GROUP BY a.zone, b.zone
        ORDER BY count DESC
    `).all(),

  orphans: () => db.prepare(`
        SELECT f.path, f.zone
        FROM files f
        LEFT JOIN imports i ON i.importee_id = f.id
        WHERE i.importee_id IS NULL
        AND f.path NOT LIKE '%index%'
        AND f.path NOT LIKE '%main%'
        AND f.path NOT LIKE '%page%'
        ORDER BY f.zone
    `).all(),

  zones: () => db.prepare(`
        SELECT zone, COUNT(*) as file_count
        FROM files
        GROUP BY zone
        ORDER BY file_count DESC
    `).all(),

  zone: (name) => db.prepare(`
        SELECT path, symbols
        FROM files
        WHERE zone LIKE ?
        ORDER BY path
    `).all(`%${name}%`),

  deps: (filePath) => db.prepare(`
        SELECT b.path as to_path
        FROM imports i
        JOIN files a ON a.id = i.importer_id
        JOIN files b ON b.id = i.importee_id
        WHERE a.path LIKE ?
    `).all(`%${filePath}%`),

  dependents: (filePath) => db.prepare(`
        SELECT a.path as from_path
        FROM imports i
        JOIN files a ON a.id = i.importer_id
        JOIN files b ON b.id = i.importee_id
        WHERE b.path LIKE ?
    `).all(`%${filePath}%`),

  symbol: (name) => db.prepare(`
        SELECT name, file
        FROM symbols
        WHERE name LIKE ?
    `).all(`%${name}%`),
};

const [,, command, ...args] = process.argv;

if (!command || !queries[command]) {
  console.log(`
Usage: node query-graph.mjs <command> [arg]

Commands:
  hotspots              Most imported files
  crossZone             Dependencies crossing app boundaries
  orphans               Files nobody imports
  zones                 File count per zone
  zone <name>           Files in a zone
  deps <file>           What a file imports
  dependents <file>     What imports a file
  symbol <name>         Find where a symbol is exported
`);
  process.exit(0);
}

const result = queries[command](...args);
console.log(JSON.stringify(result, null, 2));
db.close();
