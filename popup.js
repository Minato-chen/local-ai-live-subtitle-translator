document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  const {
    enabled = true,
    webSelectionEnabled = true,
    serviceUrl = "http://127.0.0.1:8080",
    uiLanguage = "zh"
  } = await chrome.storage.sync.get({
    enabled: true,
    webSelectionEnabled: true,
    serviceUrl: "http://127.0.0.1:8080",
    uiLanguage: "zh"
  });
  document.getElementById("enabled").checked = enabled;
  document.getElementById("webSelectionEnabled").checked = webSelectionEnabled;
  checkServiceStatus(serviceUrl, uiLanguage);
  syncPageTranslationButton(uiLanguage);
});

async function syncPageTranslationButton(lang) {
  const button = document.getElementById("togglePageTranslate");
  if (!button) return;
  const isEn = lang === "en";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      button.disabled = true;
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_TRANSLATION_STATE" });
    updatePageButtonLabel(button, Boolean(response?.active), isEn);
  } catch {
    updatePageButtonLabel(button, false, isEn);
  }
}

function updatePageButtonLabel(button, active, isEn) {
  button.textContent = active
    ? (isEn ? "Restore Original Page" : "还原网页原文")
    : (isEn ? "Translate Current Page (Bilingual)" : "双语翻译当前网页");
}

async function checkServiceStatus(serviceUrl, lang) {
  const dot = document.getElementById("statusDot");
  const title = document.getElementById("statusTitle");
  const desc = document.getElementById("statusDesc");
  const isEn = lang === "en" || !/^zh/i.test(navigator.language);

  try {
    const response = await chrome.runtime.sendMessage({ type: "CHECK_SERVICE", serviceUrl });
    if (response?.ok) {
      dot.className = "status-dot online";
      title.textContent = isEn ? "Local AI: Connected" : "本地 AI：已连接";
      desc.textContent = isEn
        ? `Ready (${serviceUrl}, ${response.latencyMs}ms)`
        : `服务运行正常 (${serviceUrl}，延迟 ${response.latencyMs}ms)`;
    } else {
      throw new Error(response?.error || "Offline");
    }
  } catch (_e) {
    dot.className = "status-dot offline";
    title.textContent = isEn ? "Local AI: Not running" : "本地 AI：未连接";
    desc.textContent = isEn
      ? `Offline (${serviceUrl}). Start llama.cpp or check Settings.`
      : `未检测到本地服务 (${serviceUrl})。请启动 llama.cpp 或点击下方设置查看教程。`;
  }
}

document.getElementById("enabled").addEventListener("change", (event) => {
  chrome.storage.sync.set({ enabled: event.target.checked });
});

document.getElementById("webSelectionEnabled").addEventListener("change", (event) => {
  chrome.storage.sync.set({ webSelectionEnabled: event.target.checked });
});

document.getElementById("togglePageTranslate").addEventListener("click", async () => {
  const button = document.getElementById("togglePageTranslate");
  const { uiLanguage = "zh" } = await chrome.storage.sync.get({ uiLanguage: "zh" });
  const isEn = uiLanguage === "en";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const response = await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PAGE_TRANSLATION" });
    updatePageButtonLabel(button, Boolean(response?.active), isEn);
  } catch {
    // Content script might not be loaded if tab was opened before extension install/reload
  }
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openPdfViewer").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = tab?.url || "";
    const isOnlinePdf = /^https?:\/\/.*\.pdf(?:[?#].*)?$/i.test(tabUrl) || /^https?:\/\/arxiv\.org\/pdf\//i.test(tabUrl);
    const viewerUrl = isOnlinePdf
      ? chrome.runtime.getURL(`pdf-viewer.html?url=${encodeURIComponent(tabUrl)}`)
      : chrome.runtime.getURL("pdf-viewer.html");
    await chrome.tabs.create({ url: viewerUrl });
  } catch {
    await chrome.tabs.create({ url: chrome.runtime.getURL("pdf-viewer.html") });
  }
});
