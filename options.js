const DEFAULTS = {
  endpoint: "http://127.0.0.1:5000/translate",
  apiKey: "",
  source: "en",
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
});

document.getElementById("save").addEventListener("click", async () => {
  const values = {};
  for (const id of ids) {
    const element = document.getElementById(id);
    values[id] = element.type === "checkbox" ? element.checked : element.value.trim();
  }
  values.fontSize = Number(values.fontSize) || DEFAULTS.fontSize;
  await chrome.storage.sync.set(values);
  const status = document.getElementById("status");
  status.textContent = "已保存";
  setTimeout(() => (status.textContent = ""), 1500);
});
