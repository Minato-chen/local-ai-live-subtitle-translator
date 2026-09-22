const DEFAULTS = {
  contextLines: 1,
  source: "auto",
  target: "zh",
  fontSize: 26,
  serviceUrl: "http://127.0.0.1:8080",
  textColor: "#ffffff",
  outlineEnabled: false,
  outlineColor: "#000000",
  outlineWidth: 2,
  backgroundEnabled: true,
  backgroundColor: "#000000",
  backgroundOpacity: 40,
  position: "above",
  dictionaryEnabled: true,
  ankiEnabled: false,
  ankiUrl: "http://127.0.0.1:8765",
  ankiDeck: "Default",
  ankiModel: "Basic",
  ankiTags: "subtitle-learning"
};

const ids = Object.keys(DEFAULTS);
let loadedSettings = { ...DEFAULTS };

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  const settings = await chrome.storage.sync.get(DEFAULTS);
  loadedSettings = settings;
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element.type === "checkbox") element.checked = settings[id];
    else element.value = settings[id];
  }
  syncStyleControls();
  syncAnkiControls();
  await refreshAnkiMetadata(false);
});

document.getElementById("save").addEventListener("click", async () => {
  const status = document.getElementById("status");
  try {
    const values = {};
    for (const id of ids) {
      const element = document.getElementById(id);
      values[id] = element.type === "checkbox" ? element.checked : element.value.trim();
    }
    values.fontSize = Number(values.fontSize) || DEFAULTS.fontSize;
    values.contextLines = Math.max(0, Math.min(8, Number(values.contextLines) || 0));
    values.outlineWidth = Math.max(0, Math.min(6, Number(values.outlineWidth) || 0));
    values.backgroundOpacity = Math.max(0, Math.min(100, Number(values.backgroundOpacity) || 0));
    values.ankiFieldMap = readFieldMap();
    if (values.ankiEnabled) {
      validateLocalAddress(values.ankiUrl);
      if (!values.ankiDeck || !values.ankiModel) throw new Error("请选择默认牌组和笔记类型");
      if (!values.ankiFieldMap.term || !values.ankiFieldMap.meaning) throw new Error("请映射词语和释义字段");
      if (values.ankiFieldMap.term === values.ankiFieldMap.meaning) throw new Error("词语和释义不能映射到同一字段");
    }
    await chrome.storage.sync.set(values);
    status.textContent = "已保存";
    setTimeout(() => (status.textContent = ""), 1500);
  } catch (error) {
    status.textContent = `保存失败：${error.message}`;
  }
});

document.getElementById("checkService").addEventListener("click", async () => {
  const button = document.getElementById("checkService");
  const status = document.getElementById("serviceStatus");
  const serviceUrl = document.getElementById("serviceUrl").value.trim();
  try {
    validateLocalAddress(serviceUrl);
    button.disabled = true;
    status.textContent = "正在检查服务…";
    const result = await chrome.runtime.sendMessage({ type: "CHECK_SERVICE", serviceUrl });
    if (!result?.ok) throw new Error(result?.error || "检查失败");
    status.textContent = `服务正常 · ${result.latencyMs} ms · 试译成功；请点击“保存设置”应用。`;
  } catch (error) {
    status.textContent = `检查失败：${error.message}`;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("outlineEnabled").addEventListener("change", syncStyleControls);
document.getElementById("backgroundEnabled").addEventListener("change", syncStyleControls);
document.getElementById("ankiEnabled").addEventListener("change", syncAnkiControls);
document.getElementById("checkAnki").addEventListener("click", () => refreshAnkiMetadata(true));
document.getElementById("ankiModel").addEventListener("change", refreshAnkiFields);

function syncStyleControls() {
  document.getElementById("outlineColor").disabled = !document.getElementById("outlineEnabled").checked;
  document.getElementById("outlineWidth").disabled = !document.getElementById("outlineEnabled").checked;
  document.getElementById("backgroundColor").disabled = !document.getElementById("backgroundEnabled").checked;
  document.getElementById("backgroundOpacity").disabled = !document.getElementById("backgroundEnabled").checked;
}

function validateLocalAddress(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("服务地址无效，请填写如 http://127.0.0.1:8080 的完整地址");
  }
  if (url.protocol !== "http:") throw new Error("本地服务地址应使用 HTTP");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("仅支持本机地址：127.0.0.1 或 localhost");
  }
}

const FIELD_SELECTS = {
  term: "ankiFieldTerm", meaning: "ankiFieldMeaning", videoSentence: "ankiFieldVideoSentence",
  generatedExample: "ankiFieldGeneratedExample", exampleTranslation: "ankiFieldExampleTranslation", source: "ankiFieldSource"
};

function syncAnkiControls() {
  const enabled = document.getElementById("ankiEnabled").checked;
  for (const element of document.querySelectorAll("#ankiSettings input, #ankiSettings select, #ankiSettings button")) element.disabled = !enabled;
}

async function ankiAction(action, params = {}) {
  const ankiUrl = document.getElementById("ankiUrl").value.trim();
  const response = await chrome.runtime.sendMessage({ type: "ANKI_ACTION", action, params, ankiUrl });
  if (!response?.ok) throw new Error(response?.error || "AnkiConnect error");
  return response.result;
}

async function refreshAnkiMetadata(showStatus) {
  if (!document.getElementById("ankiEnabled").checked) return;
  const status = document.getElementById("ankiStatus");
  try {
    if (showStatus) status.textContent = "正在连接…";
    const permission = await ankiAction("requestPermission");
    if (permission?.permission && permission.permission !== "granted") throw new Error("AnkiConnect 未授权此扩展，请在 Anki 中允许访问");
    const [version, decks, models] = await Promise.all([ankiAction("version"), ankiAction("deckNames"), ankiAction("modelNames")]);
    fillSelect(document.getElementById("ankiDeck"), decks, document.getElementById("ankiDeck").value || loadedSettings.ankiDeck || DEFAULTS.ankiDeck);
    fillSelect(document.getElementById("ankiModel"), models, document.getElementById("ankiModel").value || loadedSettings.ankiModel || DEFAULTS.ankiModel);
    await refreshAnkiFields();
    status.textContent = `AnkiConnect v${version} · ${decks.length} 个牌组`;
  } catch (error) { if (showStatus) status.textContent = `连接失败：${error.message}`; }
}

async function refreshAnkiFields() {
  const modelName = document.getElementById("ankiModel").value;
  if (!modelName) return;
  try {
    const fields = await ankiAction("modelFieldNames", { modelName });
    const saved = (await chrome.storage.sync.get({ ankiFieldMap: {} })).ankiFieldMap;
    for (const [key, id] of Object.entries(FIELD_SELECTS)) {
      const fallback = key === "term" ? fields[0] : key === "meaning" ? fields[1] : "";
      fillSelect(document.getElementById(id), key === "term" || key === "meaning" ? fields : ["", ...fields], saved[key] || fallback);
    }
  } catch (error) { document.getElementById("ankiStatus").textContent = `字段读取失败：${error.message}`; }
}

function fillSelect(select, values, selected) {
  select.replaceChildren(...values.map((value) => { const option = document.createElement("option"); option.value = value; option.textContent = value || "不写入"; return option; }));
  select.value = selected;
}

function readFieldMap() { return Object.fromEntries(Object.entries(FIELD_SELECTS).map(([key, id]) => [key, document.getElementById(id).value])); }
