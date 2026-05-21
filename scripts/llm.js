// scripts/llm.mjs
// Unified LLM client — supports ollama | openai | anthropic
// Reads from graph-rag.config.js, falls back to env vars

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { generate as ollamaGenerate } from '../src/utils/ollama.js';
import { loadConfig } from '../src/config.js';
import { withRetry } from '../src/utils/retry.js';

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const repoRoot = targetIdx !== -1 ? args[targetIdx + 1] : process.cwd();
const config = await loadConfig(repoRoot);

const provider = config.llm?.provider ?? process.env.LLM_PROVIDER ?? 'ollama';
const model    = config.llm?.model    ?? process.env.LLM_MODEL    ?? 'qwen2.5-coder:7b';
const apiKey   = config.llm?.apiKey
    ?? process.env.LLM_API_KEY
    ?? (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);
const baseURL  = config.llm?.baseURL;

// ── Ollama ────────────────────────────────────────────────────────────────────
async function chatOllama(prompt) {
    const host = config.ollama?.url ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
    const mdl  = config.llm?.models?.detailedMaps ?? config.ollama?.model ?? model;
    const response = await ollamaGenerate({
        model: mdl,
        prompt,
        host,
        repoRoot,
        task: 'detailed-map',
        options: { temperature: 0.2, num_predict: 4096, num_ctx: 16384 },
    });
    return response?.trim() ?? '';
}

// ── OpenAI ────────────────────────────────────────────────────────────────────
async function chatOpenAI(prompt) {
    const url = baseURL ?? 'https://api.openai.com/v1';
    const res = await fetch(`${url}/chat/completions`, {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Anthropic ─────────────────────────────────────────────────────────────────
async function chatAnthropic(prompt) {
    const url = baseURL ?? 'https://api.anthropic.com/v1';
    const res = await fetch(`${url}/messages`, {
        method:  'POST',
        headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.content?.[0]?.text?.trim() ?? '';
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function chat(prompt) {
    return withRetry(() => chatOnce(prompt), {
        retries: config.llm?.retries ?? 2,
        delayMs: config.llm?.retryDelayMs ?? 500,
    });
}

async function chatOnce(prompt) {
    switch (provider) {
        case 'openai':    return chatOpenAI(prompt);
        case 'anthropic': return chatAnthropic(prompt);
        case 'ollama':    return chatOllama(prompt);
        default: throw new Error(`Unknown LLM provider: "${provider}". Use ollama | openai | anthropic`);
    }
}

export { provider, model };
