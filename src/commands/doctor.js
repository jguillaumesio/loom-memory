import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

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

export async function doctorCommand() {
  const repoRoot = process.cwd();
  let failures = 0;

  console.log(chalk.bold('\nloom-memory doctor\n'));

  console.log(chalk.bold('System'));
  if (!await check('Node.js >= 20', () => {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    return major >= 20 ? true : `found ${process.versions.node}`;
  })) failures++;

  if (!await check('git available', () => {
    execSync('git --version', { stdio: 'ignore' });
  })) failures++;

  if (!await check('repomix installed', () => {
    execSync('npx --no-install repomix --version', { stdio: 'ignore' });
  })) failures++;

  console.log(chalk.bold('\nOllama'));
  let ollamaUp = false;
  if (!await check('Ollama reachable at http://localhost:11434', async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (!res.ok) return `HTTP ${res.status}`;
      ollamaUp = true;
    } catch (e) {
      return 'connection refused — is `ollama serve` running?';
    }
  })) failures++;

  if (ollamaUp) {
    if (!await check('At least one model pulled', async () => {
      const res = await fetch('http://localhost:11434/api/tags');
      const data = await res.json();
      if (!data.models || data.models.length === 0) {
        return 'no models found — run `ollama pull qwen2.5-coder:7b`';
      }
      console.log(chalk.gray(`      models: ${data.models.map(m => m.name).join(', ')}`));
    })) failures++;
  }

  console.log(chalk.bold('\nRepository'));
  if (!await check('Inside a git repository', () => {
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      return 'no .git/ directory in cwd';
    }
  })) failures++;

  await check('_graph/ directory exists', () => {
    if (!fs.existsSync(path.join(repoRoot, '_graph'))) {
      return { warn: 'not initialized — run `loom-memory init`' };
    }
  });

  await check('_wiki/ directory exists', () => {
    if (!fs.existsSync(path.join(repoRoot, '_wiki'))) {
      return { warn: 'not initialized — run `loom-memory init`' };
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
