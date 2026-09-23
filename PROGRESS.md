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

## Post-release update — Dictionary result quality gate

- A lookup reuses the visible subtitle translation only when it belongs to the selected source line and matches the configured target language.
- Definitions in the wrong language and generated-example translations in the wrong language receive one targeted local translation attempt. Bad retries are omitted instead of presented as valid results; normal fields incur no extra request.
- Obviously malformed pronunciation is hidden. Language checks cannot prove semantic correctness, so fluent but wrong translations still need review before Anki submission.
- Verification: 25/25 automated tests, JavaScript syntax checks, and whitespace checks passed. Live model output still needs user-profile testing.

## Post-release fix — Sentence-shaped definitions and duplicated examples

- Definitions that look like full subtitle translations are rejected; the selected term alone gets one translation attempt to obtain a short gloss.
- A generated example identical to the video sentence (ignoring punctuation and case) gets one isolated regeneration attempt. If it still fails validation, the duplicate is omitted.
- Regression suite: 26/26 tests passing; JavaScript syntax and diff checks pass. Live Hy-MT2 behavior still needs a playback check.

## Post-release update — Remove card source line

- New Anki cards no longer include an automatic show title, season/episode, or playback timestamp. The editor no longer shows a source field; users can organize cards with their chosen deck.
- Existing Anki cards are unchanged.

## Post-release update — Whole-word paused selection

- Space-delimited Latin-script subtitles now render as visually unchanged clickable word blocks while paused; a click selects a whole word and a drag selects a continuous block range.
- CJK subtitles retain native selection. Playback still hides the source line and disables lookup interaction.
- Regression suite: 26/26 tests passing, including tokenization and phrase-range checks; JavaScript syntax and diff checks pass. Manual player interaction remains to be verified.

## Review fixes — Card validation and lookup quality

- Reject Basic cards whose definition is empty even if part of speech is present.
- Keep the user's selected surface form (for example `kept`) as the displayed term and Anki front; retain model normalization separately.
- Propagate Anki field/template lookup failures, validate the Basic template before reporting connection success, and require a refresh after changing the Anki URL.
- Match generated examples against whole words or contiguous phrase tokens instead of substrings.
- When definitions fail quality checks, use a concise contextual meaning if valid; otherwise request one short meaning for the selected text within its sentence, rejecting sentence-like output.
- Regression suite: 30/30 tests passing, JavaScript syntax and diff checks pass. Live model and Anki interactions remain manual checks.

## Post-release fix — Restore spacing in word-block subtitles

- The original subtitle container no longer uses table formatting, which collapsed whitespace-only text nodes between clickable word spans.
- Switched it to a centered fit-content block with preserved whitespace and viewport-constrained wrapping. A temporary headless-browser render confirmed normal word spacing.

## Scope update — Word-first lookup, confirmed phrases

- Single word-block clicks still query immediately; multi-block Latin selections require a visible phrase confirmation.
- Native selections for non-space-delimited subtitles require confirmation of the exact text and word/phrase type before lookup.
- Short phrases cannot cross clear sentence punctuation; long phrases are rejected. Sentence grammar parsing and sentence cards are deferred.
- Dictionary requests now distinguish words from phrases. Optional model-provided word-form notes can appear in the dictionary and Basic card back; uncertain notes are omitted.

## Language-specific dictionary pass — Japanese first

- Split English, Chinese, and Japanese lookup guidance and output checks into separate language profiles so future language tuning does not alter unrelated rules.
- Japanese now prompts for 辞書形, 丁寧形, verb groups, causative/passive forms, and kana readings; context retries also preserve Japanese form context.
- Suppress conjugation notes on Japanese nouns, including the reported false “past tense” for お父さん. Japanese examples must look like complete Japanese sentences; kanji-only terms remain valid for lookup.
- Tests: 37/37 passing; JavaScript syntax and diff checks pass. Live Japanese model accuracy still requires manual review. Kanji-only Japanese needs explicit source-language selection because automatic script detection is ambiguous.
- Next: manually test Japanese noun/verb examples with the configured local model and refine only the Japanese profile based on observed failures.

## Simplified cards — video sentence only

- Removed automatic new-example fields from the dictionary request, lookup panel, Anki editor, and Basic card back. The original subtitle and its translation remain editable before adding a card.
- Removed example-swap and regeneration requests, avoiding extra model calls caused by copied or malformed examples.
- Regression tests: 33/33 passing; JavaScript syntax and diff checks pass. Existing Anki notes are unchanged; new notes use the simplified format.
- Japanese morphological analysis is not bundled in this phase; evaluate it separately if live testing shows that prompt plus conservative checks remain insufficient.

## Japanese basic part-of-speech labels

- Japanese lookup now displays only noun, verb, or adjective labels in both the dictionary and Anki editor when the model's category maps clearly; other labels are omitted. Detailed conjugation remains separate in the optional word-form note.
- English and Chinese display behavior is unchanged. Automated tests: 34/34 passing; syntax and diff checks pass. Live model output still needs manual review.

## Anki deck/type clarification

- Clarified in settings that any deck may be selected even if it contains non-Basic notes. The extension creates only Basic notes; unsupported note types remain disabled and labeled in their own selector.
- No deck data or existing notes are changed.

## Automatic word/phrase lookup

- Removed the word/phrase choice buttons. Space-delimited single-word clicks and multi-word drags query immediately; native selections also query immediately with classification in the same dictionary response.
- Added a bounded `kind` field to the dictionary schema. Invalid or missing classifications fall back to neutral meaning display without part of speech or form claims; clearly spaced multiword selections are always phrases.
- Validated distinct base forms can appear in the dictionary and as editable Anki back content. Phrase results may include a short nonduplicate usage note. Both continue to use only the video sentence and its translation.
- Automated tests: 40/40 passing; syntax and diff checks pass. Manual browser and local-model testing remain to be done.

## Kanji-only Japanese lookup

- Auto source-language detection now checks up to eight recent original subtitle lines for kana when the selected line contains only Han characters. Explicit source-language settings still take precedence.
- The resolved source language is shared across dictionary prompting, word-form checks, and cache keys, avoiding a Japanese prompt paired with Chinese quality checks.
- Limitation: a kanji-only passage with no kana evidence remains ambiguous and requires explicit Japanese selection. Automated regression tests and syntax checks pass; manual playback testing remains.

## Faster lookup and malformed model output recovery

- Removed the second full-sentence translation from the blocking lookup path. The already-running subtitle translation fills the dictionary or empty Anki editor translation field asynchronously when available.
- Accept concise valid plain-text meanings and JSON with harmless trailing commas; only unusable formatting triggers one short meaning-only request. Invalid content is still rejected.
- Regression tests: 42/42 passing; JavaScript syntax and diff checks pass. Live latency and model behavior could not be measured because the local service was not running at 127.0.0.1:8080.

## Single-format contextual lookup

- Replaced the dictionary-shaped JSON request with one short plain-text meaning request for both words and phrases. Removed AI type classification, part of speech, base form, pronunciation, and grammar repair from new results.
- Lookup and Anki now use only selected text, contextual meaning (including a short explanation when needed), video sentence, and its translation. Existing Anki notes remain untouched.
- Retained native-script source inference and selection length/boundary checks. Tests and syntax checks pass; live model evaluation remains manual.
