document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  const { enabled = true, serviceUrl = "http://127.0.0.1:8080", uiLanguage = "zh" } = await chrome.storage.sync.get({
    enabled: true,
    serviceUrl: "http://127.0.0.1:8080",
    uiLanguage: "zh"
  });
  document.getElementById("enabled").checked = enabled;
  checkServiceStatus(serviceUrl, uiLanguage);
});

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

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
