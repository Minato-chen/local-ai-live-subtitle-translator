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
- Fixed the word-block subtitle layout regression that visually removed spaces between words; verified the repaired spacing in a temporary browser render.
- Limited the current lookup scope to words and confirmed short phrases. Non-space-delimited text requires selection confirmation, cross-sentence phrases are rejected, and optional word-form notes are added without hard-coded conjugation rules. Sentence cards remain deferred.
- Language-specific dictionary profiles now separate English, Chinese, and Japanese guidance. Japanese adds conjugation terminology and kana-reading validation; ordinary nouns no longer display invented inflection notes. Automated regression tests pass 37/37. Model-produced Japanese meanings and verb analysis still need manual review, and kanji-only Japanese subtitles should use an explicit Japanese source setting.
- Current card format now omits AI-generated new examples. Lookup and Anki show only the video sentence and its translation alongside meaning and optional word-form details. The new-example generation and repair calls were removed; 33/33 current regression tests pass. Japanese morphological analysis remains a possible later enhancement, not a bundled dependency.
- Japanese part-of-speech output is now limited to basic noun, verb, and adjective labels; uncertain or auxiliary categories are hidden. English and Chinese behavior remains unchanged.
- Settings now clarify that decks may contain mixed note types: all decks stay selectable, while notes created by the extension are restricted to Basic and non-Basic note types are disabled in the note-type selector.
- Lookup no longer asks the user to choose word versus phrase. Latin word clicks and multiword drags are immediate; CJK/native selections are classified within the same AI request. A missing classification is rendered neutrally. Validated base forms and optional short phrase usage notes can be edited before adding the video-sentence-only Anki card. Current automated suite: 40/40 passing; live-model UI testing remains manual.
- Kanji-only Japanese lookups in auto mode now use recent kana-bearing original subtitles as context, with one resolved source language used consistently for prompt, checks, and caching. An entirely kanji-only passage remains ambiguous; explicit Japanese source selection is still needed.
- Lookup latency was reduced by removing a sequential full-sentence translation request; the regular subtitle translation fills in afterward. Concise valid non-JSON meanings and harmless trailing commas now recover, with a short retry only for unusable output. Automated suite passes 42/42; live latency remains unmeasured without the local model service.
- The current lookup format is intentionally simpler: one plain-text contextual meaning for either a word or phrase, plus the existing video sentence and translation. New lookup cards and Anki notes no longer request/display type, part of speech, base form, reading, or grammar fields. Older notes are unchanged.
- The plain-text response now has a light dictionary style: one or two concise senses, plus an optional `词形` line only for a reliable inflection-to-base-form relationship. Contextual “说明” text is not generated.
- The optional form/explanation line has since been removed at the user's request. Current lookup and Anki cards contain only the concise meaning, video sentence, and its translation.
- A subsequent code review fix covers playback-page navigation, model-list request timeouts and cancellation, loopback-only service addresses, and a bounded retry for sentence-like Japanese headword meanings. The automated suite passes 32/32 tests; live model behavior still needs checking with the local service running.
- Dictionary response parsing now tolerates common lightweight formatting variations and retries once with a short term-only request when the first result is unusable. The current suite passes 33/33 tests.
- Subtitle translation now recovers from model prompt echo, and YouTube bottom placement follows moving native captions. The current suite passes 35/35 tests; live player and model behavior still need verification.
- Dictionary/Anki video-sentence translations are now generated from only the displayed subtitle fragment, without replacing the contextual translation shown during playback. Anki remains editable if that extra translation fails. The current suite passes 37/37 tests; live model/browser verification is still pending.
- Final dev-branch review fixed zero-context handling, cross-tab cancellation collisions, and cancellation of fragment translation after lookup closes or playback resumes. The current suite passes 41/41 tests; live browser/model verification remains pending.
