import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { appendLlmLog, estimateTokens } from './utils/llm-log.js'
import { generate as ollamaGenerate } from './utils/ollama.js'
import { withRetry } from './utils/retry.js'

// Approx chars per token, conservative estimate
const CHARS_PER_TOKEN = 3.5

function detectClient(config = {}) {
    const provider = config.llm?.provider
    const anthropicKey = config.llm?.apiKey || process.env.ANTHROPIC_API_KEY
    const openaiKey = config.llm?.apiKey || process.env.OPENAI_API_KEY

    if (provider === 'ollama') {
        return { type: 'ollama', client: null }
    }
    if (provider === 'anthropic' || (!provider && anthropicKey)) {
        return { type: 'anthropic', client: new Anthropic({ apiKey: anthropicKey }), key: anthropicKey }
    }
    if (provider === 'openai' || (!provider && openaiKey)) {
        return { type: 'openai', client: new OpenAI({ apiKey: openaiKey, baseURL: config.llm?.baseURL }), key: openaiKey }
    }
    throw new Error('No LLM provider available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or llm.provider.')
}

/**
 * Returns the context window limit in tokens for a given provider/model.
 */
function getContextLimit(type, model, config) {
    // Allow explicit override in config
    if (config?.llm?.contextLimit) return config.llm.contextLimit

    if (type === 'ollama') {
        // Ollama default num_ctx is 2048–4096 depending on model.
        // We use 3800 to leave room for the response (num_predict: 8192 is
        // unreachable anyway if the context window is only 4096 total).
        return config?.ollama?.numCtx ?? 3800
    }
    if (type === 'anthropic') return 180_000   // claude-3/4 supports 200k
    if (type === 'openai') {
        if (model?.includes('gpt-4o')) return 100_000
        if (model?.includes('gpt-4-turbo')) return 100_000
        if (model?.includes('gpt-3.5')) return 14_000
        return 100_000
    }
    return 8_000 // safe fallback
}

/**
 * Truncates contextXml so the full prompt stays within the model's
 * context window.  Truncation is reported on stderr so it's visible.
 */
function buildPrompt(prompt, contextXml, type, model, config) {
    const limitTokens = getContextLimit(type, model, config)
    // Reserve ~20 % for the base prompt + response headroom
    const reservedTokens = Math.ceil(limitTokens * 0.20) + 1024
    const maxContextTokens = limitTokens - reservedTokens
    const maxContextChars = Math.floor(maxContextTokens * CHARS_PER_TOKEN)

    let safeContext = contextXml
    if (contextXml && contextXml.length > maxContextChars) {
        safeContext = contextXml.slice(0, maxContextChars)
        const pct = ((maxContextChars / contextXml.length) * 100).toFixed(1)
        console.warn(
            `\x1b[33m⚠ Context truncated: ${contextXml.length.toLocaleString()} → ` +
            `${maxContextChars.toLocaleString()} chars (${pct}% kept, ` +
            `model context limit: ${limitTokens.toLocaleString()} tokens)\x1b[0m`
        )
    }

    return safeContext
        ? `${prompt}\n\n<codebase>\n${safeContext}\n</codebase>`
        : prompt
}

export async function callLLM(prompt, contextXml, options = {}) {
    const started = Date.now()
    const config = options.config ?? {}
    const { type, client } = detectClient(config)

    const model = options.model ?? config.llm?.model ?? (
        type === 'anthropic'
            ? 'claude-sonnet-4-5'
            : type === 'ollama'
                ? config.ollama?.model ?? 'qwen2.5-coder:7b'
                : 'gpt-4o'
    )

    const fullPrompt = buildPrompt(prompt, contextXml, type, model, config)

    try {
        return await withRetry(() => callProvider({
            type,
            client,
            model,
            fullPrompt,
            config,
            options,
            started,
        }), {
            retries: config.llm?.retries ?? 2,
            delayMs: config.llm?.retryDelayMs ?? 500,
        })
    } catch (err) {
        appendLlmLog(options.repoRoot, {
            provider: type,
            model,
            task: options.task,
            zone: options.zone,
            promptTokens: estimateTokens(fullPrompt),
            durationMs: Date.now() - started,
            error: err.message,
        })
        throw err
    }
}

async function callProvider({ type, client, model, fullPrompt, config, options, started }) {
        if (type === 'ollama') {
            const numCtx = config.ollama?.numCtx ?? 4096
            return await ollamaGenerate({
                model,
                prompt: fullPrompt,
                host: config.ollama?.url ?? config.llm?.ollamaUrl ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434',
                repoRoot: options.repoRoot,
                task: options.task,
                zone: options.zone,
                options: {
                    temperature: 0.2,
                    num_ctx: numCtx,
                    // num_predict must fit inside the remaining window after the prompt
                    num_predict: Math.min(2048, numCtx - Math.ceil(fullPrompt.length / CHARS_PER_TOKEN) - 64),
                },
            })
        }

        if (type === 'anthropic') {
            const msg = await client.messages.create({
                model,
                max_tokens: 8192,
                messages: [{ role: 'user', content: fullPrompt }],
            })
            const text = msg.content[0].text
            appendLlmLog(options.repoRoot, {
                provider: type,
                model,
                task: options.task,
                zone: options.zone,
                promptTokens: msg.usage?.input_tokens ?? estimateTokens(fullPrompt),
                completionTokens: msg.usage?.output_tokens ?? estimateTokens(text),
                durationMs: Date.now() - started,
            })
            return text
        }

        if (type === 'openai') {
            const res = await client.chat.completions.create({
                model,
                max_tokens: 8192,
                messages: [{ role: 'user', content: fullPrompt }],
            })
            const text = res.choices[0].message.content
            appendLlmLog(options.repoRoot, {
                provider: type,
                model,
                task: options.task,
                zone: options.zone,
                promptTokens: res.usage?.prompt_tokens ?? estimateTokens(fullPrompt),
                completionTokens: res.usage?.completion_tokens ?? estimateTokens(text),
                durationMs: Date.now() - started,
            })
            return text
        }
}
