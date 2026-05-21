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

The MCP server currently exposes:

- `find_symbol`
- `find_dependencies`
- `find_dependents`
- `hotspots`
- `cross_zone_deps`

## Current Status

This repository is an alpha prototype with a working standalone CLI surface. The core external-repository flow is now wired, including graph-backed verification and section-level wiki refreshes for changed zones.

What works today:

- repository packing with Repomix
- LLM-generated wiki pages
- TypeScript/JavaScript AST parsing for imports and exported symbols
- regex-based parsers for Python, PHP, and Ruby
- SQLite graph generation
- function-call extraction for JavaScript and TypeScript
- MCP query server for graph lookups
- `.loomignore` support
- managed `AGENTS.md` block updates
- raw Git post-commit hook installation
- optional GitHub Actions workflow generation
- LLM call logging to `_graph/runs.jsonl`
- prompt metadata for generated wiki freshness checks
- section-level incremental wiki updates for affected zones
- basic doctor, status, and verify commands
- packaged CLI smoke coverage
- fixture-based Node tests

What still needs work:

- Python, PHP, and Ruby parsing is still regex-based and should move to Tree-sitter
- call graph resolution is useful but still name-based, so overloaded/common names can need refinement
- the npm package should be published and tested from a clean global install
- MCP config is generated, but more assistant-specific presets could be added

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
```

After publishing or linking the package, the command is:

```bash
loom-memory init ./path/to/repo
loom-memory update ./path/to/repo
loom-memory status ./path/to/repo
loom-memory doctor ./path/to/repo
loom-memory verify ./path/to/repo
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

The project is intentionally stack agnostic. JavaScript and TypeScript get the most accurate parsing today, while Python, PHP, and Ruby have lightweight regex parsers that are useful but not yet production-grade.

## Roadmap

The next milestones are:

1. Improve call graph resolution with import-aware symbol binding.
2. Replace regex parsers for Python, PHP, and Ruby with Tree-sitter parsers.
3. Add more fixture repositories across mixed stacks.
4. Publish and test from a clean global install.
5. Add semantic search with local embeddings and SQLite vector search.

## Design Principles

- Local-first: repository knowledge should live with the repository.
- Stack agnostic: useful across JavaScript, Python, PHP, Ruby, and mixed codebases.
- Small-model friendly: compress repeated context into reusable maps and graph queries.
- Agent friendly: expose facts through MCP instead of forcing agents to guess.
- Human readable: generated memory should be useful in a normal editor, not only through a tool.
- Self improving: decisions and pitfalls should accumulate as the codebase evolves.
