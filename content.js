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
  position: "above",
  uiLanguage: "zh",
  dictionaryEnabled: true,
  ankiEnabled: false,
  ankiUrl: "http://127.0.0.1:8765",
  ankiDeck: "Default",
  ankiModel: "Basic",
  ankiFieldMap: { term: "Front", cardBack: "Back" },
  ankiTags: "subtitle-learning"
};

const cache = new Map();
const subtitleHistory = [];
let settings = { ...DEFAULTS };
let lastSource = "";
let translatedSource = "";
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
let dictionaryPanel;
let editorPanel;
let activeVideo = null;
let videoPaused = false;
let lookupRequestId = null;
let lookupVersion = 0;
let lastDictionaryEntry = null;
let sessionDeck = "";
let dictionaryAnchor = null;
let wordBlockParts = null;
let blockDrag = null;

if (isTranslationPage()) init();

function isTranslationPage() {
  const host = location.hostname;
  if (host === "www.netflix.com") return /^\/watch\/\d+/.test(location.pathname);
  if (host === "www.youtube.com") return location.pathname === "/watch" || location.pathname.startsWith("/shorts/");
  return false;
}

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

  window.addEventListener("resize", () => { positionOverlay(); positionDictionaryPanel(); }, { passive: true });
  document.addEventListener("mouseup", handleSelectionMouseUp);
  sourceLine.addEventListener("mousedown", beginWordBlockDrag);
  document.addEventListener("mousemove", updateWordBlockDrag);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeInteractivePanels(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) exitPausedInteraction(); });
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
    <section class="nf-zh-dictionary" hidden></section>
    <section class="nf-zh-anki-editor" hidden></section>
  `;
  document.documentElement.appendChild(overlay);
  sourceLine = overlay.querySelector(".nf-zh-source");
  translatedLine = overlay.querySelector(".nf-zh-translation");
  statusLine = overlay.querySelector(".nf-zh-status");
  dictionaryPanel = overlay.querySelector(".nf-zh-dictionary");
  editorPanel = overlay.querySelector(".nf-zh-anki-editor");
  applySettings();
}

function applySettings() {
  if (!overlay) return;
  overlay.style.setProperty("--nf-zh-font-size", `${Number(settings.fontSize) || 28}px`);
  overlay.classList.toggle("nf-zh-disabled", !settings.enabled);
  updatePausedUi();
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
  bindPrimaryVideo();
  const container = findSubtitleContainer();
  if (!container) {
    if (lastSource) clearSubtitle();
    return;
  }

  positionOverlay(container);
  const text = readSubtitle(container);
  if (!text || text === lastSource) return;
  if (lastSource) closeInteractivePanels();
  lastSource = text;
  translatedSource = "";
  const version = ++requestVersion;
  renderSourceLine(text);
  updatePausedUi();
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
      throw new Error("扩展已更新，请刷新播放页面");
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
      statusLine.textContent = "提示：扩展已更新，请刷新播放页面";
      return;
    }
    const isOffline = /无法连接|Failed to fetch|NetworkError|ECONNREFUSED|127\.0\.0\.1|localhost/i.test(error.message);
    const isEn = settings.uiLanguage === "en" || !/^zh/i.test(navigator.language);
    if (isOffline) {
      statusLine.textContent = isEn
        ? "Notice: Local AI service not connected. Please start llama.cpp (127.0.0.1:8080) or check extension settings."
        : "提示：未连接到本地 AI 翻译服务，请启动 llama.cpp (127.0.0.1:8080) 或在扩展设置中配置。";
    } else {
      statusLine.textContent = isEn ? `Notice: ${error.message}` : `提示：${error.message}`;
    }
  }
}

function showTranslation(text, version) {
  if (version !== requestVersion) return;
  translatedSource = lastSource;
  translatedLine.textContent = text;
  statusLine.textContent = "";
  positionOverlay();
}

function positionOverlay(container = findSubtitleContainer()) {
  if (!container || !overlay) return;
  const youtubePlayer = location.hostname === "www.youtube.com"
    ? document.querySelector(".html5-video-player")
    : null;
  if (youtubePlayer) {
    positionYouTubeOverlay(youtubePlayer);
    return;
  }
  overlay.style.left = "";
  overlay.style.right = "";
  overlay.style.maxWidth = "";
  overlay.style.setProperty("--nf-zh-font-size", `${Number(settings.fontSize) || 28}px`);
  // YouTube's outer caption container covers the whole player. Anchor to the
  // visible caption window instead, otherwise the translation is placed near
  // the top of the viewport.
  const captionWindow = container.matches(".ytp-caption-window-container")
    ? [...container.querySelectorAll(".caption-window")]
      .filter((node) => node.textContent.trim() && node.getBoundingClientRect().height > 0)
      .at(-1)
    : null;
  const anchor = captionWindow || container;
  const rect = anchor.getBoundingClientRect();
  const isYoutubeOuterContainer = anchor === container && container.matches(".ytp-caption-window-container");
  overlay.style.top = "";
  overlay.style.bottom = "";
  if (settings.position === "below") {
    overlay.style.top = `${Math.min(window.innerHeight - 40, rect.bottom + 8)}px`;
  } else if (settings.position === "top") {
    overlay.style.top = `${Math.max(8, window.innerHeight * 0.1)}px`;
  } else if (settings.position === "bottom") {
    overlay.style.bottom = `${Math.max(8, window.innerHeight * 0.1)}px`;
  } else {
    const bottomGap = isYoutubeOuterContainer
      ? window.innerHeight - rect.bottom + 48
      : window.innerHeight - rect.top + 8;
    overlay.style.bottom = `${Math.max(40, bottomGap)}px`;
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

function positionYouTubeOverlay(player) {
  const rect = player.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = Math.max(8, Math.min(20, Math.round(rect.width * 0.02)));
  const compact = rect.width < 560 || rect.height < 300;
  const requestedSize = Number(settings.fontSize) || 28;
  const fontSize = compact
    ? Math.max(16, Math.min(requestedSize, Math.round(rect.width / 24)))
    : requestedSize;

  // Bind the overlay to the video, not to the whole browser window. This is
  // essential for YouTube's mini and narrow player layouts.
  overlay.style.left = `${Math.max(0, rect.left + padding)}px`;
  overlay.style.right = `${Math.max(0, viewportWidth - rect.right + padding)}px`;
  overlay.style.maxWidth = `${Math.max(120, rect.width - padding * 2)}px`;
  overlay.style.setProperty("--nf-zh-font-size", `${fontSize}px`);
  overlay.style.top = "";
  overlay.style.bottom = "";

  if (settings.position === "top" || (settings.position === "above" && compact)) {
    // A small player has no reliable free lane above YouTube's captions.
    overlay.style.top = `${Math.max(8, rect.top + padding)}px`;
    return;
  }
  if (settings.position === "below") {
    overlay.style.top = `${Math.min(viewportHeight - 40, rect.bottom + padding)}px`;
    return;
  }
  if (settings.position === "bottom") {
    overlay.style.bottom = `${Math.max(8, viewportHeight - rect.bottom + padding)}px`;
    return;
  }

  // Normal "above" placement: reserve a lane above the native captions at
  // the bottom of the player. The compact case was handled at the top above.
  const captionLane = Math.max(72, Math.min(128, rect.height * 0.2));
  overlay.style.bottom = `${Math.max(8, viewportHeight - rect.bottom + captionLane)}px`;
}

function clearSubtitle() {
  lastSource = "";
  requestVersion++;
  sourceLine.textContent = "";
  translatedLine.textContent = "";
  statusLine.textContent = "";
  closeInteractivePanels();
}

function findPrimaryVideo() {
  return [...document.querySelectorAll("video")]
    .map((video) => ({ video, rect: video.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.video || null;
}

function bindPrimaryVideo() {
  const next = findPrimaryVideo();
  if (next === activeVideo) { syncVideoState(); return; }
  if (activeVideo) {
    activeVideo.removeEventListener("play", syncVideoState);
    activeVideo.removeEventListener("pause", syncVideoState);
    activeVideo.removeEventListener("ended", syncVideoState);
    activeVideo.removeEventListener("emptied", syncVideoState);
  }
  activeVideo = next;
  if (activeVideo) {
    activeVideo.addEventListener("play", syncVideoState);
    activeVideo.addEventListener("pause", syncVideoState);
    activeVideo.addEventListener("ended", syncVideoState);
    activeVideo.addEventListener("emptied", syncVideoState);
  }
  syncVideoState();
}

function syncVideoState() {
  const nextPaused = Boolean(activeVideo && activeVideo.paused && !activeVideo.ended && activeVideo.readyState > 0 && !document.hidden);
  if (videoPaused === nextPaused) return;
  videoPaused = nextPaused;
  if (!videoPaused) exitPausedInteraction();
  updatePausedUi();
}

function updatePausedUi() {
  if (!overlay || !sourceLine) return;
  const interactive = Boolean(settings.enabled && settings.dictionaryEnabled && videoPaused && lastSource);
  overlay.classList.toggle("nf-zh-paused", interactive);
  sourceLine.classList.toggle("nf-zh-hidden", !interactive);
  if (!interactive) {
    blockDrag = null;
    sourceLine.querySelectorAll(".nf-zh-word-selected").forEach((node) => node.classList.remove("nf-zh-word-selected"));
    closeInteractivePanels();
  }
}

function exitPausedInteraction() {
  videoPaused = false;
  blockDrag = null;
  sourceLine?.querySelectorAll(".nf-zh-word-selected").forEach((node) => node.classList.remove("nf-zh-word-selected"));
  const selection = globalThis.getSelection?.();
  if (selectionInsideOverlay(selection)) selection.removeAllRanges();
  closeInteractivePanels();
}

function selectionBelongsToSource(selection) {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  return sourceLine.contains(range.commonAncestorContainer);
}

function selectionInsideOverlay(selection) {
  if (!selection || !selection.rangeCount || !overlay) return false;
  return overlay.contains(selection.anchorNode) || overlay.contains(selection.focusNode);
}

function handleSelectionMouseUp(event) {
  if (!videoPaused || !settings.dictionaryEnabled || event.target.closest?.(".nf-zh-dictionary, .nf-zh-anki-editor")) {
    blockDrag = null;
    return;
  }
  if (blockDrag) {
    const drag = blockDrag;
    blockDrag = null;
    const token = event.target.closest?.(".nf-zh-word-block");
    sourceLine.querySelectorAll(".nf-zh-word-selected").forEach((node) => node.classList.remove("nf-zh-word-selected"));
    if ((!token && event.target !== sourceLine) || drag.source !== lastSource) return;
    if (token && !sourceLine.contains(token)) return;
    const end = token ? Number(token.dataset.blockIndex) : drag.end;
    const term = SubtitleShared.wordBlockRange(wordBlockParts, drag.start, end);
    if (term) {
      const rect = blockRangeRect(drag.start, end);
      if (drag.start === end) startSelectedLookup(term, lastSource, rect, "word");
      else showSelectionConfirmation(term, lastSource, rect, ["phrase"]);
    }
    return;
  }
  if (wordBlockParts) return;
  const selection = globalThis.getSelection?.();
  if (!selectionBelongsToSource(selection)) return;
  const term = SubtitleShared.normalizeSelection(selection.toString());
  if (!term) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  showSelectionConfirmation(term, lastSource, rect, ["word", "phrase"]);
}

function renderSourceLine(text) {
  blockDrag = null;
  wordBlockParts = SubtitleShared.tokenizeWordBlocks(text);
  sourceLine.classList.toggle("nf-zh-block-mode", Boolean(wordBlockParts));
  if (!wordBlockParts) { sourceLine.textContent = text; return; }
  const fragment = document.createDocumentFragment();
  wordBlockParts.forEach((part, index) => {
    if (!part.word) { fragment.append(document.createTextNode(part.text)); return; }
    const span = document.createElement("span");
    span.className = "nf-zh-word-block";
    span.dataset.blockIndex = String(index);
    span.textContent = part.text;
    fragment.append(span);
  });
  sourceLine.replaceChildren(fragment);
}

function beginWordBlockDrag(event) {
  if (!videoPaused || !settings.dictionaryEnabled || !wordBlockParts || event.button !== 0) return;
  const token = event.target.closest?.(".nf-zh-word-block");
  if (!token) return;
  event.preventDefault();
  const start = Number(token.dataset.blockIndex);
  blockDrag = { start, end: start, source: lastSource };
  token.classList.add("nf-zh-word-selected");
}

function updateWordBlockDrag(event) {
  if (!blockDrag) return;
  const token = event.target.closest?.(".nf-zh-word-block");
  if (!token || !sourceLine.contains(token)) return;
  blockDrag.end = Number(token.dataset.blockIndex);
  const low = Math.min(blockDrag.start, blockDrag.end); const high = Math.max(blockDrag.start, blockDrag.end);
  sourceLine.querySelectorAll(".nf-zh-word-block").forEach((node) => {
    const index = Number(node.dataset.blockIndex);
    node.classList.toggle("nf-zh-word-selected", index >= low && index <= high);
  });
}

function blockRangeRect(start, end) {
  const first = sourceLine.querySelector(`[data-block-index="${Math.min(start, end)}"]`);
  const last = sourceLine.querySelector(`[data-block-index="${Math.max(start, end)}"]`);
  if (!first || !last) return sourceLine.getBoundingClientRect();
  const a = first.getBoundingClientRect(); const b = last.getBoundingClientRect();
  return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
}

function uiText(zh, en) { return settings.uiLanguage === "en" ? en : zh; }

function startSelectedLookup(term, sentence, rect, kind) {
  const issue = SubtitleShared.selectionIssue(term, kind);
  if (issue) { showDictionaryShell(rect, term, issue); return; }
  requestDictionary(term, sentence, rect, kind);
}

function showSelectionConfirmation(term, sentence, rect, kinds) {
  const available = kinds.filter((kind) => !SubtitleShared.selectionIssue(term, kind));
  if (!available.length) { showDictionaryShell(rect, term, SubtitleShared.selectionIssue(term, kinds.at(-1))); return; }
  showDictionaryShell(rect, term, uiText("请确认选中的内容和查询类型", "Confirm the selected text and lookup type"));
  for (const kind of available) {
    const label = kind === "word" ? uiText("查单词", "Look up word") : uiText("查短语", "Look up phrase");
    dictionaryPanel.append(panelButton(label, () => startSelectedLookup(term, sentence, rect, kind), "nf-zh-secondary"));
  }
  dictionaryPanel.append(panelButton(uiText("取消", "Cancel"), closeInteractivePanels, "nf-zh-secondary"));
  positionDictionaryPanel();
}

async function requestDictionary(term, sentence, rect, kind = "word") {
  const version = ++lookupVersion;
  if (lookupRequestId) chrome.runtime.sendMessage({ type: "CANCEL_LOOKUP", requestId: lookupRequestId }).catch(() => {});
  lookupRequestId = `lookup-${Date.now()}-${version}`;
  showDictionaryShell(rect, term, uiText("正在查询…", "Looking up…"));
  try {
    const visibleTranslation = translatedLine.textContent.trim();
    const videoSentenceTranslation = translatedSource === sentence && visibleTranslation && visibleTranslation !== "..." ? visibleTranslation : "";
    const response = await chrome.runtime.sendMessage({ type: "LOOKUP_WORD", requestId: lookupRequestId, term, kind, sentence, videoSentenceTranslation, source: settings.source, target: settings.target });
    if (version !== lookupVersion || !videoPaused) return;
    if (!response?.ok) throw new Error(response?.error || uiText("查词失败", "Lookup failed"));
    lastDictionaryEntry = {
      ...response.entry,
      videoSentence: sentence,
      sourceTitle: document.title
    };
    renderDictionary(lastDictionaryEntry);
  } catch (error) {
    if (version !== lookupVersion || !videoPaused) return;
    renderPanelMessage(dictionaryPanel, error.message, true);
  }
}

function showDictionaryShell(rect, term, message) {
  editorPanel.hidden = true;
  dictionaryPanel.hidden = false;
  dictionaryPanel.replaceChildren();
  const header = document.createElement("div"); header.className = "nf-zh-panel-header";
  const title = document.createElement("strong"); title.textContent = term;
  const status = document.createElement("p"); status.textContent = message;
  header.append(title, panelButton("×", closeInteractivePanels, "nf-zh-close"));
  dictionaryPanel.append(header, status);
  dictionaryAnchor = rect ? { left: rect.left, top: rect.top, bottom: rect.bottom } : null;
  positionDictionaryPanel();
}

function renderDictionary(entry) {
  dictionaryPanel.replaceChildren();
  const header = document.createElement("div"); header.className = "nf-zh-panel-header";
  const word = document.createElement("strong"); word.textContent = entry.term || entry.normalizedTerm;
  const close = panelButton("×", closeInteractivePanels, "nf-zh-close"); header.append(word, close);
  dictionaryPanel.append(header);
  if (entry.pronunciation || entry.partOfSpeech) appendText(dictionaryPanel, [entry.pronunciation, entry.partOfSpeech].filter(Boolean).join(" · "), "nf-zh-meta");
  if (entry.formNote) appendText(dictionaryPanel, `${uiText("词形：", "Form: ")}${entry.formNote}`, "nf-zh-meta");
  for (const definition of entry.definitions || []) appendText(dictionaryPanel, `• ${definition}`);
  // The definitions already explain the word. Keep contextualMeaning in the
  // data for Anki, but avoid repeating a near-identical definition in the UI.
  appendBilingualExample(dictionaryPanel, uiText("视频原句", "Video sentence"), entry.videoSentence, entry.videoSentenceTranslation);
  appendBilingualExample(dictionaryPanel, uiText("新例句", "New example"), entry.generatedExample, entry.generatedExampleTranslation);
  dictionaryPanel.append(panelButton(
    settings.ankiEnabled ? uiText("添加到 Anki", "Add to Anki") : uiText("设置 Anki", "Set up Anki"),
    () => settings.ankiEnabled ? openAnkiEditor(entry) : openAnkiSettings(),
    "nf-zh-primary"
  ));
  positionDictionaryPanel();
}

async function openAnkiSettings() {
  const response = await chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  if (!response?.ok) renderPanelMessage(dictionaryPanel, response?.error || uiText("无法打开设置", "Could not open settings"), true);
}

function positionDictionaryPanel() {
  if (!dictionaryPanel || dictionaryPanel.hidden || !dictionaryAnchor) return;
  // Measure after rendering because definitions and examples change the height.
  dictionaryPanel.style.maxHeight = `${Math.max(80, window.innerHeight - 16)}px`;
  const measured = dictionaryPanel.getBoundingClientRect();
  const position = SubtitleShared.computeFloatingPosition(
    dictionaryAnchor,
    { width: measured.width, height: measured.height },
    { width: window.innerWidth, height: window.innerHeight }
  );
  dictionaryPanel.style.left = `${position.left}px`;
  dictionaryPanel.style.top = `${position.top}px`;
  dictionaryPanel.style.maxHeight = `${Math.min(position.maxHeight, window.innerHeight - 16)}px`;
  dictionaryPanel.dataset.placement = position.placement;
}

function appendText(parent, text, className = "") { const p = document.createElement("p"); p.className = className; p.textContent = text || ""; parent.append(p); }
function appendLabeled(parent, label, text) { if (!text) return; const wrap = document.createElement("div"); const strong = document.createElement("b"); strong.textContent = label; const p = document.createElement("p"); p.textContent = text; wrap.append(strong, p); parent.append(wrap); }
function appendBilingualExample(parent, label, original, translation) {
  if (!original && !translation) return;
  const wrap = document.createElement("div"); wrap.className = "nf-zh-example";
  const strong = document.createElement("b"); strong.textContent = label; wrap.append(strong);
  if (original) appendText(wrap, original, "nf-zh-example-original");
  if (translation && translation !== original) {
    const translated = document.createElement("p"); translated.className = "nf-zh-example-translation";
    const label = document.createElement("span"); label.className = "nf-zh-example-label"; label.textContent = uiText("译文：", "Translation: ");
    const text = document.createElement("span"); text.textContent = translation;
    translated.append(label, text); wrap.append(translated);
  }
  parent.append(wrap);
}
function panelButton(label, handler, className = "") { const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = label; button.addEventListener("click", handler); return button; }
function renderPanelMessage(panel, message, error = false) { panel.replaceChildren(); const p = document.createElement("p"); p.className = error ? "nf-zh-error" : ""; p.textContent = message; panel.append(p, panelButton("×", closeInteractivePanels, "nf-zh-close")); }

async function openAnkiEditor(entry) {
  if (!videoPaused) return;
  dictionaryPanel.hidden = true; editorPanel.hidden = false; editorPanel.replaceChildren();
  const heading = document.createElement("div"); heading.className = "nf-zh-panel-header";
  const title = document.createElement("strong"); title.textContent = uiText("添加到 Anki", "Add to Anki"); heading.append(title, panelButton("×", closeInteractivePanels, "nf-zh-close")); editorPanel.append(heading);
  const deck = addEditorField("deck", uiText("牌组", "Deck"), sessionDeck || settings.ankiDeck, "select");
  const fields = {
    term: addEditorField("term", uiText("词语", "Term"), entry.term || entry.normalizedTerm),
    ...(entry.formNote ? { formNote: addEditorField("formNote", uiText("词形说明", "Word form"), entry.formNote) } : {}),
    partOfSpeech: addEditorField("partOfSpeech", uiText("词性", "Part of speech"), entry.partOfSpeech),
    meaning: addEditorField("meaning", uiText("释义", "Meaning"), (entry.definitions || []).join("；"), "textarea"),
    videoSentence: addEditorField("videoSentence", uiText("视频原句", "Video sentence"), entry.videoSentence, "textarea"),
    videoTranslation: addEditorField("videoTranslation", uiText("视频原句译文", "Video sentence translation"), entry.videoSentenceTranslation, "textarea"),
    generatedExample: addEditorField("generatedExample", uiText("新例句", "New example"), entry.generatedExample, "textarea"),
    exampleTranslation: addEditorField("exampleTranslation", uiText("例句翻译", "Example translation"), entry.generatedExampleTranslation, "textarea"),
    tags: addEditorField("tags", uiText("标签", "Tags"), [settings.ankiTags, ...SubtitleShared.sourceTags(entry.sourceTitle, location.hostname)].filter(Boolean).join(" "))
  };
  const newDeck = panelButton(uiText("新建牌组", "New deck"), () => createDeckFromEditor(deck), "nf-zh-secondary");
  const submit = panelButton(uiText("确认添加", "Confirm add"), () => submitAnkiNote(deck, fields, submit), "nf-zh-primary");
  editorPanel.append(newDeck, submit);
  try {
    const decks = await ankiAction("deckNames");
    deck.replaceChildren(...decks.map((name) => { const option = document.createElement("option"); option.value = option.textContent = name; return option; }));
    deck.value = sessionDeck || settings.ankiDeck;
    if (!deck.value && decks[0]) deck.value = decks[0];
  } catch (error) { renderEditorStatus(error.message, true); }
}

function addEditorField(name, labelText, value, kind = "input") {
  const label = document.createElement("label"); label.textContent = labelText;
  const field = kind === "textarea" ? document.createElement("textarea") : kind === "select" ? document.createElement("select") : document.createElement("input");
  field.name = name; if (kind !== "select") field.value = value || ""; label.append(field); editorPanel.append(label); return field;
}

async function createDeckFromEditor(deckSelect) {
  const name = prompt(uiText("请输入新牌组名称，例如 Subtitle Learning::影片名", "Enter a new deck name, e.g. Subtitle Learning::Movie"));
  if (!name?.trim()) return;
  try { await ankiAction("createDeck", { deck: name.trim() }); const option = document.createElement("option"); option.value = option.textContent = name.trim(); deckSelect.append(option); deckSelect.value = name.trim(); renderEditorStatus(uiText("牌组已创建", "Deck created")); } catch (error) { renderEditorStatus(error.message, true); }
}

async function submitAnkiNote(deck, fields, button) {
  if (button.disabled) return; button.disabled = true;
  try {
    const values = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "tags").map(([key, field]) => [key, field.value]));
    const tags = fields.tags.value.split(/\s+/).filter(Boolean);
    const note = AnkiLib.buildNote({ deckName: deck.value, modelName: "Basic", fieldMap: { term: "Front", cardBack: "Back" }, values, tags });
    const response = await chrome.runtime.sendMessage({ type: "ADD_ANKI_NOTE", note, ankiUrl: settings.ankiUrl });
    if (!response?.ok) throw new Error(response?.error || uiText("添加失败", "Add failed"));
    const noteId = response.noteId;
    sessionDeck = deck.value;
    renderPanelMessage(editorPanel, uiText(`已添加到 Anki（${noteId}）`, `Added to Anki (${noteId})`));
  } catch (error) { renderEditorStatus(error.message, true); button.disabled = false; }
}

async function ankiAction(action, params = {}) {
  const response = await chrome.runtime.sendMessage({ type: "ANKI_ACTION", action, params, ankiUrl: settings.ankiUrl });
  if (!response?.ok) throw new Error(response?.error || "AnkiConnect error");
  return response.result;
}

function renderEditorStatus(message, error = false) {
  let status = editorPanel.querySelector(".nf-zh-editor-status");
  if (!status) { status = document.createElement("p"); status.className = "nf-zh-editor-status"; editorPanel.append(status); }
  status.classList.toggle("nf-zh-error", error); status.textContent = message;
}

function closeInteractivePanels() {
  lookupVersion++;
  if (lookupRequestId) chrome.runtime?.sendMessage?.({ type: "CANCEL_LOOKUP", requestId: lookupRequestId }).catch(() => {});
  lookupRequestId = null; lastDictionaryEntry = null;
  dictionaryAnchor = null;
  if (dictionaryPanel) { dictionaryPanel.hidden = true; dictionaryPanel.replaceChildren(); }
  if (editorPanel) { editorPanel.hidden = true; editorPanel.replaceChildren(); }
}
