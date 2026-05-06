#!/usr/bin/env node
// update-code-map.mjs — runs from wiki-tool, targets external repo

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { generate as ollamaGenerateFromUtil, OllamaError, printOllamaError } from '../src/utils/ollama.js';
import { loadConfig } from '../src/config.js';

// ─── Resolve target repo ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const silent = args.includes('--silent');
const allFlag = args.includes('--all');

// --target /path/to/repo  OR  cwd if not specified
const targetIdx = args.indexOf('--target');
const TARGET_ROOT = targetIdx !== -1
    ? args[targetIdx + 1]
    : process.env.WIKI_TARGET || process.cwd();

const log = (...msg) => { if (!silent) console.log(...msg); };

// ─── Load config from target repo ───────────────────────────────────────────

const config = await loadConfig(TARGET_ROOT);

const ZONES = config.zones;
const WIKI_DIR = join(TARGET_ROOT, config.output?.wiki || '_wiki');
const MAPS_DIR = join(WIKI_DIR, 'maps');
const OLLAMA_MODEL = config.llm?.models?.zoneMaps || config.ollama?.model || 'qwen2.5-coder:7b';
const OLLAMA_URL = config.ollama?.url || config.llm?.ollamaUrl || 'http://localhost:11434';
const IGNORE = config.ignore || ['node_modules', '.next', 'dist', 'build'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getChangedZones() {
    if (allFlag) return ZONES.map(z => z.name);

    try {
        // Files changed in last commit
        const changed = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only --cached', {
            cwd: TARGET_ROOT,
            encoding: 'utf-8'
        }).trim().split('\n').filter(Boolean);

        if (!changed.length) return [];

        // Map changed files to zones
        const affected = new Set();
        for (const file of changed) {
            for (const zone of ZONES) {
                if (zone.path === '.' || file.startsWith(zone.path)) {
                    affected.add(zone.name);
                }
            }
        }

        return [...affected];
    } catch {
        // Fallback: update all zones
        return ZONES.map(z => z.name);
    }
}

function collectFiles(zonePath, maxFiles = 80) {
    const absPath = join(TARGET_ROOT, zonePath);

    if (!existsSync(absPath)) return [];

    try {
        const result = execSync(
            `find "${absPath}" -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs" -o -name "*.py" -o -name "*.php" -o -name "*.rb" \\) ${IGNORE.map(i => `! -path "*/${i}/*"`).join(' ')} | head -${maxFiles}`,
            { encoding: 'utf-8', cwd: TARGET_ROOT }
        ).trim().split('\n').filter(Boolean);

        return result;
    } catch {
        return [];
    }
}

function buildFileSnapshot(files) {
    const MAX_CHARS = 60000; // stay within context
    let snapshot = '';
    let total = 0;

    for (const file of files) {
        try {
            const content = readFileSync(file, 'utf-8');
            const relPath = relative(TARGET_ROOT, file);
            const lines = content.split('\n').slice(0, 80).join('\n'); // first 80 lines only
            const entry = `\n\n### ${relPath}\n\`\`\`\n${lines}\n\`\`\``;

            if (total + entry.length > MAX_CHARS) break;

            snapshot += entry;
            total += entry.length;
        } catch {
            // skip unreadable files
        }
    }

    return snapshot;
}

function hashContent(content) {
    return createHash('md5').update(content).digest('hex').slice(0, 8);
}

// ─── Core: process one zone ─────────────────────────────────────────────────

