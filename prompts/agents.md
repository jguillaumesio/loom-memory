You are documenting a codebase for future AI agents.

Read the codebase and fill in ONLY the bracketed sections below.
Return the COMPLETE file exactly as shown, replacing [BRACKETED] parts.
Do not change the structure, emojis, or section headers.

---

# Agent Instructions

## 🚀 Session Start (mandatory, every task)

1. Call loom-memory MCP `recommend_execution_mode` with the user's task before broad code reading.
2. Follow its `filesToInspect`, `contextStrategy`, `recommendedReasoning`, and `outputMode`.
3. Use loom-memory MCP tools (`semantic_search`, `find_symbol`, `find_callers`, `find_callees`, `zone_summary`) before opening additional source files.
4. Read `_wiki/04-Code-Map.md` — global project structure, only if the recommended context is insufficient.
5. Read `_wiki/00-Index.md` and `_wiki/03-Regles-LLM.md` for architecture and coding rules when the task touches multiple zones.
6. Read `docs/decisions.md` and `docs/pitfalls.md` if they exist before changing established patterns.

Only start planning after the routing step and the targeted memory/code reads it recommends.

---

## 🗂️ Project Structure

[List the top-level folders and their purpose, one line each, based on what you see in the codebase. Format as a bullet list: `- \`folder/\` — what it contains`]

Key entry points:
[List 2-4 actual entry point files you found, e.g. main files, index files, app roots]

---

## 🧠 During the Task

- Never assume where a component, hook, or util lives — use loom-memory graph/search first
- Match your response format to the advised `outputMode`: `compact_patch`, `recipe`, `codegen`, or broader explanation only when necessary
- Escalate from memory to broader source reading only when the recommended files are insufficient
- Never import across apps directly — check `_wiki/03-Regles-LLM.md` for sharing patterns
- Match existing patterns — if unsure, read 2-3 similar files first
- Do not introduce new libraries — use what is already in the stack
- [Add 2-3 specific rules you observed in THIS codebase: naming conventions, state management patterns, file organization rules]

---

## 🚫 Hard Rules

- Never remove existing functionality unless explicitly asked
- Never skip the Session Start steps
- Never assume — verify with loom-memory MCP and targeted source reads
- [Add 1-2 hard rules specific to this codebase based on what you observe]

---

## ✅ Session End (mandatory, every task)

After completing any significant task, update these files:

### `docs/decisions.md`
Append:
```markdown
## YYYY-MM-DD — <task name>
- What pattern was used and why
- Where key logic lives
- Anything non-obvious discovered
```

### `docs/pitfalls.md`
Append any false assumption you made or trap you encountered:
```markdown
## YYYY-MM-DD — <what went wrong>
- What was assumed
- What was actually true
```

---

## 🧩 Stack

[List the actual tech stack you found: framework, language, key libraries, DB, etc. One line each.]

---

## 📋 Key Patterns Observed

[List 4-6 concrete patterns you see in the code: how state is managed, how API calls are made, how components are structured, how errors are handled. Be specific, reference actual file names or patterns you saw.]
