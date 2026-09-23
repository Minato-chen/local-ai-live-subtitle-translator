# Local AI Live Subtitle Translator

[中文说明](README.md)

An Edge/Chrome extension that reads the subtitles displayed by Netflix or YouTube, sends them to a local OpenAI-compatible translation service, and shows translated subtitles in real time. The recommended default setup is `llama.cpp + Hy-MT2 Q4_K_M`.

## Installation

1. Install llama.cpp.

   The recommended installation method is [llama.app](https://llama.app/).

   **Windows (PowerShell):**

   ```powershell
   irm https://llama.app/install.ps1 | iex
   ```

   **macOS (Terminal):** Apple Silicon Macs automatically use Metal acceleration.

   ```bash
   curl -LsSf https://llama.app/install.sh | sh
   ```

2. Open your browser's extensions page, enable Developer mode, select **Load unpacked**, and choose this project's directory.

   Edge: `edge://extensions`

   Chrome: `chrome://extensions`

3. Start the local translation service with `llama.cpp + Hy-MT2 Q4_K_M`.

   The command is the same on Windows and macOS:

   ```powershell
   llama serve -hf tencent/Hy-MT2-1.8B-GGUF:Q4_K_M -ngl all -c 2048 -np 1 -a hy-mt2-fast
   ```

   The first run downloads the model. Keep the service window open while using the extension.

4. Open a Netflix or YouTube video and enable any original subtitle track. The translation will appear automatically. The segmentation and recognition quality of YouTube auto-generated captions depend on YouTube.

## Settings

The settings page has three sections:

- **Start local service:** Shows the recommended Hy-MT2 command. If you use another model, start a compatible service according to that model's documentation.
- **Local service connection:** The default address is `http://127.0.0.1:8080`. Change the port if needed, then use **Check service** to verify the connection and run a sample translation. The service must expose an OpenAI-compatible `/v1/chat/completions` endpoint.
- **Translation and subtitle display:** Configure source and target languages, font size, translation color, text outline, background color and opacity, display position, and the number of preceding subtitle lines to use as context. Language settings affect only the translation prompt; they do not switch models. Explicitly selecting a source language can make translation a little more reliable, but usually does not improve speed. More context can improve coherence, at the cost of slightly slower requests. Defaults are **Auto-detect → Simplified Chinese**, `26 px`, one context line, and 40% background opacity.

## Lookup While Paused

Enable paused lookup, then pause a video to reveal the current original subtitle retained by the extension. Click whole-word blocks or drag across them for space-delimited subtitles; Japanese, Chinese, and similar subtitles use native text selection. Lookup starts immediately without a word/phrase type choice. Results use a light dictionary format with one or two concise senses, followed by the video sentence and its translation. No new example or word-form explanation is generated. Cross-sentence and overly long selections are rejected. Playback, Escape, or a subtitle change closes the panel. No lookup request is made while the video is playing.

AI meanings are learning aids rather than authoritative dictionary entries. The extension checks only for short target-language text, not semantic accuracy; review notes before adding them to Anki. Lookup text is sent only to the configured local OpenAI-compatible service.

In auto mode, a kanji-only subtitle lookup checks recent original subtitle lines for kana evidence before treating it as Chinese. If the whole passage lacks kana, the script alone cannot reliably distinguish Japanese from Chinese; explicitly select the source language in settings.

Lookup first requests a short plain-text meaning, with one retry if the model returns an unusable result. The video-sentence translation is generated separately from only the displayed subtitle fragment; it does not reuse the context-aware translation shown during playback. When ready, it fills the lookup card or an empty Anki editor field. Closing lookup or resuming playback cancels an unfinished fragment translation.

## Anki Integration

1. Install Anki Desktop and install [AnkiConnect](https://ankiweb.net/shared/info/2055492159) from AnkiWeb. Restart Anki and keep it running.
2. Enable Anki in the extension settings, keep the default URL `http://127.0.0.1:8765`, and click **Connect and refresh**. The extension uses AnkiConnect's `requestPermission` flow; approve the extension origin if Anki asks. If CORS is still denied, inspect `webCorsOriginList` under **Tools → Add-ons → AnkiConnect → Config**. Do not expose the bind address to a LAN or the public internet.
3. Choose any default deck. Currently only the `Basic` note type is supported; other note types are disabled and labeled in the list. The front is fixed to `Front` and the back to `Back`. A modified Basic template must still display those fields on the corresponding sides.
4. After lookup, click **Add to Anki**, review or edit the content, deck, and tags, then confirm. You can explicitly create a subdeck such as `Subtitle Learning::Movie title` from this editor.

The front contains only the selected text. The back combines its meaning, video sentence, and translation. No new example, source, or timestamp is added. You can choose or manually create a deck for each show; the extension never creates a deck merely because a movie is opened. Note contents are not stored in browser sync and are sent to local AnkiConnect only after confirmation.

Anki decks can contain mixed note types, so no deck is disabled based on its existing cards. New notes from this extension always use Basic; other note types are disabled in settings.

## Privacy and Disclaimer

- This is an independent project. It is not affiliated with, endorsed by, or authorized by Netflix, YouTube, Google, or Microsoft.
- The extension reads only the subtitles already displayed on the current playback page. It does not download or distribute video content, and it does not bypass DRM.
- Subtitles are sent only to the translation service selected in the settings page, which defaults to `127.0.0.1:8080`. They are not sent to a server operated by this project's developer. The extension does not store subtitles, account information, cookies, or viewing history.
- When Anki integration is enabled, only note fields explicitly confirmed by the user are sent to local AnkiConnect (default `127.0.0.1:8765`). The extension does not automatically create per-title decks or retain a note history.
- Hy-MT2, llama.cpp, and any other models or services selected by the user are subject to their respective licenses and terms. Refer to the [Hy-MT2 model page](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF) for its license and terms.
