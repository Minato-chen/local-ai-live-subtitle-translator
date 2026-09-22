# Development Progress

## Stage 0 — Development baseline

- Branch: `codex/paused-dictionary-anki`
- Added a dependency-free Node test harness and pure helper modules for selection, dictionary response parsing, AnkiConnect payloads, loopback URL validation, and HTML escaping.
- Tests: `npm test` — 10/10 passing after extending punctuation trimming for Japanese corner brackets; syntax and manifest checks pass.
- Remaining: implement player state, dictionary UI/service, Anki settings/editor, documentation, and full regression checks.
