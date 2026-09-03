const DEFAULTS = {
  enabled: true,
  fontSize: 26,
  source: "auto",
  target: "zh",
  contextLines: 1,
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
  sourceLine.classList.add("nf-zh-hidden");
  translatedLine.style.color = settings.textColor || "#ffffff";
  translatedLine.style.webkitTextStroke = settings.outlineEnabled
    ? `${Number(settings.outlineWidth) || 2}px ${settings.outlineColor || "#000000"}`
    : "0 transparent";
  translatedLine.style.background = settings.backgroundEnabled
    ? hexToRgba(settings.backgroundColor || "#000000", Number(settings.backgroundOpacity) / 100)
    : "transparent";
}

function hexToRgba(hex, alpha) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return "rgba(0, 0, 0, 0.68)";
  const value = Number.parseInt(match[1], 16);
  const opacity = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 0.68));
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

function findSubtitleContainer() {
  const selectors = [
    ".ytp-caption-window-container",
    ".ytp-caption-segment",
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
  // Video players often rebuild the same subtitle node several times in one frame.
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
  const cacheKey = JSON.stringify([settings.serviceUrl, settings.source, settings.target, context, text]);
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
  positionOverlay();
}

function positionOverlay(container = findSubtitleContainer()) {
  if (!container || !overlay) return;
  // YouTube's outer caption container covers the whole player. Anchor to the
  // visible caption window instead, otherwise the translation is placed near
  // the top of the viewport.
  const anchor = container.matches(".ytp-caption-window-container")
    ? [...container.querySelectorAll(".caption-window")].filter((node) => node.textContent.trim()).at(-1) || container
    : container;
  const rect = anchor.getBoundingClientRect();
  overlay.style.top = "";
  overlay.style.bottom = "";
  if (settings.position === "below") {
    overlay.style.top = `${Math.min(window.innerHeight - 40, rect.bottom + 8)}px`;
  } else if (settings.position === "top") {
    overlay.style.top = `${Math.max(8, window.innerHeight * 0.1)}px`;
  } else if (settings.position === "bottom") {
    overlay.style.bottom = `${Math.max(8, window.innerHeight * 0.1)}px`;
  } else {
    overlay.style.bottom = `${Math.max(40, window.innerHeight - rect.top + 8)}px`;
  }
  if (settings.position === "top" || settings.position === "bottom") {
    requestAnimationFrame(() => {
      const overlayRect = overlay.getBoundingClientRect();
      const overlaps = overlayRect.bottom > rect.top - 4 && overlayRect.top < rect.bottom + 4;
      if (!overlaps) return;
      // If the preferred fixed slot collides with the player's caption, fall
      // back to the side of the caption with more available room.
      overlay.style.top = "";
      overlay.style.bottom = rect.top > window.innerHeight / 2
        ? `${Math.max(40, window.innerHeight - rect.top + 8)}px`
        : `${Math.max(8, window.innerHeight - rect.bottom - overlayRect.height - 8)}px`;
    });
  }
}

function clearSubtitle() {
  lastSource = "";
  requestVersion++;
  sourceLine.textContent = "";
  translatedLine.textContent = "";
  statusLine.textContent = "";
}
