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

## Privacy and Disclaimer

- This is an independent project. It is not affiliated with, endorsed by, or authorized by Netflix, YouTube, Google, or Microsoft.
- The extension reads only the subtitles already displayed on the current playback page. It does not download or distribute video content, and it does not bypass DRM.
- Subtitles are sent only to the translation service selected in the settings page, which defaults to `127.0.0.1:8080`. They are not sent to a server operated by this project's developer. The extension does not store subtitles, account information, cookies, or viewing history.
- Hy-MT2, llama.cpp, and any other models or services selected by the user are subject to their respective licenses and terms. Refer to the [Hy-MT2 model page](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF) for its license and terms.
