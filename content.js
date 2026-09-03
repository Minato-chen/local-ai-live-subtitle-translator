const DEFAULTS = {
  enabled: true,
  bilingual: false,
  fontSize: 28,
  source: "auto",
  target: "zh",
  contextLines: 0
};

const cache = new Map();
const subtitleHistory = [];
let settings = { ...DEFAULTS };
let lastSource = "";
let requestVersion = 0;
let debounceTimer;
let translationInFlight = false;
let queuedTranslation = null;
let activeRequestId = null;
let nextRequestId = 0;
let extensionContextInvalid = false;
let overlay;
let translatedLine;
let sourceLine;
let statusLine;

init();

async function init() {
  settings = await chrome.storage.sync.get(DEFAULTS);
  createOverlay();
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, value] of Object.entries(changes)) settings[key] = value.newValue;
    cache.clear();
    subtitleHistory.length = 0;
    applySettings();
    scanSubtitles();
  });

  new MutationObserver(scanSubtitles).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.addEventListener("resize", () => positionOverlay(), { passive: true });
  setInterval(scanSubtitles, 500);
  scanSubtitles();
}

function createOverlay() {
  overlay = document.createElement("div");
  overlay.id = "nf-zh-overlay";
  overlay.innerHTML = `
    <div class="nf-zh-source"></div>
    <div class="nf-zh-translation"></div>
    <div class="nf-zh-status"></div>
  `;
  document.documentElement.appendChild(overlay);
  sourceLine = overlay.querySelector(".nf-zh-source");
  translatedLine = overlay.querySelector(".nf-zh-translation");
  statusLine = overlay.querySelector(".nf-zh-status");
  applySettings();
}

function applySettings() {
  if (!overlay) return;
  overlay.style.setProperty("--nf-zh-font-size", `${Number(settings.fontSize) || 28}px`);
  overlay.classList.toggle("nf-zh-disabled", !settings.enabled);
  sourceLine.classList.toggle("nf-zh-hidden", !settings.bilingual);
}

function findSubtitleContainer() {
  const selectors = [
    ".player-timedtext-text-container",
    "[data-uia='player-subtitle-text']",
    ".watch-video--timed-text"
  ];
  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)]
      .filter((node) => !node.closest("#nf-zh-overlay") && node.textContent.trim());
    if (nodes.length) return nodes[nodes.length - 1];
  }
  return null;
}

function readSubtitle(container) {
  const text = (container.innerText || container.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function scanSubtitles() {
  if (extensionContextInvalid) return;
  if (!settings.enabled || !overlay) return;
  const container = findSubtitleContainer();
  if (!container) {
    if (lastSource) clearSubtitle();
    return;
  }

  positionOverlay(container);
  const text = readSubtitle(container);
  if (!text || text === lastSource) return;
  lastSource = text;
  const version = ++requestVersion;
  sourceLine.textContent = text;
  translatedLine.textContent = "...";
  statusLine.textContent = "";
  const context = subtitleHistory.slice(-Math.max(0, Number(settings.contextLines) || 0));
  subtitleHistory.push(text);
  if (subtitleHistory.length > 20) subtitleHistory.shift();

  clearTimeout(debounceTimer);
  // Netflix often rebuilds the same subtitle node several times in one frame.
  // A tiny fixed window avoids cancelling a nearly finished translation while
  // remaining imperceptible to the viewer.  Do not use the legacy delayMs
  // value: it was never exposed in settings and may be stale in sync storage.
  debounceTimer = setTimeout(() => requestTranslation(text, context, version), 80);
}

function cancelActiveTranslation() {
  if (!activeRequestId) return;
  const runtime = globalThis.chrome?.runtime;
  runtime?.sendMessage?.({ type: "CANCEL_TRANSLATION", requestId: activeRequestId }).catch(() => {});
}

async function requestTranslation(text, context, version) {
  if (translationInFlight) {
    queuedTranslation = { text, context, version };
    cancelActiveTranslation();
    return;
  }
  translationInFlight = true;
  const requestId = `subtitle-${++nextRequestId}`;
  activeRequestId = requestId;
  try {
    await translateOne(text, context, version, requestId);
  } finally {
    translationInFlight = false;
    activeRequestId = null;
    const next = queuedTranslation;
    queuedTranslation = null;
    if (next && next.text === lastSource && next.version === requestVersion) {
      requestTranslation(next.text, next.context, next.version);
    }
  }
}

async function translateOne(text, context, version, requestId) {
  const cacheKey = JSON.stringify([settings.source, settings.target, context, text]);
  if (cache.has(cacheKey)) {
    showTranslation(cache.get(cacheKey), version);
    return;
  }

  try {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.sendMessage) {
      throw new Error("扩展已更新，请刷新 Netflix 页面");
    }
    const response = await runtime.sendMessage({ type: "TRANSLATE", text, context, requestId });
    if (version !== requestVersion || text !== lastSource) return;
    if (!response?.ok) throw new Error(response?.error || "翻译失败");
    cache.set(cacheKey, response.translatedText);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    showTranslation(response.translatedText, version);
  } catch (error) {
    if (version !== requestVersion) return;
    translatedLine.textContent = "";
    if (/extension context invalidated/i.test(error.message)) {
      extensionContextInvalid = true;
      queuedTranslation = null;
      statusLine.textContent = "中文字幕：扩展已更新，请刷新 Netflix 页面";
      return;
    }
    statusLine.textContent = `中文字幕：${error.message}`;
  }
}

function showTranslation(text, version) {
  if (version !== requestVersion) return;
  translatedLine.textContent = text;
  statusLine.textContent = "";
}

function positionOverlay(container = findSubtitleContainer()) {
  if (!container || !overlay) return;
  const rect = container.getBoundingClientRect();
  const bottomGap = Math.max(40, window.innerHeight - rect.top + 8);
  overlay.style.bottom = `${bottomGap}px`;
}

function clearSubtitle() {
  lastSource = "";
  requestVersion++;
  sourceLine.textContent = "";
  translatedLine.textContent = "";
  statusLine.textContent = "";
}
