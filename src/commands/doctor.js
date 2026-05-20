import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import chalk from 'chalk';
import { listModels, OllamaError } from '../utils/ollama.js';
import { loadConfig } from '../config.js';

const require = createRequire(import.meta.url);

const PASS = chalk.green('✓');
const FAIL = chalk.red('✗');
const WARN = chalk.yellow('!');

async function check(name, fn) {
  try {
    const result = await fn();
    if (result === true || result === undefined) {
      console.log(`  ${PASS} ${name}`);
      return true;
    }
    if (result && result.warn) {
      console.log(`  ${WARN} ${name} ${chalk.gray('— ' + result.warn)}`);
      return true;
    }
    console.log(`  ${FAIL} ${name} ${chalk.gray('— ' + result)}`);
    return false;
  } catch (err) {
    console.log(`  ${FAIL} ${name} ${chalk.gray('— ' + err.message)}`);
    return false;
  }
}

export async function doctorCommand(repoPath = '.') {
  const repoRoot = path.resolve(repoPath);
  const config = await loadConfig(repoRoot);
  let failures = 0;

  console.log(chalk.bold('\nloom-memory doctor\n'));

  console.log(chalk.bold('System'));
  const runtime = nodeRuntimeInfo();
  console.log(chalk.gray(`      node: ${runtime.path}`));
  console.log(chalk.gray(`      version: ${runtime.version} (abi ${runtime.abi})`));

  if (!await check('Node.js >= 20', () => {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    return major >= 20 ? true : `found ${process.versions.node}`;
  })) failures++;

  if (!await check('git available', () => {
    execSync('git --version', { stdio: 'ignore' });
  })) failures++;

  if (!await check('repomix installed locally or globally', () => {
    const local = path.join(repoRoot, 'node_modules/.bin/repomix');
    if (fs.existsSync(local)) return true;
    execSync('command -v repomix', { stdio: 'ignore', shell: '/bin/sh' });
  })) failures++;

  if (!await check('better-sqlite3 native module loads', () => {
    const result = checkBetterSqliteNative();
    return result.ok ? true : result.message;
  })) failures++;

  console.log(chalk.bold('\nOllama'));
  let ollamaUp = false;
  let models = [];
  if (!await check('Ollama reachable at http://localhost:11434', async () => {
    try {
      models = await listModels(config.ollama?.url ?? config.llm?.ollamaUrl);
      ollamaUp = true;
    } catch (e) {
      if (e instanceof OllamaError) return e.hint ? `${e.message} ${e.hint}` : e.message;
      return e.message;
    }
  })) failures++;

  if (ollamaUp) {
    if (!await check('At least one model pulled', async () => {
      if (models.length === 0) {
        return 'no models found — run `ollama pull qwen2.5-coder:7b`';
      }
      console.log(chalk.gray(`      models: ${models.join(', ')}`));
    })) failures++;

    if (config.llm?.provider === 'ollama') {
      if (!await check('Configured Ollama task models are available', () => {
        const required = configuredOllamaModels(config);
        const missing = required.filter((model) => !hasModel(models, model));
        if (missing.length > 0) {
          return `missing ${missing.join(', ')} — run ${missing.map((m) => `\`ollama pull ${m}\``).join(' and ')}`;
        }
        console.log(chalk.gray(`      configured: ${required.join(', ')}`));
      })) failures++;
    }
  }

  console.log(chalk.bold('\nRepository'));
  if (!await check('Inside a git repository', () => {
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      return 'no .git/ directory in cwd';
    }
  })) failures++;

  await check('_graph/ directory exists', () => {
    if (!fs.existsSync(path.join(repoRoot, '_graph'))) {
      return { warn: `not initialized — run \`loom-memory init ${repoRoot}\`` };
    }
  });

  await check('_wiki/ directory exists', () => {
    if (!fs.existsSync(path.join(repoRoot, '_wiki'))) {
      return { warn: `not initialized — run \`loom-memory init ${repoRoot}\`` };
    }
  });

  await check('.gitignore excludes _graph/*.db', () => {
    const gi = path.join(repoRoot, '.gitignore');
    if (!fs.existsSync(gi)) return { warn: 'no .gitignore found' };
    const content = fs.readFileSync(gi, 'utf8');
    if (!content.includes('_graph/*.db')) {
      return { warn: 'missing — run `loom-memory init` to fix' };
    }
  });

  await check('.loomignore present', () => {
    if (!fs.existsSync(path.join(repoRoot, '.loomignore'))) {
      return { warn: 'optional — using defaults only' };
    }
  });

  console.log();
  if (failures === 0) {
    console.log(chalk.green.bold('All checks passed.\n'));
    process.exit(0);
  } else {
    console.log(chalk.red.bold(`${failures} check(s) failed.\n`));
    process.exit(1);
  }
}

export function nodeRuntimeInfo() {
  return {
    path: process.execPath,
    version: process.version,
    abi: process.versions.modules,
  };
}

export function checkBetterSqliteNative() {
  try {
    require('better-sqlite3');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: `failed under ${process.version} abi ${process.versions.modules}: ${err.message}`,
    };
  }
}

function configuredOllamaModels(config) {
  return Array.from(new Set([
    config.llm?.model,
    config.ollama?.model,
    ...Object.values(config.llm?.models ?? {}),
  ].filter(Boolean)));
}

function hasModel(models, wanted) {
  return models.some((model) => model === wanted || model.split(':')[0] === wanted.split(':')[0]);
}
