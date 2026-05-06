import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { appendLlmLog, estimateTokens } from './utils/llm-log.js'
import { generate as ollamaGenerate } from './utils/ollama.js'

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

export async function callLLM(prompt, contextXml, options = {}) {
    const started = Date.now()
    const { type, client } = detectClient(options.config)
    const fullPrompt = `${prompt}\n\n<codebase>\n${contextXml}\n</codebase>`
    const model = options.model || options.config?.llm?.model || (
        type === 'anthropic'
            ? 'claude-sonnet-4-5'
            : type === 'ollama'
                ? options.config?.ollama?.model || 'qwen2.5-coder:7b'
                : 'gpt-4o'
    )

    try {
        if (type === 'ollama') {
            return await ollamaGenerate({
                model,
                prompt: fullPrompt,
                host: options.config?.ollama?.url || options.config?.llm?.ollamaUrl || process.env.OLLAMA_HOST || 'http://localhost:11434',
                repoRoot: options.repoRoot,
                task: options.task,
                zone: options.zone,
                options: { temperature: 0.2, num_predict: 8192 },
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
