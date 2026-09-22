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

## Stage 3 — AnkiConnect foundation (implementation)

- Added a loopback-only AnkiConnect v6 client in the service worker with an explicit action allowlist and an 8-second timeout.
- Added settings for connection URL, default deck, note type, field mapping, and tags, plus live connection/metadata refresh.
- Added preservation of custom saved deck/model values until live metadata is available.
- Added `createDeck` support for explicit user-created decks; no deck is created from merely opening a video.
- Tests: `npm test` — 16/16 passing; syntax and manifest checks pass.
- Added AnkiConnect installation, `requestPermission`, CORS recovery, loopback-only exposure, deck strategy, and privacy documentation in Chinese and English.
- Stage 3 is complete; live connection testing remains unavailable unless Anki Desktop and AnkiConnect are running on the host and is covered by the Stage 5 manual matrix.
- Host probe: `127.0.0.1:8765` refused the connection, confirming AnkiConnect is not currently running; no user installation or configuration was changed.

## Stage 4 — Editable Anki note workflow

- The dictionary card exposes one Anki button; no Anki metadata request is made until the user opens the editor.
- Added an editable modal for term, meaning, original video sentence, generated example/translation, source, tags, and target deck.
- Existing decks are loaded on demand; new decks require an explicit name and confirmation action. The last choice is remembered only for the current page session.
- Submission is locked against double-clicks and is revalidated in the service worker against live deck, model, and field metadata before duplicate checking and `addNote`.
- All Anki field values are HTML-escaped before transport; URL and model text are never injected as HTML. No note content is stored in browser storage.
- Tests: `npm test` — 17/17 passing; syntax and manifest checks pass.
- Live add/duplicate behavior still requires a running AnkiConnect instance for Stage 5 manual verification.
