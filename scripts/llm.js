// scripts/llm.mjs
// Unified LLM client — supports ollama | openai | anthropic
// Reads from graph-rag.config.js, falls back to env vars

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { generate as ollamaGenerate, OllamaError } from '../src/utils/ollama.js';

let config = {};
try {
    const mod = await import(`${process.cwd()}/graph-rag.config.js`);
    config = mod.default ?? {};
} catch {
    // no config file — use env vars only
}

const provider = config.llm?.provider ?? process.env.LLM_PROVIDER ?? 'ollama';
const model    = config.llm?.model    ?? process.env.LLM_MODEL    ?? 'qwen2.5-coder:7b';
const apiKey   = config.llm?.apiKey   ?? process.env.LLM_API_KEY;
const baseURL  = config.llm?.baseURL;

// ── Ollama ────────────────────────────────────────────────────────────────────
async function chatOllama(prompt) {
    const host = config.ollama?.url ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
    const mdl  = config.ollama?.model ?? model;
    const response = await ollamaGenerate({
        model: mdl,
        prompt,
        host,
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
    switch (provider) {
        case 'openai':    return chatOpenAI(prompt);
        case 'anthropic': return chatAnthropic(prompt);
        case 'ollama':    return chatOllama(prompt);
        default: throw new Error(`Unknown LLM provider: "${provider}". Use ollama | openai | anthropic`);
    }
}

export { provider, model };
