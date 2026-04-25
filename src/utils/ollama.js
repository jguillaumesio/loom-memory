import chalk from 'chalk';

const DEFAULT_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

export class OllamaError extends Error {
  constructor(message, { hint, cause } = {}) {
    super(message);
    this.name = 'OllamaError';
    this.hint = hint;
    this.cause = cause;
  }
}

async function rawFetch(path, init = {}, host = DEFAULT_HOST) {
  let res;
  try {
    res = await fetch(`${host}${path}`, init);
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed/i.test(err.message)) {
      throw new OllamaError(
        `Ollama is not reachable at ${host}.`,
        { hint: 'Start it with `ollama serve` (or set OLLAMA_HOST if running on a different port).', cause: err }
      );
    }
    if (err.cause?.code === 'ENOTFOUND') {
      throw new OllamaError(
        `Cannot resolve Ollama host ${host}.`,
        { hint: 'Check your OLLAMA_HOST environment variable.', cause: err }
      );
    }
    throw new OllamaError(`Ollama request failed: ${err.message}`, { cause: err });
  }
  return res;
}

export async function listModels(host = DEFAULT_HOST) {
  const res = await rawFetch('/api/tags', {}, host);
  if (!res.ok) {
    throw new OllamaError(`Ollama returned HTTP ${res.status} from /api/tags.`);
  }
  const data = await res.json();
  return (data.models || []).map(m => m.name);
}

export async function ensureModel(model, host = DEFAULT_HOST) {
  const models = await listModels(host);
  const found = models.some(m => m === model || m.split(':')[0] === model.split(':')[0]);
  if (!found) {
    throw new OllamaError(
      `Ollama model "${model}" is not pulled.`,
      { hint: `Run \`ollama pull ${model}\` and try again.` }
    );
  }
}

export async function generate({ model, prompt, system, format, options = {}, host = DEFAULT_HOST }) {
  const res = await rawFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, system, format, stream: false, options }),
  }, host);

  if (res.status === 404) {
    throw new OllamaError(
      `Ollama model "${model}" not found on the server.`,
      { hint: `Run \`ollama pull ${model}\`.` }
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OllamaError(
      `Ollama generate failed (HTTP ${res.status}).`,
      { hint: text ? text.slice(0, 200) : 'Check `ollama serve` logs.' }
    );
  }
  const data = await res.json();
  return data.response;
}

export function printOllamaError(err) {
  if (err instanceof OllamaError) {
    console.error(chalk.red('✗ ' + err.message));
    if (err.hint) console.error(chalk.yellow('  → ' + err.hint));
    return;
  }
  console.error(chalk.red('✗ ' + (err.stack || err.message)));
}
