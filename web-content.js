(function () {
  const WEB_DEFAULTS = {
    enabled: true,
    webSelectionEnabled: true,
    webAutoTranslateEnabled: false,
    source: "auto",
    target: "zh",
    serviceUrl: "http://127.0.0.1:8080",
    uiLanguage: "zh",
    dictionaryEnabled: true,
    ankiEnabled: false,
    ankiUrl: "http://127.0.0.1:8765",
    ankiDeck: "Default",
    ankiModel: "Basic",
    ankiFieldMap: { term: "Front", cardBack: "Back" },
    ankiTags: "subtitle-learning"
  };

  const webNamespace = globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random()}`;
  const webPageCache = new Map();
  const webFragmentCache = new Map();

  let webSettings = { ...WEB_DEFAULTS };
  let rootContainer = null;
  let triggerButton = null;
  let selectionPanel = null;
  let webAnkiEditor = null;
  let pageStatusPill = null;

  let pendingSelection = null;
  let panelAnchorRect = null;
  let activeLookupRequestId = null;
  let activeFragmentRequestId = null;
  let activeSelectionTranslateRequestId = null;
  let selectionRequestVersion = 0;
  let nextWebRequestId = 0;
  let lastWebDictionaryEntry = null;
  let webSessionDeck = "";

  // Full-page bilingual translation state
  let pageTranslationActive = false;
  let pageSessionVersion = 0;
  let pageIntersectionObserver = null;
  let pageMutationObserver = null;
  let pageMutationTimer = null;
  const pageQueue = [];
  const activePageRequestIds = new Set();
  let activePageWorkers = 0;
  let pageTranslatedCount = 0;
  let pageQueuedCount = 0;
  const MAX_CONCURRENT_PAGE_REQUESTS = 2;
  let lastKnownUrl = location.href;

  // Filter out tiny embedded widgets/advertisements in subframes
  if (window !== window.top) {
    if (window.innerWidth < 250 || window.innerHeight < 200) {
      return;
    }
  }

  initWebTranslator();

  async function initWebTranslator() {
    if (!document.documentElement) return;
    webSettings = await chrome.storage.sync.get(WEB_DEFAULTS);
    ensureRootUi();

    chrome.storage.onChanged.addListener((changes) => {
      for (const [key, value] of Object.entries(changes)) {
        webSettings[key] = value.newValue;
      }
      if (changes.serviceUrl || changes.source || changes.target) {
        webPageCache.clear();
        webFragmentCache.clear();
      }
      if (changes.webSelectionEnabled && !webSettings.webSelectionEnabled) {
        hideSelectionTrigger();
      }
      updatePageStatusPill();
    });

    checkAutoPageTranslate();

    // Listen for SPA route changes (pushState, replaceState, popstate, or hash change)
    window.addEventListener("popstate", onUrlChange);
    window.addEventListener("hashchange", onUrlChange);
    setInterval(pollUrlChange, 600);

    document.addEventListener("mouseup", handleDocumentMouseUp, true);
    document.addEventListener("mousedown", handleDocumentMouseDown, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideSelectionTrigger();
        closeWebPanels();
      }
    });
    window.addEventListener("scroll", () => {
      if (triggerButton && !triggerButton.hidden) hideSelectionTrigger();
      if (selectionPanel && !selectionPanel.hidden) positionWebPanel(selectionPanel);
    }, { passive: true, capture: true });
    window.addEventListener("resize", () => {
      if (selectionPanel && !selectionPanel.hidden) positionWebPanel(selectionPanel);
    }, { passive: true });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "TOGGLE_PAGE_TRANSLATION") {
        togglePageTranslation();
        sendResponse({ ok: true, active: pageTranslationActive });
        return false;
      }
      if (message?.type === "GET_PAGE_TRANSLATION_STATE") {
        sendResponse({ ok: true, active: pageTranslationActive });
        return false;
      }
      if (message?.type === "TRANSLATE_SELECTION_FROM_MENU") {
        handleMenuSelectionTranslate(message.selectionText);
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  }

  function pollUrlChange() {
    if (location.href !== lastKnownUrl) {
      onUrlChange();
    }
  }

  function onUrlChange() {
    if (location.href === lastKnownUrl) return;
    lastKnownUrl = location.href;
    checkAutoPageTranslate();
  }

  function uiText(zh, en) {
    return webSettings.uiLanguage === "en" ? en : zh;
  }

  function ensureRootUi() {
    if (rootContainer) return;
    rootContainer = document.createElement("div");
    rootContainer.id = "lai-web-translator-root";
    rootContainer.setAttribute("translate", "no");
    rootContainer.className = "notranslate";
    rootContainer.innerHTML = `
      <button type="button" id="lai-selection-trigger" class="lai-selection-trigger" hidden title="翻译 / 查词">译</button>
      <section id="lai-selection-panel" class="lai-web-panel" hidden></section>
      <section id="lai-anki-editor" class="lai-web-panel lai-anki-modal" hidden></section>
      <div id="lai-page-status" class="lai-page-status" hidden></div>
    `;
    document.documentElement.appendChild(rootContainer);
    triggerButton = rootContainer.querySelector("#lai-selection-trigger");
    selectionPanel = rootContainer.querySelector("#lai-selection-panel");
    webAnkiEditor = rootContainer.querySelector("#lai-anki-editor");
    pageStatusPill = rootContainer.querySelector("#lai-page-status");

    triggerButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    triggerButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!pendingSelection) return;
      const current = pendingSelection;
      hideSelectionTrigger();
      openSelectionPanel(current);
    });
  }

  function isEditableTarget(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function isInsideExtensionUi(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!el) return false;
    return Boolean(el.closest("#nf-zh-overlay, #lai-web-translator-root"));
  }

  function handleDocumentMouseDown(event) {
    if (isInsideExtensionUi(event.target)) return;
    if (triggerButton && !triggerButton.hidden) {
      hideSelectionTrigger();
    }
    if ((selectionPanel && !selectionPanel.hidden) || (webAnkiEditor && !webAnkiEditor.hidden)) {
      closeWebPanels();
    }
  }

  function handleDocumentMouseUp(event) {
    if (!webSettings.webSelectionEnabled) return;
    if (event.button !== 0) return;
    if (isInsideExtensionUi(event.target) || isEditableTarget(event.target)) return;

    setTimeout(() => {
      const selection = globalThis.getSelection?.();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      if (isInsideExtensionUi(selection.anchorNode) || isInsideExtensionUi(selection.focusNode)) return;
      if (isEditableTarget(selection.anchorNode) || isEditableTarget(selection.focusNode)) return;

      const rawText = selection.toString();
      const classified = WebTranslateLib.classifySelection(rawText);
      if (!classified.kind) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const sentence = classified.kind === "lookup"
        ? extractSelectionContextSentence(selection, classified.text)
        : "";

      pendingSelection = {
        kind: classified.kind,
        text: classified.text,
        sentence,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        },
        mouseX: event.clientX,
        mouseY: event.clientY
      };
      showSelectionTrigger(pendingSelection);
    }, 10);
  }

  function extractSelectionContextSentence(selection, selectedTerm) {
    const anchorEl = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    const block = anchorEl?.closest?.("p, li, blockquote, dd, dt, h1, h2, h3, h4, h5, h6, td, th, figcaption, article, section, div") || anchorEl;
    const blockText = block ? WebTranslateLib.readCleanElementText(block) : "";
    return WebTranslateLib.extractSentenceFromText(blockText || selection.toString(), selectedTerm, 400);
  }

  function showSelectionTrigger(selectionInfo) {
    ensureRootUi();
    triggerButton.hidden = false;
    triggerButton.title = uiText("点击翻译 / 查词", "Click to translate / look up");
    const size = 30;
    const margin = 8;
    const desiredLeft = (selectionInfo.mouseX || selectionInfo.rect.right) + 6;
    const desiredTop = (selectionInfo.mouseY || selectionInfo.rect.bottom) + 8;
    const left = Math.max(margin, Math.min(window.innerWidth - size - margin, desiredLeft));
    const top = Math.max(margin, Math.min(window.innerHeight - size - margin, desiredTop));
    triggerButton.style.left = `${left}px`;
    triggerButton.style.top = `${top}px`;
  }

  function hideSelectionTrigger() {
    pendingSelection = null;
    if (triggerButton) triggerButton.hidden = true;
  }

  function handleMenuSelectionTranslate(fallbackText) {
    ensureRootUi();
    hideSelectionTrigger();
    const selection = globalThis.getSelection?.();
    const hasDomSelection = selection && !selection.isCollapsed && selection.rangeCount > 0;
    const rawText = hasDomSelection ? selection.toString() : String(fallbackText || "");
    const classified = WebTranslateLib.classifySelection(rawText);
    if (!classified.kind) return;

    let rect = hasDomSelection ? selection.getRangeAt(0).getBoundingClientRect() : null;
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const cx = Math.round(window.innerWidth / 2);
      rect = { left: cx - 40, right: cx + 40, top: 80, bottom: 104, width: 80, height: 24 };
    }
    const sentence = classified.kind === "lookup" && hasDomSelection
      ? extractSelectionContextSentence(selection, classified.text)
      : classified.text;

    openSelectionPanel({
      kind: classified.kind,
      text: classified.text,
      sentence,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    });
  }

  function openSelectionPanel(selectionInfo, forcedKind = "") {
    ensureRootUi();
    const kind = forcedKind || selectionInfo.kind;
    panelAnchorRect = selectionInfo.rect;
    if (kind === "lookup") {
      requestWebLookup(selectionInfo.text, selectionInfo.sentence || selectionInfo.text, selectionInfo);
    } else {
      requestWebSelectionTranslation(selectionInfo.text, selectionInfo);
    }
  }

  async function requestWebLookup(term, sentence, selectionInfo) {
    const version = ++selectionRequestVersion;
    cancelWebSelectionRequests();
    lastWebDictionaryEntry = null;

    const requestId = `weblookup-${webNamespace}-${++nextWebRequestId}`;
    activeLookupRequestId = requestId;

    showWebPanelShell(
      term,
      uiText("正在查询释义…", "Looking up meaning…"),
      panelButton(
        uiText("整段直译", "Direct translate"),
        () => openSelectionPanel(selectionInfo, "translate"),
        "lai-btn-ghost"
      )
    );

    try {
      const response = await chrome.runtime.sendMessage({
        type: "LOOKUP_WORD",
        requestId,
        term,
        sentence,
        context: [],
        source: webSettings.source,
        target: webSettings.target
      });
      if (version !== selectionRequestVersion) return;
      if (!response?.ok) throw new Error(response?.error || uiText("查词失败", "Lookup failed"));

      lastWebDictionaryEntry = {
        ...response.entry,
        videoSentence: sentence && sentence !== term ? sentence : "",
        videoSentenceTranslation: "",
        sourceTitle: document.title
      };
      renderWebDictionary(lastWebDictionaryEntry, selectionInfo);
      if (lastWebDictionaryEntry.videoSentence) {
        await translateWebLookupSentence(lastWebDictionaryEntry, version, selectionInfo);
      }
    } catch (error) {
      if (version !== selectionRequestVersion) return;
      renderWebPanelError(term, error.message, selectionInfo);
    } finally {
      if (activeLookupRequestId === requestId) activeLookupRequestId = null;
    }
  }

  async function translateWebLookupSentence(entry, version, selectionInfo) {
    const sentence = entry.videoSentence;
    if (!sentence) return;
    const cacheKey = JSON.stringify([webSettings.serviceUrl, webSettings.source, webSettings.target, sentence]);
    let requestId = null;
    try {
      let translation = webFragmentCache.get(cacheKey);
      if (!translation) {
        requestId = `webfragment-${webNamespace}-${++nextWebRequestId}`;
        activeFragmentRequestId = requestId;
        const response = await chrome.runtime.sendMessage({
          type: "TRANSLATE_FRAGMENT",
          requestId,
          text: sentence,
          source: webSettings.source,
          target: webSettings.target
        });
        if (version !== selectionRequestVersion || lastWebDictionaryEntry !== entry) return;
        if (!response?.ok) throw new Error(response?.error || "例句翻译失败");
        translation = response.translatedText;
        webFragmentCache.set(cacheKey, translation);
        if (webFragmentCache.size > 200) webFragmentCache.delete(webFragmentCache.keys().next().value);
      }
      if (version !== selectionRequestVersion || lastWebDictionaryEntry !== entry) return;
      entry.videoSentenceTranslation = translation;
      if (!selectionPanel.hidden) renderWebDictionary(entry, selectionInfo);
      const editorField = webAnkiEditor?.querySelector('[name="videoTranslation"]');
      if (editorField && !editorField.value) editorField.value = translation;
    } catch {
      // Ignore optional context sentence translation errors so dictionary lookup still succeeds
    } finally {
      if (activeFragmentRequestId === requestId) activeFragmentRequestId = null;
    }
  }

  async function requestWebSelectionTranslation(text, selectionInfo) {
    const version = ++selectionRequestVersion;
    cancelWebSelectionRequests();
    const requestId = `websel-${webNamespace}-${++nextWebRequestId}`;
    activeSelectionTranslateRequestId = requestId;

    const canSwitchToLookup = !SubtitleShared.selectionIssue(SubtitleShared.normalizeSelection(text, 80), "auto");
    const extraHeaderBtn = canSwitchToLookup
      ? panelButton(uiText("查词模式", "Dictionary mode"), () => openSelectionPanel(selectionInfo, "lookup"), "lai-btn-ghost")
      : null;

    showWebPanelShell(
      uiText("选中文本翻译", "Selected Text Translation"),
      uiText("正在翻译…", "Translating…"),
      extraHeaderBtn
    );

    try {
      const cacheKey = JSON.stringify([webSettings.serviceUrl, webSettings.source, webSettings.target, text]);
      let translatedText = webPageCache.get(cacheKey);
      if (!translatedText) {
        const response = await chrome.runtime.sendMessage({
          type: "TRANSLATE_WEB_TEXT",
          requestId,
          text,
          source: webSettings.source,
          target: webSettings.target
        });
        if (version !== selectionRequestVersion) return;
        if (!response?.ok) throw new Error(response?.error || uiText("翻译失败", "Translation failed"));
        translatedText = response.translatedText;
        webPageCache.set(cacheKey, translatedText);
      }
      if (version !== selectionRequestVersion) return;
      renderWebSelectionTranslation(text, translatedText, selectionInfo, extraHeaderBtn);
    } catch (error) {
      if (version !== selectionRequestVersion) return;
      renderWebPanelError(uiText("选中文本翻译", "Selected Text Translation"), error.message, null);
    } finally {
      if (activeSelectionTranslateRequestId === requestId) activeSelectionTranslateRequestId = null;
    }
  }

  function showWebPanelShell(titleText, statusMessage, extraHeaderButton = null) {
    webAnkiEditor.hidden = true;
    selectionPanel.hidden = false;
    selectionPanel.replaceChildren();
    const header = buildPanelHeader(titleText, extraHeaderButton);
    const status = document.createElement("p");
    status.className = "lai-panel-loading";
    status.textContent = statusMessage;
    selectionPanel.append(header, status);
    positionWebPanel(selectionPanel);
  }

  function buildPanelHeader(titleText, extraButton = null) {
    const header = document.createElement("div");
    header.className = "lai-panel-header";
    const title = document.createElement("strong");
    title.className = "lai-panel-title";
    title.textContent = titleText;
    const actions = document.createElement("div");
    actions.className = "lai-panel-header-actions";
    if (extraButton) actions.append(extraButton);
    actions.append(panelButton("×", closeWebPanels, "lai-btn-close"));
    header.append(title, actions);
    return header;
  }

  function renderWebDictionary(entry, selectionInfo) {
    selectionPanel.replaceChildren();
    const switchBtn = panelButton(
      uiText("整段直译", "Direct translate"),
      () => openSelectionPanel(selectionInfo, "translate"),
      "lai-btn-ghost"
    );
    selectionPanel.append(buildPanelHeader(entry.term, switchBtn));

    const meaningWrap = document.createElement("div");
    meaningWrap.className = "lai-panel-section";
    const meaningLabel = document.createElement("b");
    meaningLabel.textContent = uiText("释义", "Meaning");
    const meaningText = document.createElement("p");
    meaningText.className = "lai-panel-meaning";
    meaningText.textContent = entry.meaning;
    meaningWrap.append(meaningLabel, meaningText);
    selectionPanel.append(meaningWrap);

    if (entry.videoSentence) {
      const exampleWrap = document.createElement("div");
      exampleWrap.className = "lai-panel-example";
      const exLabel = document.createElement("b");
      exLabel.textContent = uiText("网页原句", "Context sentence");
      const exOrig = document.createElement("p");
      exOrig.className = "lai-example-original";
      exOrig.textContent = entry.videoSentence;
      exampleWrap.append(exLabel, exOrig);
      if (entry.videoSentenceTranslation && entry.videoSentenceTranslation !== entry.videoSentence) {
        const exTrans = document.createElement("p");
        exTrans.className = "lai-example-translation";
        exTrans.textContent = `${uiText("译文：", "Translation: ")}${entry.videoSentenceTranslation}`;
        exampleWrap.append(exTrans);
      }
      selectionPanel.append(exampleWrap);
    }

    const footer = document.createElement("div");
    footer.className = "lai-panel-footer";
    const ankiBtn = panelButton(
      webSettings.ankiEnabled ? uiText("添加到 Anki", "Add to Anki") : uiText("设置 Anki", "Set up Anki"),
      () => (webSettings.ankiEnabled ? openWebAnkiEditor(entry) : chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" })),
      "lai-btn-primary"
    );
    const copyBtn = panelButton(
      uiText("复制释义", "Copy"),
      () => copyTextWithFeedback(copyBtn, `${entry.term}: ${entry.meaning}`),
      "lai-btn-secondary"
    );
    footer.append(ankiBtn, copyBtn);
    selectionPanel.append(footer);
    positionWebPanel(selectionPanel);
  }

  function renderWebSelectionTranslation(originalText, translatedText, _selectionInfo, extraHeaderBtn) {
    selectionPanel.replaceChildren();
    selectionPanel.append(buildPanelHeader(uiText("选中文本翻译", "Selected Text Translation"), extraHeaderBtn));

    const origBox = document.createElement("div");
    origBox.className = "lai-selection-source";
    origBox.textContent = originalText;

    const transBox = document.createElement("div");
    transBox.className = "lai-selection-target";
    transBox.textContent = translatedText;

    const footer = document.createElement("div");
    footer.className = "lai-panel-footer";
    const copyBtn = panelButton(
      uiText("复制译文", "Copy translation"),
      () => copyTextWithFeedback(copyBtn, translatedText),
      "lai-btn-primary"
    );
    footer.append(copyBtn);

    selectionPanel.append(origBox, transBox, footer);
    positionWebPanel(selectionPanel);
  }

  function renderWebPanelError(titleText, errorMessage, selectionInfo) {
    selectionPanel.replaceChildren();
    const fallbackBtn = selectionInfo
      ? panelButton(uiText("整段直译", "Direct translate"), () => openSelectionPanel(selectionInfo, "translate"), "lai-btn-ghost")
      : null;
    selectionPanel.append(buildPanelHeader(titleText, fallbackBtn));
    const err = document.createElement("p");
    err.className = "lai-panel-error";
    err.textContent = errorMessage;
    selectionPanel.append(err);
    positionWebPanel(selectionPanel);
  }

  async function copyTextWithFeedback(button, text) {
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = uiText("已复制", "Copied!");
      setTimeout(() => { button.textContent = previous; }, 1200);
    } catch {
      // Clipboard write may fail on insecure origins
    }
  }

  function positionWebPanel(panel) {
    if (!panel || panel.hidden || !panelAnchorRect) return;
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - 16)}px`;
    const measured = panel.getBoundingClientRect();
    const pos = SubtitleShared.computeFloatingPosition(
      panelAnchorRect,
      { width: measured.width || 340, height: measured.height || 180 },
      { width: window.innerWidth, height: window.innerHeight }
    );
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
    panel.style.maxHeight = `${Math.min(pos.maxHeight, window.innerHeight - 16)}px`;
  }

  async function openWebAnkiEditor(entry) {
    selectionPanel.hidden = true;
    webAnkiEditor.hidden = false;
    webAnkiEditor.replaceChildren();

    webAnkiEditor.append(buildPanelHeader(uiText("添加到 Anki", "Add to Anki")));
    const deck = addWebEditorField("deck", uiText("牌组", "Deck"), webSessionDeck || webSettings.ankiDeck, "select");
    const fields = {
      term: addWebEditorField("term", uiText("词语", "Term"), entry.term),
      meaning: addWebEditorField("meaning", uiText("释义", "Meaning"), entry.meaning, "textarea"),
      videoSentence: addWebEditorField("videoSentence", uiText("网页原句", "Web sentence"), entry.videoSentence, "textarea"),
      videoTranslation: addWebEditorField("videoTranslation", uiText("网页原句译文", "Sentence translation"), entry.videoSentenceTranslation, "textarea"),
      tags: addWebEditorField(
        "tags",
        uiText("标签", "Tags"),
        [
          webSettings.ankiTags,
          ...SubtitleShared.sourceTags(
            entry.sourceTitle,
            location.hostname,
            location.pathname.endsWith("/pdf-viewer.html") ? "source-pdf" : "source-web"
          )
        ].filter(Boolean).join(" ")
      )
    };

    const footer = document.createElement("div");
    footer.className = "lai-panel-footer";
    const newDeckBtn = panelButton(uiText("新建牌组", "New deck"), () => createWebDeck(deck), "lai-btn-secondary");
    const submitBtn = panelButton(uiText("确认添加", "Confirm add"), () => submitWebAnkiNote(deck, fields, submitBtn), "lai-btn-primary");
    footer.append(newDeckBtn, submitBtn);
    webAnkiEditor.append(footer);

    try {
      const decks = await invokeWebAnki("deckNames");
      deck.replaceChildren(...decks.map((name) => {
        const option = document.createElement("option");
        option.value = option.textContent = name;
        return option;
      }));
      deck.value = webSessionDeck || webSettings.ankiDeck;
      if (!deck.value && decks[0]) deck.value = decks[0];
    } catch (error) {
      renderWebEditorStatus(error.message, true);
    }
  }

  function addWebEditorField(name, labelText, value, kind = "input") {
    const label = document.createElement("label");
    label.className = "lai-editor-label";
    label.textContent = labelText;
    const field = kind === "textarea"
      ? document.createElement("textarea")
      : kind === "select"
        ? document.createElement("select")
        : document.createElement("input");
    field.name = name;
    if (kind !== "select") field.value = value || "";
    label.append(field);
    webAnkiEditor.append(label);
    return field;
  }

  async function createWebDeck(deckSelect) {
    const name = prompt(uiText("请输入新牌组名称，例如 Reading::Articles", "Enter a new deck name, e.g. Reading::Articles"));
    if (!name?.trim()) return;
    try {
      await invokeWebAnki("createDeck", { deck: name.trim() });
      const option = document.createElement("option");
      option.value = option.textContent = name.trim();
      deckSelect.append(option);
      deckSelect.value = name.trim();
      renderWebEditorStatus(uiText("牌组已创建", "Deck created"), false);
    } catch (error) {
      renderWebEditorStatus(error.message, true);
    }
  }

  async function submitWebAnkiNote(deck, fields, button) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      const values = Object.fromEntries(
        Object.entries(fields)
          .filter(([key]) => key !== "tags")
          .map(([key, field]) => [key, field.value])
      );
      values.exampleLabel = uiText("网页原句", "Web sentence");
      const tags = fields.tags.value.split(/\s+/).filter(Boolean);
      const note = AnkiLib.buildNote({
        deckName: deck.value,
        modelName: "Basic",
        fieldMap: { term: "Front", cardBack: "Back" },
        values,
        tags
      });
      const response = await chrome.runtime.sendMessage({
        type: "ADD_ANKI_NOTE",
        note,
        ankiUrl: webSettings.ankiUrl
      });
      if (!response?.ok) throw new Error(response?.error || uiText("添加失败", "Add failed"));
      webSessionDeck = deck.value;
      webAnkiEditor.replaceChildren(
        buildPanelHeader(uiText("添加到 Anki", "Add to Anki")),
        Object.assign(document.createElement("p"), {
          className: "lai-panel-meaning",
          textContent: uiText(`已添加到 Anki（${response.noteId}）`, `Added to Anki (${response.noteId})`)
        })
      );
    } catch (error) {
      renderWebEditorStatus(error.message, true);
      button.disabled = false;
    }
  }

  async function invokeWebAnki(action, params = {}) {
    const response = await chrome.runtime.sendMessage({
      type: "ANKI_ACTION",
      action,
      params,
      ankiUrl: webSettings.ankiUrl
    });
    if (!response?.ok) throw new Error(response?.error || "AnkiConnect error");
    return response.result;
  }

  function renderWebEditorStatus(message, isError) {
    let status = webAnkiEditor.querySelector(".lai-editor-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "lai-editor-status";
      webAnkiEditor.append(status);
    }
    status.classList.toggle("lai-panel-error", Boolean(isError));
    status.textContent = message;
  }

  function cancelWebSelectionRequests() {
    if (activeLookupRequestId) {
      chrome.runtime?.sendMessage?.({ type: "CANCEL_LOOKUP", requestId: activeLookupRequestId }).catch(() => {});
      activeLookupRequestId = null;
    }
    if (activeFragmentRequestId) {
      chrome.runtime?.sendMessage?.({ type: "CANCEL_FRAGMENT_TRANSLATION", requestId: activeFragmentRequestId }).catch(() => {});
      activeFragmentRequestId = null;
    }
    if (activeSelectionTranslateRequestId) {
      chrome.runtime?.sendMessage?.({ type: "CANCEL_WEB_TRANSLATION", requestId: activeSelectionTranslateRequestId }).catch(() => {});
      activeSelectionTranslateRequestId = null;
    }
  }

  function closeWebPanels() {
    selectionRequestVersion++;
    cancelWebSelectionRequests();
    lastWebDictionaryEntry = null;
    panelAnchorRect = null;
    if (selectionPanel) {
      selectionPanel.hidden = true;
      selectionPanel.replaceChildren();
    }
    if (webAnkiEditor) {
      webAnkiEditor.hidden = true;
      webAnkiEditor.replaceChildren();
    }
  }

  function panelButton(label, handler, className = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
  }

  // =========================================================================
  // Full-Page Immersive Bilingual Translation
  // =========================================================================

  function checkAutoPageTranslate() {
    if (!webSettings.webAutoTranslateEnabled) return;
    // Skip if on a video streaming page or internal pdf viewer
    const host = location.hostname;
    if (host === "www.netflix.com" || host === "www.youtube.com" || /(^|\.)primevideo\.com$/.test(host)) return;
    if (location.pathname.endsWith("/pdf-viewer.html")) return;

    // Check html lang attribute
    const docLang = (document.documentElement.lang || "").toLowerCase();
    const target = (webSettings.target || "zh").toLowerCase();
    if (target.startsWith("zh") && (docLang.startsWith("zh") || docLang.includes("chinese"))) return;
    if (target === "en" && docLang.startsWith("en")) return;
    if (target === "ja" && docLang.startsWith("ja")) return;

    // Sample top translatable blocks to ensure page has foreign text that needs translating
    setTimeout(() => {
      if (!webSettings.webAutoTranslateEnabled) return;
      const blocks = WebTranslateLib.collectTranslatableBlocks(document.body, webSettings.target);
      if (blocks.length >= 2) {
        if (!pageTranslationActive) {
          startPageTranslation();
        } else {
          // If translation is already active (SPA route change), scan new blocks
          observeTranslatableBlocks(document.body);
        }
      }
    }, 800);
  }

  function togglePageTranslation() {
    const pdfToggle = document.getElementById("toggleBilingualBtn");
    if (pdfToggle && !pdfToggle.disabled) {
      pdfToggle.click();
      pageTranslationActive = pdfToggle.classList.contains("active");
      return;
    }
    if (pageTranslationActive) {
      restorePageTranslation();
    } else {
      startPageTranslation();
    }
  }

  function startPageTranslation() {
    ensureRootUi();
    pageTranslationActive = true;
    const session = ++pageSessionVersion;
    pageTranslatedCount = 0;
    pageQueuedCount = 0;
    pageQueue.length = 0;

    pageIntersectionObserver = new IntersectionObserver((entries) => {
      if (!pageTranslationActive || session !== pageSessionVersion) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        pageIntersectionObserver?.unobserve(entry.target);
        enqueueBlockForTranslation(entry.target, session);
      }
    }, { rootMargin: "320px 0px" });

    observeTranslatableBlocks(document.body);

    pageMutationObserver = new MutationObserver(() => {
      if (!pageTranslationActive || session !== pageSessionVersion) return;
      clearTimeout(pageMutationTimer);
      pageMutationTimer = setTimeout(() => {
        if (pageTranslationActive && session === pageSessionVersion) {
          observeTranslatableBlocks(document.body);
        }
      }, 400);
    });
    pageMutationObserver.observe(document.body, { childList: true, subtree: true });

    updatePageStatusPill();
  }

  function observeTranslatableBlocks(root) {
    if (!pageIntersectionObserver || !root) return;
    const blocks = WebTranslateLib.collectTranslatableBlocks(root, webSettings.target);
    for (const block of blocks) {
      if (block.hasAttribute("data-lai-observed")) continue;
      block.setAttribute("data-lai-observed", "1");
      pageIntersectionObserver.observe(block);
    }
  }

  function enqueueBlockForTranslation(block, session) {
    if (!block || !block.isConnected) return;
    if (block.querySelector(":scope > [data-lai-bilingual]") || block.nextElementSibling?.hasAttribute?.("data-lai-bilingual")) return;
    if (block.closest?.("button, [role='button'], input, textarea, select")) return;
    if (block.querySelector?.("input, textarea, select, button, [role='button']")) return;
    const sourceText = WebTranslateLib.readCleanElementText(block);
    if (!WebTranslateLib.shouldTranslateText(sourceText, webSettings.target)) return;

    const badge = document.createElement("font");
    badge.className = "lai-bilingual-translation lai-bilingual-loading";
    badge.setAttribute("data-lai-bilingual", "1");
    badge.setAttribute("translate", "no");
    badge.textContent = uiText("正在翻译…", "Translating…");

    block.appendChild(badge);

    pageQueuedCount++;
    pageQueue.push({ block, badge, sourceText, session });
    updatePageStatusPill();
    pumpPageQueue(session);
  }

  function pumpPageQueue(session) {
    while (
      pageTranslationActive &&
      session === pageSessionVersion &&
      activePageWorkers < MAX_CONCURRENT_PAGE_REQUESTS &&
      pageQueue.length > 0
    ) {
      const task = pageQueue.shift();
      activePageWorkers++;
      translateBlockTask(task).finally(() => {
        activePageWorkers = Math.max(0, activePageWorkers - 1);
        if (pageTranslationActive && session === pageSessionVersion) {
          updatePageStatusPill();
          pumpPageQueue(session);
        }
      });
    }
  }

  async function translateBlockTask(task) {
    const { badge, sourceText, session } = task;
    if (!pageTranslationActive || session !== pageSessionVersion || !badge.isConnected) return;

    const cacheKey = JSON.stringify([webSettings.serviceUrl, webSettings.source, webSettings.target, sourceText]);
    if (webPageCache.has(cacheKey)) {
      badge.className = "lai-bilingual-translation";
      badge.textContent = webPageCache.get(cacheKey);
      pageTranslatedCount++;
      return;
    }

    const requestId = `webpage-${webNamespace}-${++nextWebRequestId}`;
    activePageRequestIds.add(requestId);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_WEB_TEXT",
        requestId,
        text: sourceText,
        source: webSettings.source,
        target: webSettings.target
      });
      if (!pageTranslationActive || session !== pageSessionVersion || !badge.isConnected) return;
      if (!response?.ok) throw new Error(response?.error || "翻译失败");
      webPageCache.set(cacheKey, response.translatedText);
      if (webPageCache.size > 600) webPageCache.delete(webPageCache.keys().next().value);
      badge.className = "lai-bilingual-translation";
      badge.textContent = response.translatedText;
      pageTranslatedCount++;
    } catch (error) {
      if (!pageTranslationActive || session !== pageSessionVersion || !badge.isConnected) return;
      badge.className = "lai-bilingual-translation lai-bilingual-error";
      badge.textContent = uiText(`翻译失败：${error.message}`, `Failed: ${error.message}`);
    } finally {
      activePageRequestIds.delete(requestId);
    }
  }

  function restorePageTranslation() {
    pageTranslationActive = false;
    pageSessionVersion++;
    pageQueue.length = 0;
    clearTimeout(pageMutationTimer);

    if (pageIntersectionObserver) {
      pageIntersectionObserver.disconnect();
      pageIntersectionObserver = null;
    }
    if (pageMutationObserver) {
      pageMutationObserver.disconnect();
      pageMutationObserver = null;
    }
    for (const requestId of activePageRequestIds) {
      chrome.runtime?.sendMessage?.({ type: "CANCEL_WEB_TRANSLATION", requestId }).catch(() => {});
    }
    activePageRequestIds.clear();
    activePageWorkers = 0;

    document.querySelectorAll("[data-lai-bilingual]").forEach((node) => node.remove());
    document.querySelectorAll("[data-lai-observed]").forEach((node) => node.removeAttribute("data-lai-observed"));

    if (pageStatusPill) {
      pageStatusPill.hidden = true;
      pageStatusPill.replaceChildren();
    }
  }

  function updatePageStatusPill() {
    if (!pageStatusPill) return;
    if (!pageTranslationActive) {
      pageStatusPill.hidden = true;
      return;
    }
    pageStatusPill.hidden = false;
    pageStatusPill.replaceChildren();

    const busy = activePageWorkers > 0 || pageQueue.length > 0;
    const textSpan = document.createElement("span");
    textSpan.textContent = busy
      ? uiText(`双语翻译中 (${pageTranslatedCount}/${pageQueuedCount})…`, `Translating (${pageTranslatedCount}/${pageQueuedCount})…`)
      : uiText(`双语对照已开启 (${pageTranslatedCount})`, `Bilingual active (${pageTranslatedCount})`);

    const restoreBtn = panelButton(
      uiText("还原原文", "Restore"),
      restorePageTranslation,
      "lai-pill-restore"
    );
    const hideBtn = panelButton(
      "×",
      () => { pageStatusPill.hidden = true; },
      "lai-pill-close"
    );
    pageStatusPill.append(textSpan, restoreBtn, hideBtn);
  }
})();
