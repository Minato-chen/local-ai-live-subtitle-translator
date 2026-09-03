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
  position: "above"
};

const ids = Object.keys(DEFAULTS);

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  const settings = await chrome.storage.sync.get(DEFAULTS);
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element.type === "checkbox") element.checked = settings[id];
    else element.value = settings[id];
  }
  syncStyleControls();
});

document.getElementById("save").addEventListener("click", async () => {
  const values = {};
  for (const id of ids) {
    const element = document.getElementById(id);
    values[id] = element.type === "checkbox" ? element.checked : element.value.trim();
  }
  values.fontSize = Number(values.fontSize) || DEFAULTS.fontSize;
  values.contextLines = Math.max(0, Math.min(8, Number(values.contextLines) || 0));
  values.outlineWidth = Math.max(0, Math.min(6, Number(values.outlineWidth) || 0));
  values.backgroundOpacity = Math.max(0, Math.min(100, Number(values.backgroundOpacity) || 0));
  await chrome.storage.sync.set(values);
  const status = document.getElementById("status");
  status.textContent = "已保存";
  setTimeout(() => (status.textContent = ""), 1500);
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
