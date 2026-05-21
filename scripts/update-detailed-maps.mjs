#!/usr/bin/env node
// update-detailed-maps.mjs
// Same zone + LLM config as update-code-map.mjs — no duplication

import { readFileSync, writeFileSync, mkdirSync,
    readdirSync, statSync, existsSync }  from 'fs';
import { join, extname, relative }           from 'path';
import { chat, provider, model }             from './llm.js';
import { getAllExtensions }                  from './parsers/index.mjs';
import { loadConfig }                        from '../src/config.js';
import { cacheKey, readCachedLlmOutput, writeCachedLlmOutput } from '../src/utils/llm-cache.js';

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const ROOT       = targetIdx !== -1 ? args[targetIdx + 1] : process.cwd();
const silent     = args.includes('--silent');
const log        = (...msg) => { if (!silent) console.log(...msg); };
const config     = await loadConfig(ROOT);
const OUTPUT_DIR = join(ROOT, config.output?.wiki || '_wiki', 'maps/detailed');
const MAX_CHARS  = 80_000;

const ALL_EXTENSIONS = getAllExtensions();

const IGNORE = [
    'node_modules', 'dist', 'build', '.next', 'coverage',
    '__tests__', 'vendor', '__pycache__', '.venv', '_graph', '_wiki',
];

const ZONES = config.zones;

// ── file helpers ──────────────────────────────────────────────────────────────
function collectFiles(dir, files = []) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return files;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (IGNORE.some(i => entry.name === i)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) collectFiles(full, files);
        else if (ALL_EXTENSIONS.includes(extname(entry.name))) files.push(full);
    }
    return files;
}

function buildBundle(files, rootPath) {
    let bundle = '';
    for (const f of files) {
        const rel     = relative(rootPath, f);
        const content = readFileSync(f, 'utf-8');
        bundle += `\n\n### FILE: ${rel}\n\`\`\`\n${content}\n\`\`\``;
        if (bundle.length > MAX_CHARS) {
            bundle += '\n\n[TRUNCATED]';
            break;
        }
    }
    return bundle;
}

function detectLangs(files) {
    const map = {
        '.ts': 'TypeScript', '.tsx': 'TypeScript/React',
        '.js': 'JavaScript', '.jsx': 'JavaScript/React',
        '.php': 'PHP',       '.py': 'Python',
        '.rb': 'Ruby',       '.vue': 'Vue',
    };
    const langs = new Set(files.map(f => map[extname(f)]).filter(Boolean));
    return [...langs].join(', ') || 'mixed';
}

// ── prompt ────────────────────────────────────────────────────────────────────
function buildPrompt(zone, files) {
    const langs    = detectLangs(files);
    const bundle   = buildBundle(files, join(ROOT, zone.path));

    // categories depend on what we can detect from the languages
    const categories = langs.includes('PHP')
        ? ['controllers', 'services', 'models', 'routes', 'middleware']
        : langs.includes('Python')
            ? ['routers', 'services', 'models', 'schemas', 'utils']
            : ['routes', 'components', 'services', 'hooks', 'utils', 'types'];

    return `You are a senior developer analyzing a "${zone.name}" codebase written in ${langs}.

Analyze the source files below and produce a structured Markdown reference.

For each of these categories: ${categories.join(', ')}
— list every relevant item you find with:
  - Name
  - File path
  - One-line description

Format each category as a ## heading with a bullet list.
If a category has nothing, write "None found."
Be concise. No explanations outside the lists.

SOURCE FILES:
${bundle}`;
}

// ── process ───────────────────────────────────────────────────────────────────
async function processZone(zone) {
    log(`\nZone: ${zone.name}`);

    const files = collectFiles(join(ROOT, zone.path));
    log(`   ${files.length} files`);

    if (files.length === 0) {
        log(`   Skipping — no files found`);
        return;
    }

    log(`   Calling ${provider}...`);
    const prompt = buildPrompt(zone, files);
    const key = cacheKey({
        task: 'detailed-map',
        zone: zone.name,
        provider,
        model,
        input: prompt,
    });
    let result = readCachedLlmOutput(ROOT, key);
    if (result) {
        log(`   reused cached LLM output`);
    } else {
        result = await chat(prompt);
        writeCachedLlmOutput(ROOT, key, {
            task: 'detailed-map',
            zone: zone.name,
            provider,
            model,
        }, result);
    }
    const outPath = join(OUTPUT_DIR, `${zone.name.replace('/', '-')}.detailed.md`);

    mkdirSync(join(OUTPUT_DIR, zone.name.split('/')[0]), { recursive: true });
    writeFileSync(
        outPath,
        `# ${zone.name} — Detailed Map\n_Auto-generated ${new Date().toISOString()} — ${provider}/${model}_\n\n${result}`,
    );
    log(`   updated → ${outPath}`);
}

function updateIndex() {
    const walk = (dir, files = []) => {
        if (!existsSync(dir)) return files;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, e.name);
            if (e.isDirectory()) walk(full, files);
            else if (e.name.endsWith('.detailed.md')) files.push(full);
        }
        return files;
    };
    const files = walk(OUTPUT_DIR);
    const lines = files.map(f => `- [${relative(OUTPUT_DIR, f)}](${relative(OUTPUT_DIR, f)})`);
    writeFileSync(
        join(OUTPUT_DIR, 'index.md'),
        `# Detailed Maps Index\n_Updated ${new Date().toISOString()}_\n\n${lines.join('\n')}\n`,
    );
}

async function main() {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    log(`\nDetailed Maps — provider: ${provider} — model: ${model}\n`);

    for (const zone of ZONES) {
        try {
            await processZone(zone);
        } catch (err) {
            console.error(`  ${zone.name}: ${err.message}`);
        }
    }

    updateIndex();
    log('\nDone\n');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
