# loom-memory — ROADMAP

> This file is the canonical source of truth for what needs to be done.
> Each task has enough context to be executed without prior knowledge of the conversation.

---

## Legend
- 🔴 Blocking — must be done before v1 release
- 🟡 Important — v1 quality target
- 🔵 Future — v2 and beyond
- ✅ Done

---

## V1 TASKS

---

### [V1-01] CI/CD Strategy — Language-Agnostic Hook System
**Status:** 🔴 TODO  
**Priority:** Must-have — Husky requires `package.json`, so loom-memory post-commit hooks silently fail on Python, Rust, Go, PHP, and any non-JS repo.

**Decision:** Do NOT use Husky. Ship a language-agnostic strategy:

1. **Git hook directly** — On `install-hooks`, write a raw `.git/hooks/post-commit` shell script into the target repo. Works for any language, no dependency on npm, Husky, or package.json.

```bash
#!/bin/sh
# loom-memory post-commit hook
npx loom-memory update . --silent
git add _wiki/ _graph/ 2>/dev/null
git commit --amend --no-edit --no-verify 2>/dev/null || true
```

2. **GitHub Action template** — `init` injects `.github/workflows/loom-memory.yml` into the target repo. This calls the published loom-memory composite action (`action.yml` at root of loom-memory repo). Works in any language repo. Uses OpenAI/Anthropic API key stored in repo secrets (Ollama not available in hosted runners).

3. **Detection logic** in `install-hooks.js`:
   - Always write `.git/hooks/post-commit` (shell, universal)
   - If target repo has `.github/` or user passes `--github-action`, also inject the workflow file
   - If target repo has `package.json`, also install Husky as bonus layer

**Files to create/modify:**
- `src/commands/install-hooks.js` — rewrite hook installation
- `templates/post-commit.sh` — raw shell hook template
- `templates/loom-memory-ci.yml` — GitHub Action workflow to inject
- `action.yml` — composite GitHub Action at repo root (makes loom-memory itself a reusable action)

---

### [V1-02] Explicit Ollama-Only Mode with Clear Error
**Status:** 🔴 TODO  
**Priority:** Must-have — currently unclear what happens when Ollama is not running.

**Decision:** For v1, loom-memory zone maps (`update-code-map.mjs`, `update-detailed-maps.mjs`) run on Ollama only. If Ollama is not reachable, throw a clear human-readable error and exit 1. No silent fallback.

**Implementation:**
- On startup of any Ollama-dependent script, probe `GET http://localhost:11434/api/tags`
- If unreachable: print exact setup instructions and exit
- Error message should include: install URL, start command, model pull command

```
❌  Ollama is not running or not reachable at http://localhost:11434
    To fix:
      1. Install Ollama: https://ollama.com
      2. Start it:       ollama serve
      3. Pull model:     ollama pull qwen2.5-coder:7b
    Or set a custom URL: OLLAMA_BASE_URL=http://your-host:11434
```

**Files to modify:**
- `scripts/llm.js` — add `probeOllama()` called before first LLM call
- `scripts/update-code-map.mjs` — call probe at startup
- `scripts/update-detailed-maps.mjs` — call probe at startup

---

### [V1-04] Incremental Wiki Updates (sections 00–05)
**Status:** 🟡 TODO  
**Priority:** Core promise of the tool — "living wiki" — currently only call graph appends incrementally, the main wiki files (00–04) go stale after init.

**Goal:** `loom-memory update` should detect which wiki sections are affected by changed files and regenerate only those sections, not the entire wiki.

**Implementation plan:**
- In `update.js`, after detecting changed files via `git diff HEAD~1 HEAD`:
  - Map changed files to their zone(s)
  - Re-run only the prompts for affected wiki sections:
    - Any change → refresh `00-Index.md` summary block for affected zone
    - Changed files with new functions/symbols → refresh `04-Code-Map.md` entries
    - Changed imports → refresh `01-Architecture-Stack.md` dependency section
    - New files → refresh `02-Fonctionnalites.md`
  - Append timestamped diff summary to `05-Call-Graph.md` (already partially done)
- Use `<!-- LOOM:SECTION:START:zone-api -->` / `<!-- LOOM:SECTION:END:zone-api -->` HTML comment markers inside wiki files so the updater can surgically replace blocks

