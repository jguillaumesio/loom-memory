// graph-rag.config.js
export default {
    llm: {
        provider: 'ollama',               // 'ollama' | 'openai' | 'anthropic'
        model:    'qwen2.5-coder:7b',
        apiKey:   process.env.LLM_API_KEY,
        baseURL:  undefined,              // override for proxies / local OpenAI-compat
    },

    ollama: {
        model: 'qwen2.5-coder:7b',
        url:   'http://localhost:11434',
    },

    wiki: {
        mapsDir:   '_wiki/maps',
        indexFile: '_wiki/04-Code-Map.md',
    },

    // zones: omit entirely for auto-detection
    // or set explicitly — both formats accepted:
    zones: {
        api:       'apps/api/src',
        dashboard: 'apps/dashboard/src',
        admin:     'apps/admin/src',
        packages:  'packages',
        // php_app: 'services/php-app/src',
        // python_api: 'services/python-api',
    },
};
