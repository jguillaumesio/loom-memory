import { execFileSync } from 'node:child_process';

export function matchSql(column, value, { fuzzy = false } = {}) {
  return {
    sql: fuzzy ? `${column} LIKE ?` : `${column} = ?`,
    value: fuzzy ? `%${value}%` : value,
  };
}

export function createGraphQueries(db, { cwd = process.cwd() } = {}) {
  return {
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

    zone: (name, options = {}) => {
      const match = matchSql('zone', name, options);
      return db.prepare(`
        SELECT path, symbols
        FROM files
        WHERE ${match.sql}
        ORDER BY path
    `).all(match.value);
    },

    zoneSummary: (name, options = {}) => {
      const match = matchSql('zone', name, options);
      const zoneRows = db.prepare(`
        SELECT zone, COUNT(*) as file_count
        FROM files
        WHERE ${match.sql}
        GROUP BY zone
        ORDER BY file_count DESC
      `).all(match.value);

      return zoneRows.map((zoneRow) => {
        const zone = zoneRow.zone;
        const languages = db.prepare(`
          SELECT lang, COUNT(*) AS file_count
          FROM files
          WHERE zone = ?
          GROUP BY lang
          ORDER BY file_count DESC, lang
        `).all(zone);
        const hotspots = db.prepare(`
          SELECT f.path, COUNT(*) AS import_count
          FROM imports i
          JOIN files f ON f.id = i.importee_id
          WHERE f.zone = ?
          GROUP BY f.id
          ORDER BY import_count DESC, f.path
          LIMIT 10
        `).all(zone);
        const exports = db.prepare(`
          SELECT name, file
          FROM symbols
          WHERE file IN (SELECT path FROM files WHERE zone = ?)
          ORDER BY file, name
          LIMIT 50
        `).all(zone);
        const dependencies = db.prepare(`
          SELECT b.zone AS zone, COUNT(*) AS count
          FROM imports i
          JOIN files a ON a.id = i.importer_id
          JOIN files b ON b.id = i.importee_id
          WHERE a.zone = ? AND b.zone != ?
          GROUP BY b.zone
          ORDER BY count DESC, b.zone
        `).all(zone, zone);
        const dependents = db.prepare(`
          SELECT a.zone AS zone, COUNT(*) AS count
          FROM imports i
          JOIN files a ON a.id = i.importer_id
          JOIN files b ON b.id = i.importee_id
          WHERE b.zone = ? AND a.zone != ?
          GROUP BY a.zone
          ORDER BY count DESC, a.zone
        `).all(zone, zone);

        return {
          zone,
          file_count: zoneRow.file_count,
          languages,
          hotspots,
          exports,
          dependencies,
          dependents,
        };
      });
    },

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

    recentChanges: (_arg, options = {}) => {
      const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
      const changedPaths = recentGitPaths(cwd, limit * 5);
      if (changedPaths.length === 0) return [];

      const rows = [];
      const fileInfo = db.prepare(`
        SELECT path, zone, lang, symbols
        FROM files
        WHERE path = ?
      `);
      const inbound = db.prepare(`
        SELECT COUNT(*) AS count
        FROM imports i
        JOIN files f ON f.id = i.importee_id
        WHERE f.path = ?
      `);
      const outbound = db.prepare(`
        SELECT COUNT(*) AS count
        FROM imports i
        JOIN files f ON f.id = i.importer_id
        WHERE f.path = ?
      `);

      for (const path of changedPaths) {
        const row = fileInfo.get(path);
        if (!row) continue;
        rows.push({
          path: row.path,
          zone: row.zone,
          lang: row.lang,
          symbols: splitSymbols(row.symbols),
          inbound_imports: inbound.get(path).count,
          outbound_imports: outbound.get(path).count,
        });
        if (rows.length >= limit) break;
      }
      return rows;
    },
  };
}

function recentGitPaths(cwd, maxLines) {
  try {
    const output = execFileSync('git', ['log', '--name-only', '--pretty=format:', `-${maxLines}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const seen = new Set();
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      });
  } catch {
    return [];
  }
}

function splitSymbols(symbols) {
  return String(symbols || '')
    .split(',')
    .map((symbol) => symbol.trim())
    .filter(Boolean);
}
