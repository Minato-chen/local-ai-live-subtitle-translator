# Development Summary

## Outcome

Implemented paused subtitle lookup and opt-in Anki integration on branch `codex/paused-dictionary-anki`.

### Paused lookup

- Detects and rebinds to the visible primary video across player DOM replacement.
- Reveals the extension-owned original subtitle only while the video is paused.
- Accepts bounded mouse selections from that subtitle only; playback immediately clears selections and interactive UI.
- Uses the existing local OpenAI-compatible service for structured dictionary output.
- Shows concise definitions, contextual meaning, the real video sentence, and a separate AI-generated example with translation.
- Cancels stale requests and prevents slow responses from replacing newer selections.

### Anki integration

- Connects only to a loopback AnkiConnect URL (default `127.0.0.1:8765`) through an allowlisted background protocol.
- Uses AnkiConnect permission negotiation and dynamically loads decks, note types, and fields.
- Supports a default deck, per-note deck override, and explicitly confirmed deck creation.
- Provides an editable pre-submit page for term, meaning, video sentence, generated example/translation, source, and tags.
- Escapes all note content, blocks double submission, revalidates live metadata, and checks duplicates before adding.
- Stores only configuration—not subtitles, lookup history, drafts, or note contents.

## Verification

- `npm test`: 17/17 tests passing.
- `npm run check`: all extension JavaScript passes syntax validation.
- `manifest.json` and `_locales/zh_CN/messages.json`: valid JSON.
- `git diff --check`: clean.
- Microsoft Edge 153 isolated-profile smoke load: no extension manifest or script parse failure observed.

Automated coverage includes selection normalization, loopback URL enforcement, HTML escaping, source tags, dictionary prompt/JSON parsing and malformed responses, Anki protocol envelopes, note construction, invalid mappings, and live metadata revalidation.

## Local commits

1. `3afd669` — `chore: establish dictionary and Anki development baseline`
2. `5af9f5f` — `feat: enable paused subtitle selection`
3. `ac287d9` — `feat: add local AI dictionary workflow`
4. `2748253` — `feat: integrate configurable AnkiConnect client`
5. `997f610` — `feat: add editable and validated Anki note flow`
6. Final verification commit: see the latest commit after this summary is added.

## Manual checks still required

1. Load the unpacked extension in the user's normal Chrome/Edge profile and execute the Netflix/YouTube layout matrix in `PLAN.md`, especially fullscreen, Shorts, mini player, seek, and SPA navigation.
2. Start Anki Desktop with AnkiConnect, approve the extension if prompted, configure field mappings, and verify a real note in both a default and newly created subdeck.
3. Confirm duplicate behavior against the user's actual Anki note model and existing collection.

These checks are blocked in the current environment because Netflix/browser interaction needs a visible authenticated media session and no AnkiConnect service is running. No attempt was made to install software, change user configuration, create test notes, or push commits remotely.

## Post-release correction

- Dictionary requests now use llama.cpp schema-constrained JSON output. This fixes “词典返回格式无效” responses from models that did not obey a prose-only JSON instruction.
- Dictionary panels are measured after rendering and automatically move above bottom subtitles, remain inside the viewport, and scroll internally when space is limited.
- The Anki action is always visible: it opens setup before Anki is enabled and the editable note form afterward.
- Video and generated examples are now explicit bilingual pairs; Hy-MT2 output with reversed/missing source examples is repaired before display, and all four values can be mapped to Anki fields.
- Hy-MT2 reverse repair now uses the proven subtitle translation path with inferred language direction; mixed-script/Arabic-contaminated examples are suppressed.
- Fixed Anki `Basic` mapping collisions: optional values default to “do not write”, and duplicate destination-field mappings are rejected instead of overwriting earlier fields.
- Standardized dictionary card layout and prompt template: one definition area, compact translation rows, and explicit non-duplicating meanings/example instructions.
- Simplified Anki notes to two mapped fields: the front is only the word; the back combines one-line part of speech and meaning, video sentence with translation, new example with translation, and an optional editable playback reference. Custom note types are checked against their card templates before adding. The updated automated suite passes 24/24 tests; a real Anki review remains a manual check.
- Subsequent compatibility restriction: only Basic notes with `Front`/`Back` are supported; other note types are visibly disabled in settings, while any deck remains selectable.
- Added a lightweight dictionary quality gate: wrong-language definitions and example translations get one local translation retry, malformed pronunciation is hidden, and only a subtitle translation paired with the selected line is reused. The suite now passes 25/25 tests; semantic accuracy of fluent model output cannot be guaranteed by these checks.
- Follow-up quality fix rejects sentence-like definitions and examples copied from the video sentence, with one narrow retry for each; the suite now passes 26/26 tests.
- Automatic source and playback-time references were removed from newly created cards at the user's request; deck selection remains available for show-level organization.
- Paused space-delimited subtitles now use whole-word click/drag selection to prevent partial-word lookups, while CJK subtitles keep native text selection. The regression suite passes 26/26 tests.
- Review follow-up fixed empty-definition cards, selected-term preservation, Anki template-status reporting, substring example matches, and context-free definition retries. The regression suite now passes 30/30 tests.
