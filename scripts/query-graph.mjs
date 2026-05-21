#!/usr/bin/env node
import { createRequire } from 'module';
import { createGraphQueries } from './lib/graph-queries.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DB_PATH = './_graph/codebase.db';
const db = new Database(DB_PATH, { readonly: true });
const queries = createGraphQueries(db);

const commandMap = {
  hotspots: 'hotspots',
  crossZone: 'crossZone',
  orphans: 'orphans',
  zones: 'zones',
  zone: 'zone',
  zoneSummary: 'zoneSummary',
  deps: 'deps',
  dependents: 'dependents',
  symbol: 'symbol',
  callers: 'callers',
  callees: 'callees',
  unused: 'unused',
  cycles: 'cycles',
  recent: 'recentChanges',
};

const [,, command, ...rawArgs] = process.argv;
const flags = new Set(rawArgs.filter((arg) => arg.startsWith('--')));
const args = rawArgs.filter((arg) => !arg.startsWith('--'));
const options = {
  fuzzy: flags.has('--fuzzy'),
  all: flags.has('--all'),
  limit: parseLimit(flags),
};

if (!command || !commandMap[command]) {
  console.log(`
Usage: node query-graph.mjs <command> [arg]

Commands:
  hotspots              Most imported files
  crossZone             Dependencies crossing app boundaries
  orphans               Files nobody imports
  zones                 File count per zone
  zone <name>           Files in a zone
  zoneSummary <name>    Compact dependency/export summary for a zone
  deps <file>           What a file imports
  dependents <file>     What imports a file
  symbol <name>         Find where a symbol is exported
  callers <name>        Find functions that call a symbol
  callees <name>        Find functions called by a symbol
  unused                Exported symbols with zero internal callers
  cycles                Simple file-level circular dependencies
  recent                Recently changed indexed files from git history

Flags:
  --fuzzy               Use partial matching for symbol/call/zone queries
  --all                 Include noisy default/barrel exports in unused
  --limit=<n>           Limit recent results
`);
  process.exit(0);
}

const result = queries[commandMap[command]](args[0], options);
console.log(JSON.stringify(result, null, 2));
db.close();

function parseLimit(flags) {
  for (const flag of flags) {
    if (!flag.startsWith('--limit=')) continue;
    const value = Number.parseInt(flag.slice('--limit='.length), 10);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return undefined;
}
