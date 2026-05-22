# loom-memory

Persistent repository memory for AI coding agents.

`loom-memory` turns a Git repository into a living knowledge base: architecture notes, code maps, import graphs, agent instructions, and MCP tools that help small and large models understand a codebase without rereading everything on every task.

The goal is simple: give AI agents durable context, reduce token spend, and make every session start from accumulated project knowledge instead of a cold read.

## Why I Built This

AI coding tools are powerful, but most of them are forgetful. They repeatedly scan the same files, miss project-specific conventions, and lose useful lessons between sessions.

I built `loom-memory` to explore a more durable workflow:

- static analysis creates a local SQLite graph of files, imports, and symbols
- generated wiki pages explain architecture, current features, and coding rules
- agent instructions capture project-specific rituals, pitfalls, and decisions
- MCP exposes repository knowledge to compatible AI tools
- post-commit hooks keep the knowledge base moving with the code

This project reflects how I like to work as a programmer: practical automation, local-first tooling, clear developer experience, and systems that help both humans and agents reason with less waste.

## What It Generates

After initialization, a target repository can contain:

```text
_wiki/
  00-Index.md
  01-Architecture-Stack.md
  02-Fonctionnalites-Actuelles.md
  03-Regles-LLM.md
  04-Code-Map.md
  05-Call-Graph.md
  maps/

_graph/
  codebase.db

AGENTS.md
docs/
  decisions.md
  pitfalls.md
```

The SQLite database currently stores:

- indexed files
- detected zones
- language metadata
- exported symbols
- import relationships
- local search chunks for code and wiki memory

The MCP server currently exposes:

- `find_symbol`
- `find_dependencies`
- `find_dependents`
- `hotspots`
- `cross_zone_deps`
- `find_callers`
- `find_callees`
- `find_unused_exports`
- `find_circular_deps`
- `zone_summary`
- `recent_changes`
- `semantic_search`
- `recommend_execution_mode`

Recommended agent workflow:

1. Call MCP `recommend_execution_mode` with the user's task before broad source reading.
2. Inspect the returned `filesToInspect` first.
3. Use `semantic_search`, `find_symbol`, `find_callers`, `find_callees`, and `zone_summary` before opening more files.
4. Match the response to `outputMode` so small tasks use compact patches or recipes instead of full-code output.
5. Escalate to broader codebase reading only when the recommended context is insufficient.

## Current Status

This repository is an alpha prototype with a working standalone CLI surface. The core external-repository flow is now wired, including graph-backed verification and section-level wiki refreshes for changed zones.

What works today:

- repository packing with Repomix
- LLM-generated wiki pages
- TypeScript/JavaScript AST parsing for imports and exported symbols
- Tree-sitter-backed parsers for Python, PHP, and Ruby, with regex fallbacks for parser load failures
- SQLite graph generation
- import-aware function-call extraction for JavaScript and TypeScript
- explicit cross-language contract edges through `@openapi`, `@contract`, and `@loom-import` annotations
- MCP query server for graph lookups
- `.loomignore` support
- managed `AGENTS.md` block updates
- raw Git post-commit hook installation
- optional GitHub Actions workflow generation
- LLM call logging to `_graph/runs.jsonl`
- LLM retry handling for rate limits, transient network failures, and 5xx responses
- cached per-zone LLM outputs for resumable map generation
- paid-provider cost estimation for detailed map dry runs
- prompt metadata for generated wiki freshness checks
- section-level incremental wiki updates for affected zones
- compact graph context queries for zone summaries and recent changed files
- local semantic search over code and wiki chunks with deterministic embeddings
- task advice for context strategy, reasoning level, and compact output mode
- basic doctor, status, and verify commands
- packaged CLI smoke coverage
- fixture-based Node tests, including TypeScript, Python, PHP, and Ruby graph fixtures

What still needs work:

- the npm package should be published and tested from a clean global install
- future roadmap items should now be scoped from real-world use on more repositories

## Installation

For local development:

```bash
npm install
```

Use the local CLI:

```bash
node bin/cli.js --help
node bin/cli.js init ./path/to/repo
node bin/cli.js update ./path/to/repo
node bin/cli.js status ./path/to/repo
node bin/cli.js doctor ./path/to/repo
node bin/cli.js verify ./path/to/repo
node bin/cli.js search ./path/to/repo "invoice line items"
node bin/cli.js benchmark ./path/to/repo
node bin/cli.js advise ./path/to/repo "Add password reset email flow"
```

Check the packaged CLI from a temporary global install:

```bash
npm run smoke:global-install
```

After publishing or linking the package, the command is:

```bash
loom-memory init ./path/to/repo
loom-memory update ./path/to/repo
loom-memory status ./path/to/repo
loom-memory doctor ./path/to/repo
loom-memory verify ./path/to/repo
loom-memory search ./path/to/repo "invoice line items"
loom-memory benchmark ./path/to/repo
loom-memory advise ./path/to/repo "Add password reset email flow"
```

Build the graph for this repository:

```bash
npm run graph
```

Query the graph:

```bash
npm run graph:query -- hotspots
npm run graph:query -- symbol runInit
npm run graph:query -- deps src/commands/init.js
npm run graph:query -- callers callLLM
npm run graph:query -- zoneSummary src
npm run graph:query -- recent --limit=10
npm run graph:query -- search "Ollama retry handling" --limit=5
```

Estimate detailed-map token usage and paid-provider cost without LLM calls or writes:

```bash
npm run detailed:dry-run
```

Measure graph coverage and estimated token reduction:

```bash
loom-memory benchmark ./path/to/repo
loom-memory benchmark ./path/to/repo --json
```

## Intended CLI

The product interface is:

```bash
loom-memory init ./path/to/repo
loom-memory update ./path/to/repo
loom-memory status ./path/to/repo
loom-memory doctor ./path/to/repo
loom-memory verify ./path/to/repo
loom-memory install-hooks ./path/to/repo
```

The legacy `wiki-tool` binary is kept as an alias for compatibility, but `loom-memory` is the primary command.

## Architecture

```text
bin/
  cli.js                 Commander-based packaged CLI
  wiki.mjs               Legacy wrapper, no longer the packaged entrypoint

src/
  commands/              init, update, status, doctor, hook installation
  parser/                TypeScript compiler API parser
  utils/                 gitignore, loomignore, Ollama, managed blocks
  llm.js                 Anthropic/OpenAI wiki generation
  repomix.js             repository packing

scripts/
  build-graph.mjs        builds _graph/codebase.db, including function calls
  graph-mcp.mjs          MCP server over the SQLite graph
  query-graph.mjs        local graph query CLI
  update-code-map.mjs    zone map generation through Ollama
  update-detailed-maps.mjs
```

The project is intentionally stack agnostic. JavaScript and TypeScript get the most accurate parsing today. Python, PHP, and Ruby use Tree-sitter-backed parsing with safe regex fallbacks if a grammar cannot load in a given runtime.

## Roadmap

The next milestones are:

No active roadmap tasks remain. The next useful work should come from testing more real repositories and turning the findings into new scoped roadmap items.

## Design Principles

- Local-first: repository knowledge should live with the repository.
- Stack agnostic: useful across JavaScript, Python, PHP, Ruby, and mixed codebases.
- Small-model friendly: compress repeated context into reusable maps and graph queries.
- Agent friendly: expose facts through MCP instead of forcing agents to guess.
- Human readable: generated memory should be useful in a normal editor, not only through a tool.
- Self improving: decisions and pitfalls should accumulate as the codebase evolves.
