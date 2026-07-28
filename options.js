const DEFAULTS = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:5001/translate",
  apiKey: "",
  ollamaEndpoint: "http://127.0.0.1:11434/api/chat",
  ollamaModel: "maternion/hy-mt2:1.8b",
  contextLines: 1,
  source: "auto",
  target: "zh",
  fontSize: 28,
  bilingual: false
};

const ids = Object.keys(DEFAULTS);

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element.type === "checkbox") element.checked = settings[id];
    else element.value = settings[id];
  }
  updateProviderVisibility();
});

document.getElementById("provider").addEventListener("change", updateProviderVisibility);

function updateProviderVisibility() {
  const provider = document.getElementById("provider").value;
  document.getElementById("libreSettings").hidden = provider !== "libretranslate";
  document.getElementById("ollamaSettings").hidden = provider !== "ollama";
}

document.getElementById("save").addEventListener("click", async () => {
  const values = {};
  for (const id of ids) {
    const element = document.getElementById(id);
    values[id] = element.type === "checkbox" ? element.checked : element.value.trim();
  }
  values.fontSize = Number(values.fontSize) || DEFAULTS.fontSize;
  values.contextLines = Math.max(0, Math.min(8, Number(values.contextLines) || 0));
  await chrome.storage.sync.set(values);
  const status = document.getElementById("status");
  status.textContent = "已保存";
  setTimeout(() => (status.textContent = ""), 1500);
});
