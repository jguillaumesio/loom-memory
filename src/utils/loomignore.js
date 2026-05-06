import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';

const DEFAULT_PATTERNS = [
  'node_modules',
  'vendor',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '__pycache__',
  '*.pyc',
  '.venv',
  'venv',
  '_graph',
  '_wiki',
  '.git',
  '.husky',
  '.idea',
  '.DS_Store',
  '.env',
  '.env.*',
  '*.min.js',
  '*.bundle.js',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
];

export function loadLoomIgnore(repoRoot) {
  const ig = ignore().add(DEFAULT_PATTERNS);
  const file = path.join(repoRoot, '.loomignore');
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    ig.add(content);
  }
  return ig;
}

export function filterPaths(repoRoot, absPaths) {
  const ig = loadLoomIgnore(repoRoot);
  return absPaths.filter((p) => {
    const rel = path.relative(repoRoot, p);
    if (!rel || rel.startsWith('..')) return false;
    return !ig.ignores(rel);
  });
}
