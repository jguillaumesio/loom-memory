# loom-memory — ROADMAP

> Canonical source of truth for what needs to be done.
> Each task has enough context to be executed without prior knowledge of the conversation.

## Legend
- 🔴 Blocking — must be done before v1 release
- 🟡 Important — v1 quality target
- 🔵 Future — v2 and beyond
- ✅ Done

---

## V1 STATUS

| # | Task | Status |
|---|---|---|
| V1-20 | `.loomignore` support | ✅ Done (task #1) |
| V1-18 | Git safety / auto-gitignore | ✅ Done (task #2) |
| V1-02 | Explicit Ollama errors | ✅ Done (task #5) |
| V1-19 | AGENTS.md merge markers | ✅ Done (task #6) |
| V1-06 | AST parser (TS/JS) | ✅ Done (task #7) |
| V1-01 | CI/CD hooks (language-agnostic) | ✅ Done |
| V1-13 | Config validation (Zod) | ✅ Done |
| V1-07 | Function-level call graph in SQLite | ✅ Done (JS/TS first pass) |
| V1-11 | LLM call logging | ✅ Done |
| V1-17 | Ollama model config per task | ✅ Done |
| V1-15 | Prompt versioning | ✅ Done |
| V1-04 | Incremental wiki updates | ✅ Done (section-level zone refresh) |
| V1-21 | Package smoke coverage | ✅ Done |
| V1-22 | Import-aware call graph resolution | ✅ Done |
| V1-23 | Clean global install smoke script | ✅ Done |
| V2-06 | AST Parsers for Python / PHP / Ruby | ✅ Done |
| V2-12 | MCP Tool Expansion | ✅ Done |
| V2-16 | LLM Retry / Rate Limit Handling | ✅ Done |

---

## V1 TASKS (Remaining)

---

### [V1-01] CI/CD Strategy — Language-Agnostic Hook System
**Status:** ✅ Done
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

2. **GitHub Action template** — `init` injects `.github/workflows/loom-memory.yml` into the target repo. Calls the published loom-memory composite action (`action.yml` at repo root). Works in any language repo. Uses OpenAI/Anthropic API key stored in repo secrets (Ollama not available in hosted runners).

3. **Detection logic** in `install-hooks.js`:
    - Always write `.git/hooks/post-commit` (shell, universal)
    - If target repo has `.github/` or user passes `--github-action`, also inject the workflow file
    - If target repo has `package.json`, also install Husky as bonus layer

**Files to create/modify:**
- `src/commands/install-hooks.js` — rewrite hook installation
- `templates/post-commit.sh` — raw shell hook template
- `templates/loom-memory-ci.yml` — GitHub Action workflow to inject
- `action.yml` — composite GitHub Action at repo root

---

### [V1-13] Config Validation with Zod
**Status:** ✅ Done
**Priority:** Important — `graph-rag.config.js` is freeform. A typo like `provider: "openai "` (trailing space) silently falls back to wrong behavior with no error.

**Schema to enforce:**
```js
{
  llm: {
    provider: enum("ollama", "openai", "anthropic"),
    model: string,
    ollamaUrl: string.url optional,
  },
  zones: array(string) optional,
  output: {
    wiki: string optional,   // default: "_wiki"
    graph: string optional,  // default: "_graph"
  },
  ignore: array(string) optional,
}
```

**Files to create/modify:**
- `src/config.js` — add `loadConfig(targetPath)` with Zod validation
- All commands — replace direct config reads with `loadConfig()`
- `package.json` — add `zod` dependency

---

### [V1-07] Function-Level Call Graph in SQLite
**Status:** ✅ Done (JS/TS first pass)
**Priority:** High — currently `05-Call-Graph.md` is LLM-generated text. The graph DB has no function→function call data. MCP cannot answer "who calls `processPayment()`?".

**Schema addition:**
```sql
CREATE TABLE calls (
  id INTEGER PRIMARY KEY,
  caller_file TEXT,
  caller_symbol TEXT,
  callee_file TEXT,    -- NULL if external/unresolved
  callee_symbol TEXT,
  line INTEGER
);
```

**Implementation:**
- During AST traversal in `src/parser/ts-parser.js`, track function bodies and record calls to other known symbols
- Cross-reference against `symbols` table to resolve callee file
- Unresolved calls (stdlib, npm packages) stored with `callee_file = NULL`

**New MCP tools to expose once table exists:**
- `find_callers(symbol)` — who calls this function
- `find_callees(symbol)` — what this function calls
- `find_circular_deps()` — cycles in the call graph
- `find_unused_exports()` — exported symbols with zero callers

**Files to modify:**
- `src/parser/ts-parser.js` — add call site extraction to `visit()`
- `scripts/build-graph.mjs` — add `calls` table + population logic
- `scripts/graph-mcp.mjs` — add 4 new tools
- `scripts/query-graph.mjs` — expose via CLI

---

### [V1-11] LLM Call Logging
**Status:** ✅ Done
**Priority:** Important — LLM calls fail silently, no record of tokens used, cost, or errors.

**Log entry format** (`_graph/runs.jsonl`):
```json
{
  "timestamp": "2025-01-15T10:23:00Z",
  "provider": "ollama",
  "model": "qwen2.5-coder:7b",
  "task": "wiki-generation",
  "zone": "api",
  "prompt_tokens": 4500,
  "completion_tokens": 320,
  "duration_ms": 1240,
  "error": null
}
```

**Files to modify:**
- `src/utils/ollama.js` — wrap `generate()` to append log entry after each call
- `scripts/llm.js` — same for non-Ollama providers
- `.gitignore` template — add `_graph/runs.jsonl`

---

### [V1-17] Ollama Model Configuration Per Task
**Status:** ✅ Done
**Priority:** Medium — `qwen2.5-coder:7b` is hardcoded. Users with more RAM want `14b`. Users with less want `3b`.

**Config shape:**
```js
llm: {
  provider: "ollama",
  models: {
    zoneMaps: "qwen2.5-coder:7b",
    detailedMaps: "qwen2.5-coder:14b",
    callGraph: "qwen2.5-coder:7b",
  }
}
```

**Files to modify:**
- `src/config.js` — add model-per-task config with defaults (depends on V1-13)
- `scripts/update-code-map.mjs` — read model from config
- `scripts/update-detailed-maps.mjs` — read model from config

---

### [V1-15] Prompt Versioning
**Status:** ✅ Done
**Priority:** Medium — when `prompts/wiki.md` changes, previously generated wiki files silently become inconsistent.

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
- `src/utils/wiki-frontmatter.js` — new: frontmatter inject + hash compare utilities
- `src/commands/update.js` — add prompt hash check
- `src/commands/status.js` — surface stale prompt versions

---

### [V1-04] Incremental Wiki Updates
**Status:** ✅ Done (section-level zone refresh)
**Priority:** Core promise — "living wiki" — currently `_wiki/00–04.md` go stale after init. Only the call graph appends incrementally.

**Current implementation:** `loom-memory update` rebuilds the graph, refreshes local maps, logs LLM calls, appends changed-file call graph notes, and refreshes generated zone sections inside `_wiki/01–03.md` using managed section markers. Prompt hashes let `status` detect stale generated pages.

**Goal:** `loom-memory update` detects which wiki sections are affected by changed files and regenerates only those sections.

**Implementation:**
- In `update.js`, after detecting changed files via `git diff HEAD~1 HEAD`:
    - Map changed files to their zone(s)
    - Re-run only prompts for affected wiki sections
    - Use `<!-- LOOM:SECTION:START:zone-api -->` / `<!-- LOOM:SECTION:END:zone-api -->` markers inside wiki files for surgical replacement
- Reuse `src/utils/managed-block.js` pattern from V1-19

**Files to modify:**
- `src/commands/update.js` — add section-level wiki refresh logic
- `src/utils/wiki-section.js` — new: `replaceSection(file, sectionId, newContent)`
- `prompts/wiki-section.md` — section-only prompt for incremental zone refreshes

---

### [V1-21] Package Smoke Coverage
**Status:** ✅ Done
**Priority:** Important — confirms the packaged CLI includes runtime files and excludes local/dev artifacts before publishing.

**Implementation:**
- `package.json` uses an explicit `files` allowlist for CLI runtime assets
- `scripts/prepare.mjs` skips Husky gracefully when `.git/config` is not writable
- `test/package-smoke.test.js` runs `npm pack --dry-run --json` with an isolated npm cache and asserts package contents

---

## NEXT TODO

### [NEXT-01] Memory Verification / Drift Detection
**Status:** ✅ Done (initial graph-backed implementation)
**Priority:** High — now that incremental wiki sections can be surgically updated, the next self-improvement gap is preventing persistent memory from becoming stale or false.

`loom-memory verify` now compares generated memory against the graph and filesystem:
- flags wiki references to deleted files
- flags mentioned `symbol()` references that no longer exist in SQLite
- flags configured zones with no matching indexed files
- reports stale or missing generated section markers as warnings
- exits non-zero only for strong drift signals

Remaining future expansion: LLM-based claim verification for architecture/domain statements that cannot be checked with conservative path and symbol scanning.

---

### [V1-22] Import-Aware Call Graph Resolution
**Status:** ✅ Done
**Priority:** High — improves precision of V1-07 by resolving calls through local import bindings before falling back to global symbol names.

**Implementation:**
- `src/parser/ts-parser.js` records named, aliased, default, and namespace import bindings
- `scripts/build-graph.mjs` resolves TS/JS calls through those bindings and only falls back to global symbol lookup for unique names
- duplicate exported names no longer resolve to an arbitrary first match when the caller imported a specific module

---

### [V1-23] Clean Global Install Smoke Script
**Status:** ✅ Done
**Priority:** Important — confirms standalone CLI execution from a packed tarball in a temporary global prefix.

**Implementation:**
- `npm run smoke:global-install` packs the project, installs the tarball into a temporary prefix, runs `loom-memory --help`, and cleans up
- the script uses an isolated npm cache, disables install scripts, and has a bounded timeout to avoid silent hangs

---

## V1 Implementation Order (Remaining)

| Priority | Task | Why this order |
|---|---|---|
| 1 | Semantic search / embeddings | Adds task-aware low-token retrieval |

---

## V2 TASKS (Future)

### [V2-05] Wiki vs Code Drift Detection — `loom-memory verify`
Requires V1-07 and V1-06 to be accurate enough to trust. Flags functions mentioned in wiki that no longer exist, deleted files referenced in architecture docs, zones described that no longer match actual structure.

### [V2-06] AST Parsers for Python / PHP / Ruby
**Status:** ✅ Done — Python, PHP, and Ruby use Tree-sitter with regex fallback.

| Language | Parser |
|---|---|
| Python | `tree-sitter` + `tree-sitter-python` ✅ |
| PHP | `tree-sitter` + `tree-sitter-php` ✅ |
| Ruby | `tree-sitter` + `tree-sitter-ruby` ✅ |

PHP uses the grammar package's `php` language export, which is compatible with the pinned Node Tree-sitter runtime.

### [V2-08] Semantic Search / Embeddings
Embed function bodies and wiki sections. Enable natural language queries via cosine similarity. Use `sqlite-vec` to keep everything in one SQLite file. Requires reliable call graph (V1-07) first.

### [V2-09] Cost Estimator + Dry Run
Before calling any paid LLM API, compute approximate token count and display estimated cost. `--dry-run` flag shows cost without executing. Less critical once V1-04 (incremental updates) reduces per-run token usage.

### [V2-10] Test Suite
Vitest suite with fixture repos (one per language). Each fixture has known imports/exports/calls. Tests assert graph output matches expected. Design around final AST parser output.

### [V2-12] MCP Tool Expansion
**Status:** ✅ Done

`find_callers`, `find_callees`, `find_unused_exports`, `find_circular_deps`, `zone_summary`, and `recent_changes` are available through the MCP server. The local graph query CLI shares the same implementation and exposes `zoneSummary` and `recent` for manual inspection.

### [V2-14] Multi-Language Monorepo Support
Zone-level parser selection. Cross-language import detection via convention or OpenAPI spec. Requires stable single-language parsers first.

### [V2-16] LLM Retry / Rate Limit Handling
**Status:** ✅ Done

Exponential backoff on 429/500 and transient network errors now wraps the main LLM clients. Config supports `llm.retries`, `llm.retryDelayMs`, `LLM_RETRIES`, and `LLM_RETRY_DELAY_MS`.

Zone and detailed map generation cache completed LLM outputs under `_graph/llm-cache/`, keyed by task, zone, provider, model, and prompt input. Interrupted runs can reuse completed zone outputs instead of paying the LLM cost again.
