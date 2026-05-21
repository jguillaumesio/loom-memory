import path from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from '../config.js';
import { createGraphQueries } from '../../scripts/lib/graph-queries.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

export async function searchCommand(repoPath = '.', query, options = {}) {
  const repoRoot = path.resolve(repoPath);
  const config = await loadConfig(repoRoot);
  const graphDir = config.output?.graph || '_graph';
  const dbPath = path.join(repoRoot, graphDir, 'codebase.db');
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = createGraphQueries(db, { cwd: repoRoot }).search(query, {
      limit: Number.parseInt(options.limit ?? '8', 10),
    });
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    db.close();
  }
}
