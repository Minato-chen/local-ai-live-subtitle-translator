# Development Progress

## Stage 0 — Development baseline

- Branch: `codex/paused-dictionary-anki`
- Added a dependency-free Node test harness and pure helper modules for selection, dictionary response parsing, AnkiConnect payloads, loopback URL validation, and HTML escaping.
- Tests: `npm test` — 10/10 passing after extending punctuation trimming for Japanese corner brackets; syntax and manifest checks pass.
- Remaining: implement player state, dictionary UI/service, Anki settings/editor, documentation, and full regression checks.

## Stage 1 — Paused interaction boundary

- Added resilient primary-video discovery and rebinding for player DOM replacement.
- Added play/pause/end/empty and document-visibility state handling.
- The extension-owned original subtitle is selectable only while paused; playback clears selection and closes all interactive UI.
- Selection normalization covers CJK brackets, punctuation, whitespace, apostrophes, hyphens, reverse selections, and an 80-character safety limit.
- Tests: `npm test` — 10/10 passing; all extension scripts pass syntax checks and the manifest parses.
- Manual browser matrix remains part of Stage 5 because it requires live Netflix/YouTube playback.

## Stage 2 — Local-AI dictionary

- Added a separate cancellable `LOOKUP_WORD` protocol with bounded input, dedicated prompt, independent LRU-style memory cache, and response versioning.
- Added tolerant but schema-bounded JSON parsing for code fences, model chatter, missing optional fields, and invalid output.
- Added a viewport-bounded dictionary panel with loading/error/success states, contextual meaning, the original video sentence, and a distinct AI-generated example plus translation.
- All untrusted model text is rendered with `textContent`; resuming playback, Escape, a newer lookup, or subtitle removal closes/cancels the interaction.
- Added a persisted lookup toggle and bilingual UI copy.
- Tests: `npm test` — 13/13 passing; syntax and manifest checks pass.
