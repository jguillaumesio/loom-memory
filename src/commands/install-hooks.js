import path from 'node:path';
import fs from 'node:fs';

export function installHooks(absPath, options = {}) {
  ensureGitRepo(absPath);
  const hookPath = path.join(absPath, '.git/hooks/post-commit');
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, buildPostCommitHook(), { mode: 0o755 });
  console.log('  ✓ Installed .git/hooks/post-commit');

  if (options.githubAction || fs.existsSync(path.join(absPath, '.github'))) {
    const workflowPath = path.join(absPath, '.github/workflows/loom-memory.yml');
    fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
    fs.writeFileSync(workflowPath, buildGithubWorkflow(), 'utf8');
    console.log('  ✓ Installed .github/workflows/loom-memory.yml');
  }
}
function ensureGitRepo(absPath) {
  if (!fs.existsSync(path.join(absPath, '.git'))) {
    throw new Error(`${absPath} is not a Git repository. Run git init first.`);
  }
}

function buildPostCommitHook() {
  return `#!/bin/sh
# loom-memory post-commit hook

if [ "$LOOM_MEMORY_RUNNING" = "1" ]; then
  exit 0
fi

export LOOM_MEMORY_RUNNING=1

if command -v loom-memory >/dev/null 2>&1; then
  loom-memory update . --silent
elif command -v npx >/dev/null 2>&1; then
  npx --yes loom-memory update . --silent
else
  echo "loom-memory: command not found; install loom-memory or npm/npx"
  exit 0
fi

git add _wiki/ _graph/ AGENTS.md docs/decisions.md docs/pitfalls.md 2>/dev/null || true

if [ "$LOOM_MEMORY_AUTO_AMEND" = "1" ]; then
  git diff --cached --quiet || git commit --amend --no-edit --no-verify >/dev/null 2>&1 || true
fi
`;
}

function buildGithubWorkflow() {
  return `name: loom-memory

on:
  workflow_dispatch:
  push:
    branches: [main, master]

permissions:
  contents: write

jobs:
  update-memory:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx --yes loom-memory update . --all --silent
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: update loom memory"
          file_pattern: "_wiki AGENTS.md docs/decisions.md docs/pitfalls.md"
`;
}
