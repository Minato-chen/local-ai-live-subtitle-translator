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

## Stage 5 — Final verification and release preparation

- Automated suite: 17/17 passing on Node's built-in test runner.
- Static checks: all extension JavaScript parses, `manifest.json` and locale JSON parse, and `git diff --check` is clean.
- Browser smoke check: Microsoft Edge 153 accepted the unpacked extension in a fresh isolated headless profile and rendered a page without extension manifest/service-worker parse errors. macOS headless display/crashpad warnings were environmental and did not identify extension code failures.
- Version prepared as `2.1.0`; Chinese extension description and both READMEs now cover paused lookup, dual examples, Anki setup, deck strategy, permissions, privacy, and troubleshooting.
- Blocked manual matrix: authenticated Netflix playback, interactive YouTube layout/fullscreen selection, and Chrome-vs-Edge manual input require a user-visible browser session and media access.
- Blocked Anki matrix: no process is listening on local AnkiConnect port 8765. Installing/configuring Anki or writing test notes without the user's environment would exceed the authorized safety boundary.
- No remote push was performed and no user browser/Anki configuration was modified.
- Final lifecycle audit fixed two interaction leaks: playback now clears only selections owned by the extension (never arbitrary page selections), and a changed subtitle closes/cancels the prior lookup/editor as specified.

## Post-release fix — Structured dictionary output

- Root cause: the dictionary prompt requested JSON in prose but did not activate llama.cpp's schema-constrained sampler, so translation-focused models such as Hy-MT2 could return ordinary text and trigger “词典返回格式无效”.
- Added `response_format: { type: "json_object", schema: ... }` with a closed, required dictionary schema. This makes llama.cpp constrain generation to valid JSON instead of relying only on model instruction-following.
- Added a narrowly scoped fallback for older compatible servers that explicitly reject the structured-output parameter; malformed model output is not retried silently.
- Regression suite: 18/18 tests passing.

## Post-release fix — Dictionary viewport positioning

- Replaced the fixed estimated offset with measured positioning after every dictionary render.
- The panel now chooses the side with enough space (normally above bottom subtitles), clamps horizontally and vertically to an 8 px viewport margin, and uses internal scrolling when neither side can fit the full content.
- Window resizing recomputes the position; overscroll is contained inside the panel.
- Regression suite: 20/20 tests passing, including bottom-subtitle and small-viewport cases.

## Post-release fix — Discoverable Anki action

- The dictionary card now always shows an Anki action. Before configuration it reads “设置 Anki” and opens the extension settings; after enabling Anki it reads “添加到 Anki” and opens the note editor.
- Strengthened the dictionary prompt so the generated example stays in the source language and its translation stays in the target language; identical duplicate lines are hidden defensively.
- Regression suite remains 20/20 passing.

## Post-release fix — True bilingual example pairs

- Dictionary entries now carry four explicit values: video sentence, video translation, generated source-language example, and generated example translation.
- The already displayed subtitle translation is reused; if it is not ready, the background translates the video sentence once.
- Hy-MT2 sometimes puts the target-language sentence in the source example field. The background now swaps obviously reversed fields or performs a bounded reverse-translation repair so the generated source example contains the selected term.
- The dictionary UI labels each translation separately, and Anki settings/editor now include a dedicated video-translation field.

## Post-release fix — Hy-MT2 language contamination

- Confirmed the failure is a model-capability/prompt-shape interaction: Hy-MT2 is optimized for translation, and a multi-field reverse-generation prompt produced mixed Chinese, English, and Arabic.
- Source language is now inferred from the video sentence when settings use auto-detect.
- Reverse example repair now uses the same minimal translation pathway as live subtitles with explicit reversed source/target languages.
- Added script-level plausibility checks. Mixed-script or Arabic-contaminated output is discarded rather than shown as a valid example.
- Regression suite: 23/23 tests passing.

## Post-release fix — Basic model field collision

- The supplied settings screenshot showed `Basic` with only `Front` and `Back`, while every optional value defaulted to `Back`. Because the note payload is keyed by field name, later values overwrote earlier values.
- Optional mappings now default to empty (“不写入”) unless the user previously chose a real field; the defaults are merged without replacing explicit empty selections.
- Settings validation and final note construction now reject duplicate field mappings, preventing silent overwrites.

## Post-release fix — Consistent dictionary card layout

- Removed the separate “语境释义” block from the card because it repeated the regular definition; the contextual value remains available to the Anki editor.
- Video sentence and generated example translations now render immediately below the source sentence on one compact `译文：...` line.
- Centralized the fixed dictionary prompt template and specified non-overlapping definitions, context-only meaning, source-language example, and translated example rules.

## Post-release update — Two-field Anki cards

- Anki settings now map only a front-word field and a back-content field. Existing `meaning` mapping is reused as the back mapping until settings are saved again.
- The back combines part of speech and definitions, both bilingual example pairs, and an optional editable playback reference. It no longer writes separate source or example fields.
- Both settings and final submission check that the selected Anki card template displays the chosen fields on the expected sides.
- Verification: 24/24 automated tests, JavaScript syntax checks, and `git diff --check` passed. Live Anki card appearance still requires a user-profile check with Anki Desktop running.

## Post-release update — Basic-only note type

- Kept deck selection unrestricted, but disabled non-Basic note types in the settings list with a visible “currently only Basic” label.
- Fixed note fields to `Front` and `Back`, removed field-mapping controls, and reject unsupported note types on final submission as well as settings save.