async function processZone(zone) {
    const mapPath = join(MAPS_DIR, `${zone.name}.md`);
    const files = collectFiles(zone.path);

    if (!files.length) {
        log(`  ⚠️  ${zone.name} — no files found at ${zone.path}`);
        return;
    }

    log(`  📂 ${zone.name} — ${files.length} files`);

    const snapshot = buildFileSnapshot(files);
    const existingMap = existsSync(mapPath) ? readFileSync(mapPath, 'utf-8') : null;

    // Self-improving: feed existing map back as context
    const prompt = existingMap
        ? `You are a senior engineer maintaining a code map for a large monorepo.

EXISTING MAP (may be partially stale):
${existingMap}

ZONE: ${zone.name}
DESCRIPTION: ${zone.description || ''}
PATH: ${zone.path}

CURRENT CODE SNAPSHOT:
${snapshot}

Task: Update the map. 
- Preserve sections that are still accurate
- Fix or remove what is stale
- Add what is new
- Keep it concise and scannable
- Format: markdown with clear sections for Purpose, Entry Points, Key Files, Exports, Patterns, Dependencies

Respond with the complete updated map only. No commentary.`

        : `You are a senior engineer documenting a codebase zone for AI assistants.

ZONE: ${zone.name}
DESCRIPTION: ${zone.description || ''}
PATH: ${zone.path}

CODE SNAPSHOT:
${snapshot}

Create a concise code map with these sections:
- **Purpose** — what this zone does in one paragraph
- **Entry Points** — main files an engineer would start from
- **Key Files** — most important files and what they do (one line each)
- **Exports** — what this zone exposes to other zones
- **Patterns** — coding conventions, architectural patterns used
- **Dependencies** — what external libs and internal zones this depends on

Be concise. This map is read by AI assistants, not humans. Prioritize signal over prose.

Respond with the markdown map only. No commentary.`;

    try {
        const map = await ollamaGenerateFromUtil({
            model: OLLAMA_MODEL,
            prompt,
            host: OLLAMA_URL,
            repoRoot: TARGET_ROOT,
            task: 'zone-map',
            zone: zone.name,
            options: { temperature: 0.2, num_predict: 2048 },
        });
        const header = `<!-- zone:${zone.name} updated:${new Date().toISOString()} hash:${hashContent(snapshot)} -->\n`;
        writeFileSync(mapPath, header + map, 'utf-8');
        log(`  ✅ ${zone.name} — map updated`);
    } catch (err) {
        if (err instanceof OllamaError) {
            printOllamaError(err);
        } else {
            console.error(`  ❌ ${zone.name} — Ollama failed:`, err.message);
        }
    }
}

// ─── Index: master map of all zones ─────────────────────────────────────────

async function updateIndex() {
    const indexPath = join(WIKI_DIR, 'INDEX.md');
    const zoneSummaries = [];

    for (const zone of ZONES) {
        const mapPath = join(MAPS_DIR, `${zone.name}.md`);
        if (!existsSync(mapPath)) continue;

        const content = readFileSync(mapPath, 'utf-8');

        // Extract Purpose section for the index
        const purposeMatch = content.match(/\*\*Purpose\*\*[^\n]*\n([^#*]+)/);
        const purpose = purposeMatch
            ? purposeMatch[1].trim().slice(0, 200)
            : 'No summary available.';

        zoneSummaries.push(`## ${zone.name}\n**Path:** \`${zone.path}\`\n\n${purpose}\n\n[Full map](maps/${zone.name}.md)`);
    }

    const index = `# Codebase Map — INDEX
> Auto-generated by wiki-tool. Do not edit manually.
> Last updated: ${new Date().toISOString()}
> Target: ${TARGET_ROOT}

${zoneSummaries.join('\n\n---\n\n')}
`;

    writeFileSync(indexPath, index, 'utf-8');
    log('\n📋 INDEX.md updated');
}

// ─── Health check: detect stale zones ───────────────────────────────────────

function checkHealth() {
    log('\n🏥 Wiki health check:');
    const now = Date.now();
    const STALE_DAYS = 7;

    for (const zone of ZONES) {
        const mapPath = join(MAPS_DIR, `${zone.name}.md`);

        if (!existsSync(mapPath)) {
            log(`  ⚠️  ${zone.name} — NO MAP EXISTS`);
            continue;
        }

        const content = readFileSync(mapPath, 'utf-8');
        const updatedMatch = content.match(/updated:([^\s]+)/);

        if (!updatedMatch) {
            log(`  ⚠️  ${zone.name} — no timestamp`);
            continue;
        }

        const age = (now - new Date(updatedMatch[1]).getTime()) / (1000 * 60 * 60 * 24);

        if (age > STALE_DAYS) {
            log(`  🔴 ${zone.name} — ${Math.round(age)} days stale`);
        } else {
            log(`  🟢 ${zone.name} — updated ${Math.round(age * 24)}h ago`);
        }
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    log(`\n🗺️  wiki-tool → ${TARGET_ROOT}\n`);

    mkdirSync(MAPS_DIR, { recursive: true });

    const zonesToUpdate = getChangedZones();

    if (!zonesToUpdate.length) {
        log('✨ No zones changed — nothing to update');
        checkHealth();
        return;
    }

    log(`Zones to update: ${zonesToUpdate.join(', ')}\n`);

    for (const zoneName of zonesToUpdate) {
        const zone = ZONES.find(z => z.name === zoneName);
        if (zone) await processZone(zone);
    }

    await updateIndex();
    checkHealth();

    log('\n✅ Done\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
