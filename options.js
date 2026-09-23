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
let currentAnkiTemplateFields = null;
let currentAnkiMetadataUrl = "";

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
    validateLocalAddress(values.serviceUrl);
    values.ankiModel = "Basic";
    values.ankiFieldMap = { term: "Front", cardBack: "Back" };
    if (values.ankiEnabled) {
      validateLocalAddress(values.ankiUrl);
      if (!values.ankiDeck) throw new Error("请选择默认牌组");
      if (!currentAnkiTemplateFields || currentAnkiMetadataUrl !== values.ankiUrl) throw new Error("请先连接当前 Anki 地址并读取卡片模板");
      if (!Object.values(currentAnkiTemplateFields).some((sides) => sides?.[0]?.includes("Front") && sides?.[1]?.includes("Back"))) {
        throw new Error("Basic 模板未在正反面显示 Front 和 Back 字段");
      }
    }
    await chrome.storage.sync.set(values);
    loadedSettings = values;
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

function syncStyleControls() {
  document.getElementById("outlineColor").disabled = !document.getElementById("outlineEnabled").checked;
  document.getElementById("outlineWidth").disabled = !document.getElementById("outlineEnabled").checked;
  document.getElementById("backgroundColor").disabled = !document.getElementById("backgroundEnabled").checked;
  document.getElementById("backgroundOpacity").disabled = !document.getElementById("backgroundEnabled").checked;
}

function validateLocalAddress(value) {
  SubtitleShared.validateLoopbackHttpUrl(value);
}

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
  currentAnkiTemplateFields = null;
  currentAnkiMetadataUrl = "";
  try {
    if (showStatus) status.textContent = "正在连接…";
    const permission = await ankiAction("requestPermission");
    if (permission?.permission && permission.permission !== "granted") throw new Error("AnkiConnect 未授权此扩展，请在 Anki 中允许访问");
    const [version, decks, models] = await Promise.all([ankiAction("version"), ankiAction("deckNames"), ankiAction("modelNames")]);
    fillSelect(document.getElementById("ankiDeck"), decks, document.getElementById("ankiDeck").value || loadedSettings.ankiDeck || DEFAULTS.ankiDeck);
    const modelSelect = document.getElementById("ankiModel");
    modelSelect.replaceChildren(...models.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name === "Basic" ? name : `${name}（目前只支持 Basic）`;
      option.disabled = name !== "Basic";
      return option;
    }));
    modelSelect.value = models.includes("Basic") ? "Basic" : "";
    if (!modelSelect.value) throw new Error("未找到 Basic 笔记类型，请在 Anki 中恢复或创建 Basic");
    await refreshAnkiFields();
    status.textContent = `AnkiConnect v${version} · ${decks.length} 个牌组`;
  } catch (error) { status.textContent = `连接失败：${error.message}`; }
}

async function refreshAnkiFields() {
  currentAnkiTemplateFields = null;
  if (document.getElementById("ankiModel").value !== "Basic") return;
  const [fields, templates] = await Promise.all([
    ankiAction("modelFieldNames", { modelName: "Basic" }),
    ankiAction("modelFieldsOnTemplates", { modelName: "Basic" })
  ]);
  if (!fields.includes("Front") || !fields.includes("Back")) throw new Error("Basic 缺少 Front 或 Back 字段");
  if (!Object.values(templates || {}).some((sides) => sides?.[0]?.includes("Front") && sides?.[1]?.includes("Back"))) {
    throw new Error("Basic 模板未在正反面显示 Front 和 Back 字段");
  }
  currentAnkiTemplateFields = templates;
  currentAnkiMetadataUrl = document.getElementById("ankiUrl").value.trim();
}

function fillSelect(select, values, selected) {
  select.replaceChildren(...values.map((value) => { const option = document.createElement("option"); option.value = value; option.textContent = value || "不写入"; return option; }));
  select.value = selected;
}
