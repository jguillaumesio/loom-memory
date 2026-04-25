# graph-rag

Drop it on any repo. One command builds a living knowledge base that keeps itself current after every commit.

## What it generates

### Wiki (LLM-generated, injected into target repo)
- `_wiki/00-Index.md` — project overview and architecture summary
- `_wiki/01-Architecture-Stack.md` — tech stack, data flow, infrastructure
- `_wiki/02-Fonctionnalites-Actuelles.md` — existing features inventory
- `_wiki/03-Regles-LLM.md` — coding rules extracted from the codebase
- `_wiki/04-Code-Map.md` — per-zone function and file map (incremental)
- `_wiki/05-Call-Graph.md` — dependency call graph
- `_wiki/maps/<zone>.map.md` — detailed per-zone maps (api, dashboard, admin, packages)

### Graph database (static analysis)
- `_graph/codebase.db` — SQLite graph: files, import edges, exported symbols

### Agent config (injected into target repo root)
- `AGENTS.md` — session start checklist, project structure, hard rules, session end ritual
- `.cursor/mcp.json` — MCP server config so agents can query the graph live
- `mcp.json` — same, for Claude Desktop
- `docs/decisions.md` — scaffolded, append patterns after each task
- `docs/pitfalls.md` — scaffolded, append mistakes and false assumptions

### Self-improvement hook
- `.husky/post-commit` — rebuilds graph + refreshes changed zone maps after every commit

---

## Setup

```bash
npm install -g graph-rag
```

Set your LLM API key (used for wiki and AGENTS.md generation):

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # preferred — Claude handles large contexts better
# or
export OPENAI_API_KEY=sk-...          # fallback — GPT-4o
```

The graph build and zone maps run locally via **Ollama** (`qwen2.5-coder:7b` by default).  
Install Ollama if you want those: https://ollama.com

---

## Usage

```bash
# Full init — run once per repo
graph-rag init ./path/to/repo

# Skip repomix packing if repomix-output.xml already exists
graph-rag init ./path/to/repo --skip-repomix

# Skip installing Husky hooks
graph-rag init ./path/to/repo --no-hooks

# Incremental update — reruns only changed zones
graph-rag update ./path/to/repo

# Install self-improvement hooks on an existing repo
graph-rag install-hooks ./path/to/repo
```

---

## How it works

### `init` — full run

```
1. build-graph.mjs        Static analysis → _graph/codebase.db
                          Files, import edges, exported symbols

2. repomix                Pack entire repo → repomix-output.xml

3. LLM (Claude / GPT-4o)  Wiki files → _wiki/00 to 05
                          AGENTS.md → repo root (template-based, not freeform)

4. Ollama (local)         Per-zone code maps → _wiki/maps/

5. MCP config             .cursor/mcp.json + mcp.json

6. Husky hook             .husky/post-commit → auto self-improvement
```

### `post-commit` — self-improvement loop

Every commit triggers:

```
build-graph.mjs           Rebuild SQLite graph (~2s, pure static)
update-code-map.mjs       Detect changed zones via git diff, regenerate only those
update-detailed-maps.mjs  Same for detailed maps
git add _wiki/ _graph/    Stage updated docs automatically
```

AI sessions always read a fresh knowledge base. Zero manual effort.

---

## MCP tools (available to agents after init)

The `graph-mcp.mjs` server exposes these tools via MCP:

| Tool | Description |
|---|---|
| `find_symbol` | Find where a symbol is defined (partial name ok) |
| `find_dependencies` | All files a given file imports |
| `find_dependents` | All files that import a given file |
| `hotspots` | Most imported files — architectural hotspots |
| `cross_zone_deps` | Dependencies crossing app/package boundaries |

Agents use these instead of guessing file locations.

---

## Requirements

| Tool | Purpose | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | Wiki + AGENTS.md generation | ✅ One of the two |
| Ollama + `qwen2.5-coder:7b` | Zone maps (local) | Optional |
| Git | Incremental updates, Husky hooks | Optional but recommended |
| Node 18+ | Runtime | ✅ |

---

## Output after `graph-rag init`

```
✓ Graph built: 847 files, 3241 import edges  → _graph/codebase.db
✓ Repository packed (124k tokens)            → repomix-output.xml
✓ Generated _wiki/00-Index.md
✓ Generated _wiki/01-Architecture-Stack.md
✓ Generated _wiki/02-Fonctionnalites-Actuelles.md
✓ Generated _wiki/03-Regles-LLM.md
✓ Generated _wiki/04-Code-Map.md
✓ Generated _wiki/05-Call-Graph.md
✓ Generated AGENTS.md                        → repo root
✓ MCP config written                         → .cursor/mcp.json
✓ Husky hooks installed                      → .husky/post-commit
✓ docs/decisions.md scaffolded
✓ docs/pitfalls.md scaffolded

Ready. Every commit keeps the knowledge base current.
```
