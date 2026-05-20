import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const modelMapSchema = z.object({
  wiki: z.string().optional(),
  agents: z.string().optional(),
  zoneMaps: z.string().optional(),
  detailedMaps: z.string().optional(),
  callGraph: z.string().optional(),
}).partial();

const configSchema = z.object({
  llm: z.object({
    provider: z.enum(['ollama', 'openai', 'anthropic']).default('ollama'),
    model: z.string().min(1).optional(),
    models: modelMapSchema.optional(),
    apiKey: z.string().optional(),
    baseURL: z.string().url().optional(),
    ollamaUrl: z.string().url().optional(),
  }).default({ provider: 'ollama' }),
  ollama: z.object({
    model: z.string().min(1).optional(),
    url: z.string().url().optional(),
  }).optional(),
  zones: z.union([
    z.array(z.union([
      z.string(),
      z.object({
        name: z.string().min(1),
        path: z.string().min(1),
        description: z.string().optional(),
      }),
    ])),
    z.record(z.string(), z.union([
      z.string(),
      z.object({
        path: z.string().min(1),
        description: z.string().optional(),
      }),
    ])),
  ]).optional(),
  output: z.object({
    wiki: z.string().default('_wiki'),
    graph: z.string().default('_graph'),
  }).default({ wiki: '_wiki', graph: '_graph' }),
  ignore: z.array(z.string()).default([]),
}).passthrough();

const DEFAULTS = {
  llm: {
    provider: process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'ollama'),
    model: process.env.LLM_MODEL || 'qwen2.5-coder:7b',
    models: {
      wiki: process.env.LLM_MODEL || 'qwen2.5vl:7b',
      agents: process.env.LLM_MODEL || 'qwen2.5-coder:7b',
      zoneMaps: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
      detailedMaps: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
      callGraph: process.env.LLM_MODEL || 'qwen2.5-coder:7b',
    },
  },
  ollama: {
    model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
    url: process.env.OLLAMA_HOST || 'http://localhost:11434',
  },
  output: {
    wiki: '_wiki',
    graph: '_graph',
  },
  ignore: [],
};

export async function loadConfig(repoRoot) {
  const raw = await readUserConfig(repoRoot);
  const merged = mergeConfig(DEFAULTS, raw);
  const parsed = configSchema.safeParse(merged);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('\n  - ');
    throw new Error(`Invalid loom-memory config:\n  - ${details}`);
  }

  const config = parsed.data;
  config.zones = normalizeZones(config.zones, repoRoot);
  config.output = {
    wiki: config.output?.wiki || '_wiki',
    graph: config.output?.graph || '_graph',
  };
  config.llm.models = {
    ...DEFAULTS.llm.models,
    ...(config.llm.models || {}),
  };
  config.ollama = {
    ...DEFAULTS.ollama,
    ...(config.ollama || {}),
  };
  return config;
}

export async function readUserConfig(repoRoot) {
  const candidates = [
    'loom-memory.config.js',
    'loom-memory.config.mjs',
    'graph-rag.config.js',
    'graph-rag.config.mjs',
  ];

  for (const file of candidates) {
    const abs = path.join(repoRoot, file);
    if (!fs.existsSync(abs)) continue;
    const mod = await import(`${pathToFileURL(abs).href}?t=${Date.now()}`);
    return mod.default || {};
  }

  const jsonCandidates = ['.loom-memory', '.wiki-tool'];
  for (const file of jsonCandidates) {
    const abs = path.join(repoRoot, file);
    if (!fs.existsSync(abs)) continue;
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  }

  return {};
}

export function normalizeZones(zones, repoRoot = process.cwd()) {
  if (!zones) return autoDetectZones(repoRoot);

  if (Array.isArray(zones)) {
    return zones.map((zone) => {
      if (typeof zone === 'string') return { name: zone.replaceAll('/', '-'), path: zone };
      return zone;
    });
  }

  return Object.entries(zones).map(([name, value]) => {
    if (typeof value === 'string') return { name, path: value };
    return { name, path: value.path, description: value.description };
  });
}

export function autoDetectZones(repoRoot) {
  const zones = [];
  for (const base of ['apps', 'packages', 'services', 'libs']) {
    const abs = path.join(repoRoot, base);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) zones.push({ name: `${base}/${entry.name}`, path: `${base}/${entry.name}` });
    }
  }
  if (fs.existsSync(path.join(repoRoot, 'src'))) zones.push({ name: 'src', path: 'src' });
  if (zones.length === 0) zones.push({ name: 'root', path: '.' });
  return zones;
}

function mergeConfig(base, override) {
  const result = { ...base, ...override };
  result.llm = { ...base.llm, ...(override.llm || {}) };
  result.llm.models = { ...base.llm.models, ...(override.llm?.models || {}) };
  result.ollama = { ...base.ollama, ...(override.ollama || {}) };
  result.output = { ...base.output, ...(override.output || {}) };
  return result;
}
