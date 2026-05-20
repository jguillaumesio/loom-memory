#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DB_PATH = './_graph/codebase.db';
const db = new Database(DB_PATH, { readonly: true });

function matchSql(column, value, { fuzzy = false } = {}) {
  return {
    sql: fuzzy ? `${column} LIKE ?` : `${column} = ?`,
    value: fuzzy ? `%${value}%` : value,
  };
}

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

  symbol: (name, options = {}) => {
    const match = matchSql('name', name, options);
    return db.prepare(`
        SELECT name, file
        FROM symbols
        WHERE ${match.sql}
    `).all(match.value);
  },

  callers: (name, options = {}) => {
    const match = matchSql('callee_symbol', name, options);
    return db.prepare(`
        SELECT caller_file, caller_symbol, callee_file, callee_symbol, line
        FROM calls
        WHERE ${match.sql}
        ORDER BY caller_file, line
    `).all(match.value);
  },

  callees: (name, options = {}) => {
    const match = matchSql('caller_symbol', name, options);
    return db.prepare(`
        SELECT caller_file, caller_symbol, callee_file, callee_symbol, line
        FROM calls
        WHERE ${match.sql}
        ORDER BY caller_file, line
    `).all(match.value);
  },

  unused: (_arg, options = {}) => db.prepare(`
        SELECT s.name, s.file
        FROM symbols s
        LEFT JOIN calls c ON c.callee_file = s.file AND c.callee_symbol = s.name
        WHERE c.id IS NULL
        ${options.all ? '' : `
        AND s.name != 'default'
        AND s.file NOT LIKE '%/index.%'
        AND s.file NOT LIKE 'index.%'
        `}
        ORDER BY s.file, s.name
    `).all(),

  cycles: () => db.prepare(`
        SELECT a.path AS file_a, b.path AS file_b
        FROM imports ab
        JOIN imports ba ON ba.importer_id = ab.importee_id AND ba.importee_id = ab.importer_id
        JOIN files a ON a.id = ab.importer_id
        JOIN files b ON b.id = ab.importee_id
        WHERE a.path < b.path
        ORDER BY a.path, b.path
    `).all(),
};

const [,, command, ...rawArgs] = process.argv;
const flags = new Set(rawArgs.filter((arg) => arg.startsWith('--')));
const args = rawArgs.filter((arg) => !arg.startsWith('--'));
const options = {
  fuzzy: flags.has('--fuzzy'),
  all: flags.has('--all'),
};

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
  callers <name>        Find functions that call a symbol
  callees <name>        Find functions called by a symbol
  unused                Exported symbols with zero internal callers
  cycles                Simple file-level circular dependencies

Flags:
  --fuzzy               Use partial matching for symbol/call queries
  --all                 Include noisy default/barrel exports in unused
`);
  process.exit(0);
}

const result = queries[command](args[0], options);
console.log(JSON.stringify(result, null, 2));
db.close();
