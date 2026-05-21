import Database from 'better-sqlite3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createGraphQueries } from './lib/graph-queries.mjs';

const DB_PATH = './_graph/codebase.db';

const db = new Database(DB_PATH, { readonly: true });
const queries = createGraphQueries(db);

const server = new McpServer({
    name: 'graph-rag',
    version: '1.0.0',
});

function json(rows) {
    return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
}

server.tool(
    'find_symbol',
    'Find where a symbol is defined across the codebase',
    {
        name: z.string().describe('Symbol name'),
        fuzzy: z.boolean().optional().describe('Use partial symbol matching'),
    },
    async ({ name, fuzzy = false }) => json(queries.symbol(name, { fuzzy }))
);

server.tool(
    'find_dependencies',
    'Find all files a given file imports',
    { path: z.string().describe('Relative file path') },
    async ({ path }) => json(queries.deps(path))
);

server.tool(
    'find_dependents',
    'Find all files that import a given file',
    { path: z.string().describe('Relative file path') },
    async ({ path }) => json(queries.dependents(path))
);

server.tool(
    'hotspots',
    'Find the most imported files (architectural hotspots)',
    {},
    async () => json(queries.hotspots())
);

server.tool(
    'cross_zone_deps',
    'Find dependencies between zones/apps',
    {},
    async () => json(queries.crossZone())
);

server.tool(
    'find_callers',
    'Find functions that call a given symbol',
    {
        name: z.string().describe('Callee symbol name'),
        fuzzy: z.boolean().optional().describe('Use partial symbol matching'),
    },
    async ({ name, fuzzy = false }) => json(queries.callers(name, { fuzzy }))
);

server.tool(
    'find_callees',
    'Find functions called by a given symbol',
    {
        name: z.string().describe('Caller symbol name'),
        fuzzy: z.boolean().optional().describe('Use partial symbol matching'),
    },
    async ({ name, fuzzy = false }) => json(queries.callees(name, { fuzzy }))
);

server.tool(
    'find_unused_exports',
    'Find exported symbols with zero internal callers',
    {
        all: z.boolean().optional().describe('Include noisy default and barrel exports'),
    },
    async ({ all = false } = {}) => json(queries.unused(undefined, { all }))
);

server.tool(
    'find_circular_deps',
    'Find simple file-level circular dependencies',
    {},
    async () => json(queries.cycles())
);

server.tool(
    'zone_summary',
    'Return a compact zone summary with languages, hotspots, exports, and cross-zone edges',
    {
        name: z.string().describe('Zone name'),
        fuzzy: z.boolean().optional().describe('Use partial zone matching'),
    },
    async ({ name, fuzzy = false }) => json(queries.zoneSummary(name, { fuzzy }))
);

server.tool(
    'recent_changes',
    'Return recently changed indexed files from git history with graph context',
    {
        limit: z.number().int().positive().max(100).optional().describe('Maximum number of files to return'),
    },
    async ({ limit = 20 } = {}) => json(queries.recentChanges(undefined, { limit }))
);

server.tool(
    'semantic_search',
    'Search local code and wiki chunks for compact task-relevant context',
    {
        query: z.string().describe('Natural-language or keyword query'),
        limit: z.number().int().positive().max(50).optional().describe('Maximum number of chunks to return'),
    },
    async ({ query, limit = 8 }) => json(queries.search(query, { limit }))
);

const transport = new StdioServerTransport();
await server.connect(transport);