**Files to modify:**
- `src/commands/update.js` — add section-level wiki refresh logic
- `src/wiki-parser.js` — add `replaceSection(file, sectionId, newContent)` utility
- `prompts/wiki.md` — add section-only prompt variants (smaller, cheaper, faster)

---

### [V1-06] AST-Based Parsers (Replace Regex)
**Status:** 🔴 TODO  
**Priority:** High — regex parsers miss dynamic imports, re-exports, TS path aliases, barrel files, decorators, `__all__`, causing incorrect or incomplete graphs.

**Decision:** Use proper AST parsers per language.

| Language | Parser | Package |
|---|---|---|
| JS/TS/TSX/JSX | Babel | `@babel/parser` + `@babel/traverse` |
| Python | tree-sitter | `tree-sitter` + `tree-sitter-python` |
| PHP | tree-sitter | `tree-sitter` + `tree-sitter-php` |
| Ruby | tree-sitter | `tree-sitter` + `tree-sitter-ruby` |

**What each parser must extract (unchanged interface, better extraction):**
- All imports (including dynamic `import()`, `require()`, `export * from`, TS path aliases resolved via `tsconfig.paths`)
- All exported symbols (functions, classes, interfaces, types, constants)
- All defined symbols (even non-exported, for internal call graph)

**Files to modify:**
- `scripts/parsers/javascript.mjs` — replace regex with `@babel/parser`
- `scripts/parsers/python.mjs` — replace regex with `tree-sitter-python`
- `scripts/parsers/php.mjs` — replace regex with `tree-sitter-php`
- `scripts/parsers/ruby.mjs` — replace regex with `tree-sitter-ruby`
- `package.json` — add parser dependencies

---

### [V1-07] Function-Level Call Graph in SQLite
**Status:** 🟡 TODO  
**Priority:** High — currently `05-Call-Graph.md` is LLM-generated text. The graph DB has no function→function call data. MCP cannot answer "who calls `processPayment()`?".

**Goal:** Add a `calls` table to `_graph/codebase.db` populated by static analysis during `build-graph.mjs`.

**Schema:**
```sql
CREATE TABLE calls (
  id INTEGER PRIMARY KEY,
  caller_file TEXT,
  caller_symbol TEXT,
  callee_file TEXT,       -- NULL if external/unresolved
  callee_symbol TEXT,
  line INTEGER
);
```

**Implementation:**
- During AST traversal (see V1-06), track function bodies and record calls to other known symbols
- Cross-reference against `symbols` table to resolve callee file
- Unresolved calls (stdlib, npm packages) stored with `callee_file = NULL`

**New MCP tools to expose (once table exists):**
- `find_callers(symbol)` — who calls this function
- `find_callees(symbol)` — what this function calls
- `find_circular_deps()` — cycles in call graph
- `find_unused_exports()` — exported symbols with zero callers

**Files to modify:**
- `scripts/build-graph.mjs` — add `calls` table + population logic
- `scripts/graph-mcp.mjs` — add 4 new tools
- `scripts/query-graph.mjs` — expose via CLI

---

### [V1-11] LLM Call Logging
**Status:** 🟡 TODO  
**Priority:** Important — currently LLM calls fail silently, no record of what was sent, tokens used, cost, or errors. Impossible to debug or audit.

**Goal:** Every LLM call (Ollama, OpenAI, Anthropic) writes a JSONL entry to `_graph/runs.log`.

**Log entry format:**
```json
{
  "timestamp": "2025-01-15T10:23:00Z",
  "provider": "anthropic",
  "model": "claude-opus-4-5",
  "task": "wiki-generation",
  "zone": "api",
  "prompt_tokens": 45000,
  "completion_tokens": 3200,
  "duration_ms": 12400,
  "cost_usd": 0.42,
  "error": null
}
```

