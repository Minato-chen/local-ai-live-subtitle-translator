# Local AI Live Subtitle Translator

[中文说明](README.md)

An Edge/Chrome extension that reads the subtitles displayed by Netflix or YouTube, sends them to a local OpenAI-compatible translation service, and shows translated subtitles in real time. The recommended default setup is `llama.cpp + Hy-MT2 Q4_K_M`.

## Versions

- Stable: Install from [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/odmlonebpcbphjogbopioojopjecioge). The current store version is `v2.0.4`.
- Development preview: Download the `v2.1.0-dev.1` ZIP marked Pre-release from [GitHub Releases](https://github.com/Minato-chen/local-ai-live-subtitle-translator/releases) and install or update it manually as described below. Use a separate browser profile to avoid running it alongside the store version.

## Installation

See the [installation and setup video](https://youtu.be/2KG4V-mdfIE).

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

2. Install the stable version from Edge Add-ons. For the development preview, extract the Release ZIP, enable Developer mode on the extensions page, select **Load unpacked**, and choose the folder containing `manifest.json`.

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

Enable **Lookup While Paused** in settings. Pause a video, then click an English subtitle word or drag across a phrase; use normal text selection for Japanese and Chinese. The card shows a short meaning, the current subtitle fragment, and its translation. Playback, Escape, or a subtitle change closes the card; lookup does not run during playback.

AI meanings are for learning and should be checked before adding to Anki. Kanji-only subtitles may not be reliably identified as Japanese or Chinese; select the source language in settings if needed. The card translates only the displayed fragment and does not reuse the context-aware playback translation.

## Anki Integration

1. Install Anki Desktop and [AnkiConnect](https://ankiweb.net/shared/info/2055492159). Restart Anki and keep it running.
2. Enable Anki in the extension settings, click **Connect and refresh**, and choose a default deck. The default address is `http://127.0.0.1:8765`.
3. After lookup, click **Add to Anki**, review or edit the card, choose a deck, and confirm. You can also create a deck there.

Only the Basic note type is supported. The front contains the selected text; the back contains its meaning, video sentence, and translation. Cards are added only after confirmation.

## Privacy and Disclaimer

- This is an independent project. It is not affiliated with, endorsed by, or authorized by Netflix, YouTube, Google, or Microsoft.
- The extension reads only the subtitles already displayed on the current playback page. It does not download or distribute video content, and it does not bypass DRM.
- Subtitles are sent only to the translation service selected in the settings page, which defaults to `127.0.0.1:8080`. They are not sent to a server operated by this project's developer. The extension does not store subtitles, account information, cookies, or viewing history.
- When Anki integration is enabled, only note fields explicitly confirmed by the user are sent to local AnkiConnect (default `127.0.0.1:8765`). The extension does not automatically create per-title decks or retain a note history.
- Hy-MT2, llama.cpp, and any other models or services selected by the user are subject to their respective licenses and terms. Refer to the [Hy-MT2 model page](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF) for its license and terms.
