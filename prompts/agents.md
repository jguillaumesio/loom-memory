You are documenting a codebase for future AI agents.

Read the codebase and fill in ONLY the bracketed sections below.
Return the COMPLETE file exactly as shown, replacing [BRACKETED] parts.
Do not change the structure, emojis, or section headers.

---

# Agent Instructions

## 🚀 Session Start (mandatory, every task)

1. Read `_wiki/04-Code-Map.md` — global project structure
2. Read `_wiki/00-Index.md` — project overview and architecture
3. Read `_wiki/03-Regles-LLM.md` — coding rules for this codebase
4. Read `docs/decisions.md` if it exists — past decisions and patterns
5. Read `docs/pitfalls.md` if it exists — known mistakes and false assumptions
6. Use Serena (`find_symbol`, `find_references`) before assuming any file location

Only start planning after these steps.

---

## 🗂️ Project Structure

[List the top-level folders and their purpose, one line each, based on what you see in the codebase. Format as a bullet list: `- \`folder/\` — what it contains`]

Key entry points:
[List 2-4 actual entry point files you found, e.g. main files, index files, app roots]

---

## 🧠 During the Task

- Never assume where a component, hook, or util lives — use Serena to find it
- Never import across apps directly — check `_wiki/03-Regles-LLM.md` for sharing patterns
- Match existing patterns — if unsure, read 2-3 similar files first
- Do not introduce new libraries — use what is already in the stack
- [Add 2-3 specific rules you observed in THIS codebase: naming conventions, state management patterns, file organization rules]

---

## 🚫 Hard Rules

- Never remove existing functionality unless explicitly asked
- Never skip the Session Start steps
- Never assume — verify with Serena
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
