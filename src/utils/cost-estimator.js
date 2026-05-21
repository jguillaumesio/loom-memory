import { estimateTokens } from './llm-log.js';

const PRICE_PER_MILLION = {
  openai: [
    { match: /gpt-4o-mini/i, input: 0.15, output: 0.60 },
    { match: /gpt-4o/i, input: 2.50, output: 10.00 },
    { match: /gpt-4\.1-mini/i, input: 0.40, output: 1.60 },
    { match: /gpt-4\.1/i, input: 2.00, output: 8.00 },
  ],
  anthropic: [
    { match: /haiku/i, input: 0.80, output: 4.00 },
    { match: /sonnet/i, input: 3.00, output: 15.00 },
    { match: /opus/i, input: 15.00, output: 75.00 },
  ],
};

const DEFAULT_PRICE = {
  openai: { input: 5.00, output: 15.00 },
  anthropic: { input: 3.00, output: 15.00 },
  ollama: { input: 0, output: 0 },
};

export function estimateLlmUsage(prompt, {
  provider = 'ollama',
  model = '',
  maxOutputTokens = 4096,
} = {}) {
  const inputTokens = estimateTokens(prompt);
  const outputTokens = maxOutputTokens;
  const price = resolvePrice(provider, model);
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: price
      ? Number((((inputTokens * price.input) + (outputTokens * price.output)) / 1_000_000).toFixed(6))
      : null,
  };
}

export function summarizeUsage(estimates) {
  const totals = estimates.reduce((acc, estimate) => {
    acc.inputTokens += estimate.inputTokens;
    acc.outputTokens += estimate.outputTokens;
    if (estimate.estimatedCostUsd !== null) acc.estimatedCostUsd += estimate.estimatedCostUsd;
    else acc.hasUnknownCost = true;
    return acc;
  }, { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, hasUnknownCost: false });

  return {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    estimatedCostUsd: totals.hasUnknownCost ? null : Number(totals.estimatedCostUsd.toFixed(6)),
  };
}

function resolvePrice(provider, model) {
  if (provider === 'ollama') return DEFAULT_PRICE.ollama;
  const table = PRICE_PER_MILLION[provider] ?? [];
  return table.find((entry) => entry.match.test(model)) ?? DEFAULT_PRICE[provider] ?? null;
}