**Files to modify:**
- `scripts/llm.js` — wrap all LLM calls to append log entry after each call
- `src/llm.js` — same
- `.gitignore` template — add `_graph/runs.log` (don't commit logs)

---

### [V1-13] Config Validation with Zod
**Status:** 🟡 TODO  
**Priority:** Important — `graph-rag.config.js` is freeform. A typo like `provider: "openai "` (trailing space) silently falls back to wrong behavior with no error.

**Goal:** Validate config on load, fail fast with human-readable error.

**Schema to enforce:**
```js
{
  llm: {
    provider: enum("ollama", "openai", "anthropic"),
    model: string,
    ollamaUrl: string.url optional,
  },
  zones: array(string) optional,   // if absent, auto-detect
  output: {
    wiki: string optional,         // default: "_wiki"
    graph: string optional,        // default: "_graph"
  },
  ignore: array(string) optional,  // patterns for .loomignore equivalent
}
```

**Files to create/modify:**
- `src/config.js` — add `loadConfig(targetPath)` with Zod validation
- All commands — replace direct config reads with `loadConfig()`
- `package.json` — add `zod` dependency

---

### [V1-15] Prompt Versioning
**Status:** 🟡 TODO  
**Priority:** Medium — when `prompts/wiki.md` changes, previously generated wiki files silently become inconsistent (generated with different instructions). No way to know which files need regeneration.

**Goal:** Store a hash of the prompt used to generate each file in its frontmatter. On `update`, detect mismatches and flag files for regeneration.

**Implementation:**
- Each generated wiki file gets YAML frontmatter:
```yaml
---
loom_prompt_hash: "a3f9bc12"
loom_generated_at: "2025-01-15T10:00:00Z"
loom_version: "1.2.0"
---
```
- `update.js` computes current prompt hash, compares against stored hash
- Mismatch → re-generate that file
- `loom-memory status` shows which files have stale prompt versions

**Files to modify:**
- `src/wiki-parser.js` — add frontmatter injection + hash comparison utilities
- `src/commands/update.js` — add prompt hash check
- `prompts/*.md` — no changes needed (hashed at runtime)

---

### [V1-17] Ollama Model Configuration
**Status:** 🟡 TODO  
**Priority:** Medium — `qwen2.5-coder:7b` is hardcoded in scripts. Users with more RAM want `14b` or `32b`. Users with less want `3b`.

**Goal:** Model is fully configurable per task in `graph-rag.config.js`.

```js
llm: {
  provider: "ollama",
  models: {
    zoneMaps: "qwen2.5-coder:7b",       // fast, lightweight
    detailedMaps: "qwen2.5-coder:14b",  // more context needed
    callGraph: "qwen2.5-coder:7b",
  }
}
```

**Files to modify:**
- `src/config.js` — add model-per-task config with defaults
- `scripts/update-code-map.mjs` — read model from config
- `scripts/update-detailed-maps.mjs` — read model from config

---

### [V1-18] Git History Safety — What to Commit
**Status:** 🔴 TODO  
**Priority:** Must-have — `_graph/codebase.db` is a binary SQLite file that changes on every commit. Committing it creates binary churn in git history and bloats the repo permanently.

**Decision:**
- `_graph/*.db` → add to `.gitignore` (binary, regenerated locally in ~2s)
- `_graph/runs.log` → add to `.gitignore` (local telemetry)
- `_wiki/**` → COMMIT (human-readable markdown, the whole point of the tool)
- `_graph/schema.sql` → COMMIT (schema definition, not the data)

**Implementation:**
- `init` command: after generating files, auto-append to target repo's `.gitignore`
- Print what was added so user knows

```
✅  Added to .gitignore:
    _graph/*.db
    _graph/runs.log
```

**Files to modify:**
- `src/commands/init.js` — add `.gitignore` management step
- `src/commands/install-hooks.js` — verify `.gitignore` entries exist before installing hooks

---

### [V1-19] AGENTS.md Merge Strategy
**Status:** 🟡 TODO  
**Priority:** Important — currently `init` overwrites `AGENTS.md` entirely. Any user customizations (custom rules, project-specific notes) are destroyed on re-init.

**Goal:** Preserve user-written sections while updating loom-generated sections.

**Implementation:** Use HTML comment markers to delimit generated vs user content:

```markdown
<!-- LOOM:GENERATED:START -->
...this block is overwritten on re-init...
<!-- LOOM:GENERATED:END -->

## My Custom Rules
...this block is preserved...
```

- On re-init: replace only content between `LOOM:GENERATED` markers
- If markers absent (first run): write entire file with markers
- User content outside markers is never touched

**Files to modify:**
- `src/commands/init.js` — add marker-aware AGENTS.md write logic
- `prompts/agents.md` — wrap generated content in marker comments

---

### [V1-20] .loomignore Support
**Status:** 🟡 TODO  
**Priority:** Important — currently `build-graph.mjs` and `repomix` index everything including `dist/`, `.next/`, `__pycache__/`, generated files, vendor directories. This wastes tokens, pollutes the graph, and slows everything down.

**Goal:** Respect a `.loomignore` file in the target repo root (same syntax as `.gitignore`).

**Default ignores (even without `.loomignore`):**
```
node_modules/
dist/
build/
.next/
__pycache__/
*.pyc
vendor/
.git/
coverage/
```

**Implementation:**
- Parse `.loomignore` using `ignore` npm package (same lib used by many tools)
- Apply in `build-graph.mjs` file walker
- Pass as `--ignore` flags to `repomix` call in `src/repomix.js`

**Files to create/modify:**
- `src/ignore.js` — load and expose ignore rules
- `scripts/build-graph.mjs` — apply ignore filter in file walker
- `src/repomix.js` — pass ignore patterns to repomix
- `templates/.loomignore` — default template injected on init if file doesn't exist

---

## V2 TASKS (Future)

---

### [V2-05] Wiki vs Code Drift Detection — `loom-memory verify`
**Status:** 🔵 Future  
**What:** A command that compares wiki claims against the actual graph. Flags:
- Functions mentioned in wiki that no longer exist in codebase
- Files listed in architecture that have been deleted
- Zones described in wiki that no longer match actual zone structure  
**Why deferred:** Requires V1-07 (call graph in SQLite) and V1-06 (AST parsers) to be accurate enough to trust.

---

### [V2-08] Semantic Search / Embeddings
**Status:** 🔵 Future  
**What:** Embed function bodies and wiki sections. Enable "find code that handles authentication" queries via cosine similarity. Use `sqlite-vec` to keep everything in one SQLite file.  
**Why deferred:** Requires reliable call graph (V1-07) first. Adds significant complexity and storage.

---

### [V2-09] Cost Estimator + Dry Run
**Status:** 🔵 Future  
**What:** Before calling any paid LLM API, compute approximate token count of the prompt and display estimated cost. `--dry-run` flag shows cost without executing.  
**Why deferred:** Less critical once incremental updates (V1-04) reduce per-run token usage.

---

### [V2-10] Test Suite
**Status:** 🔵 Future  
**What:** Vitest test suite with fixture repos (one per language: JS, Python, PHP, Ruby). Each fixture has known imports/exports/calls. Tests assert graph output matches expected.  
**Why deferred:** Fixture repos need to be designed around final AST parser output (V1-06).

---

### [V2-12] MCP Tool Expansion
**Status:** 🔵 Future  
**What:** Add `find_callers`, `find_callees`, `find_unused_exports`, `find_circular_deps`, `zone_summary`, `recent_changes` MCP tools.  
**Why deferred:** Requires V1-07 (call graph table).

---

### [V2-14] Multi-Language Monorepo Support
**Status:** 🔵 Future  
**What:** A monorepo where `apps/api` is Node.js and `apps/ml` is Python. Each zone should use its own parser. Cross-language imports (e.g., REST call from Node to Python service) detected via convention or OpenAPI spec.  
**Why deferred:** Requires stable single-language parsers (V1-06) first.

---

### [V2-16] LLM Retry / Rate Limit Handling
**Status:** 🔵 Future  
**What:** Exponential backoff on 429/500 errors. Resumable runs: cache completed zone outputs so a failed run can resume from last successful zone rather than restarting.  
**Why deferred:** Tolerable for v1 single-user use. Critical before distributing widely.

---

## Implementation Order for V1

| Priority | Task | Blocks |
|---|---|---|
| 1 | V1-20 `.loomignore` | Everything (reduces noise before analysis) |
| 2 | V1-18 Git safety | Must do before first real user commit |
| 3 | V1-02 Ollama explicit error | Stops silent failures |
| 4 | V1-13 Config validation | Stops silent misconfiguration |
| 5 | V1-01 CI/CD hooks | Language-agnostic deployment |
| 6 | V1-06 AST parsers | Required for accurate V1-07 |
| 7 | V1-07 Call graph SQLite | Core feature |
| 8 | V1-11 LLM logging | Observability |
| 9 | V1-19 AGENTS.md merge | User trust |
| 10 | V1-17 Ollama model config | Usability |
| 11 | V1-15 Prompt versioning | Wiki integrity |
| 12 | V1-04 Incremental wiki | Core promise |
