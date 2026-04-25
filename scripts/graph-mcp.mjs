import Database from 'better-sqlite3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const DB_PATH = './_graph/codebase.db';

// Singleton — one connection for the lifetime of the MCP server
const db = new Database(DB_PATH, { readonly: true });

const server = new McpServer({
    name: 'graph-rag',
    version: '1.0.0',
});

function query(sql, params = []) {
    return db.prepare(sql).all(...params);
}

server.tool(
    'find_symbol',
    'Find where a symbol is defined across the codebase',
    { name: z.string().describe('Symbol name (partial match ok)') },
    async ({ name }) => {
        const rows = query(
            `SELECT name, file FROM symbols WHERE name LIKE ?`,
            [`%${name}%`]
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    }
);

server.tool(
    'find_dependencies',
    'Find all files a given file imports',
    { path: z.string().describe('Relative file path') },
    async ({ path }) => {
        const rows = query(
            `SELECT f.path, f.zone FROM imports i
                                            JOIN files f ON f.id = i.importee_id
                                            JOIN files s ON s.id = i.importer_id
             WHERE s.path = ?`,
            [path]
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    }
);

server.tool(
    'find_dependents',
    'Find all files that import a given file',
    { path: z.string().describe('Relative file path') },
    async ({ path }) => {
        const rows = query(
            `SELECT f.path, f.zone FROM imports i
                                            JOIN files f ON f.id = i.importer_id
                                            JOIN files t ON t.id = i.importee_id
             WHERE t.path = ?`,
            [path]
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    }
);

server.tool(
    'hotspots',
    'Find the most imported files (architectural hotspots)',
    {},
    async () => {
        const rows = query(
            `SELECT f.path, f.zone, COUNT(*) AS import_count
             FROM imports i
                      JOIN files f ON f.id = i.importee_id
             GROUP BY f.id
             ORDER BY import_count DESC
                 LIMIT 20`
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    }
);

server.tool(
    'cross_zone_deps',
    'Find dependencies between zones/apps',
    {},
    async () => {
        const rows = query(
            `SELECT a.zone AS from_zone, b.zone AS to_zone, COUNT(*) AS count
             FROM imports i
                 JOIN files a ON a.id = i.importer_id
                 JOIN files b ON b.id = i.importee_id
             WHERE a.zone != b.zone
             GROUP BY a.zone, b.zone
             ORDER BY count DESC`
        );
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
