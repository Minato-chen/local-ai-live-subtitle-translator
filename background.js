const DEFAULTS = {
  endpoint: "http://127.0.0.1:5000/translate",
  apiKey: "",
  source: "en",
  target: "zh",
  timeoutMs: 8000
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "TRANSLATE") return false;

  translate(message.text)
    .then((translatedText) => sendResponse({ ok: true, translatedText }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function translate(text) {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

  const payload = {
    q: text,
    source: settings.source,
    target: settings.target,
    format: "text"
  };
  if (settings.apiKey) payload.api_key = settings.apiKey;

  try {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`翻译服务返回 HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.translatedText) throw new Error("翻译服务没有返回 translatedText");
    return data.translatedText;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("翻译请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
