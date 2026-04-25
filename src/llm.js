import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

function detectClient() {
    if (process.env.ANTHROPIC_API_KEY) {
        return { type: 'anthropic', client: new Anthropic() }
    }
    if (process.env.OPENAI_API_KEY) {
        return { type: 'openai', client: new OpenAI() }
    }
    throw new Error(
        'No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.'
    )
}

export async function callLLM(prompt, contextXml) {
    const { type, client } = detectClient()
    const fullPrompt = `${prompt}\n\n<codebase>\n${contextXml}\n</codebase>`

    if (type === 'anthropic') {
        const msg = await client.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 8192,
            messages: [{ role: 'user', content: fullPrompt }],
        })
        return msg.content[0].text
    }

    if (type === 'openai') {
        const res = await client.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 8192,
            messages: [{ role: 'user', content: fullPrompt }],
        })
        return res.choices[0].message.content
    }
}
