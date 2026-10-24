(function () {
  const PDF_DEFAULTS = {
    source: "auto",
    target: "zh",
    serviceUrl: "http://127.0.0.1:8080",
    uiLanguage: "zh"
  };

  if (globalThis.pdfjsLib) {
    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = globalThis.chrome?.runtime?.getURL
      ? chrome.runtime.getURL("lib/pdfjs/pdf.worker.min.js")
      : "lib/pdfjs/pdf.worker.min.js";
  }

  let pdfSettings = { ...PDF_DEFAULTS };
  let pdfDoc = null;
  let currentScaleMode = "fit-width";
  let currentNumericScale = 1.2;
  let currentPage = 1;
  let renderSession = 0;
  let pageRenderObserver = null;
  let isHoveringBilingualPane = false;
  let programmaticCanvasScrollUntil = 0;
  let canvasScrollRaf = 0;

  const pageTextContentCache = new Map();
  const pageBaseBoxCache = new Map();
  const pageParagraphsCache = new Map();
  const pdfTranslationCache = new Map();
  const renderedPages = new Set();

  // Pane & Box-Select state
  let currentPaneMode = "auto"; // "auto" | "manual"
  let autoTranslateEnabled = false;
  let boxSelectMode = false;
  let activeBoxDrag = null;
  let appendTargetCard = null; // Card waiting for "+ 追加框选"
  const pdfTranslateQueue = [];
  let activePdfWorkers = 0;
  const MAX_PDF_WORKERS = 2;
  let nextPdfReqId = 0;
  const pdfReqNamespace = globalThis.crypto?.randomUUID?.() || `pdf-${Date.now()}`;

  // DOM Elements
  const fileInput = document.getElementById("pdfFileInput");
  const docTitleEl = document.getElementById("pdfDocTitle");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageNumberInput = document.getElementById("pageNumberInput");
  const pageCountSpan = document.getElementById("pageCountSpan");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomSelect = document.getElementById("zoomSelect");
  const boxSelectModeBtn = document.getElementById("boxSelectModeBtn");
  const keepBoxSelectCheck = document.getElementById("keepBoxSelectCheck");
  const toggleBilingualBtn = document.getElementById("toggleBilingualBtn");
  const toggleSidePaneBtn = document.getElementById("toggleSidePaneBtn");
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const workspaceEl = document.getElementById("pdfWorkspace");
  const canvasPaneEl = document.getElementById("pdfCanvasPane");
  const dropzoneEl = document.getElementById("pdfDropzone");
  const pagesListEl = document.getElementById("pdfPagesList");
  const paneResizerEl = document.getElementById("pdfPaneResizer");
  const bilingualPaneEl = document.getElementById("pdfBilingualPane");
  const bilingualBodyEl = document.getElementById("pdfBilingualBody");
  const manualBodyEl = document.getElementById("pdfManualBody");
  const manualPlaceholderEl = document.getElementById("manualPlaceholder");
  const bilingualStatusText = document.getElementById("bilingualStatusText");
  const tabAutoModeBtn = document.getElementById("tabAutoMode");
  const tabManualModeBtn = document.getElementById("tabManualMode");
  const autoTranslateLabel = document.getElementById("autoTranslateLabel");
  const autoTranslateCheck = document.getElementById("autoTranslateCheck");
  const translateCurrentPageBtn = document.getElementById("translateCurrentPageBtn");
  const newBlankCardBtn = document.getElementById("newBlankCardBtn");
  const exportMarkdownBtn = document.getElementById("exportMarkdownBtn");
  const exportModal = document.getElementById("pdfExportModal");
  const closeExportModalBtn = document.getElementById("closeExportModalBtn");
  const exportOnlyTranslatedCheck = document.getElementById("exportOnlyTranslated");
  const exportIncludePageHeadersCheck = document.getElementById("exportIncludePageHeaders");
  const exportIncludeMetadataCheck = document.getElementById("exportIncludeMetadata");
  const exportSummaryText = document.getElementById("exportSummaryText");
  const copyMarkdownBtn = document.getElementById("copyMarkdownBtn");
  const downloadMarkdownBtn = document.getElementById("downloadMarkdownBtn");
  const exportStatusMsg = document.getElementById("exportStatusMsg");
  const pdfUrlInput = document.getElementById("pdfUrlInput");
  const loadUrlBtn = document.getElementById("loadUrlBtn");

  initPdfViewer();

  async function initPdfViewer() {
    if (globalThis.chrome?.storage?.sync) {
      pdfSettings = await chrome.storage.sync.get(PDF_DEFAULTS);
      chrome.storage.onChanged.addListener((changes) => {
        for (const [key, value] of Object.entries(changes)) {
          pdfSettings[key] = value.newValue;
        }
        if (changes.serviceUrl || changes.source || changes.target) {
          pdfTranslationCache.clear();
        }
      });
    }

    bindToolbarEvents();
    bindDragAndDrop();

    const params = new URLSearchParams(location.search);
    const initialUrl = params.get("url");
    if (initialUrl) {
      pdfUrlInput.value = initialUrl;
      loadPdfFromUrl(initialUrl);
    }
  }

  function uiText(zh, en) {
    return pdfSettings.uiLanguage === "en" ? en : zh;
  }

  function setBilingualPaneVisible(visible) {
    const changed = bilingualPaneEl.hidden === Boolean(visible);
    bilingualPaneEl.hidden = !visible;
    if (paneResizerEl) paneResizerEl.hidden = !visible;
    if (changed && currentScaleMode === "fit-width" && pdfDoc) {
      rebuildPdfLayout();
    }
  }

  function bindToolbarEvents() {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) loadPdfFromFile(file);
    });

    loadUrlBtn.addEventListener("click", () => {
      const url = pdfUrlInput.value.trim();
      if (url) loadPdfFromUrl(url);
    });
    pdfUrlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && pdfUrlInput.value.trim()) {
        loadPdfFromUrl(pdfUrlInput.value.trim());
      }
    });

    prevPageBtn.addEventListener("click", () => scrollToPage(currentPage - 1));
    nextPageBtn.addEventListener("click", () => scrollToPage(currentPage + 1));
    pageNumberInput.addEventListener("change", () => {
      const target = Math.max(1, Math.min(pdfDoc?.numPages || 1, Number(pageNumberInput.value) || 1));
      scrollToPage(target);
    });

    zoomSelect.addEventListener("change", () => {
      currentScaleMode = zoomSelect.value;
      if (currentScaleMode !== "fit-width") {
        currentNumericScale = Number(currentScaleMode) || 1.2;
      }
      rebuildPdfLayout();
    });

    zoomOutBtn.addEventListener("click", () => adjustZoom(-0.15));
    zoomInBtn.addEventListener("click", () => adjustZoom(0.15));

    boxSelectModeBtn.addEventListener("click", () => {
      if (boxSelectMode) {
        clearAppendTarget();
        setBoxSelectMode(false);
      } else {
        setBoxSelectMode(true);
      }
    });

    keepBoxSelectCheck.addEventListener("change", () => {
      if (keepBoxSelectCheck.checked && !boxSelectMode && pdfDoc) {
        setBoxSelectMode(true);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (exportModal && !exportModal.hidden) {
          closeExportModal();
          return;
        }
        if (boxSelectMode || appendTargetCard) {
          clearAppendTarget();
          setBoxSelectMode(false);
        }
      }
    });

    tabAutoModeBtn.addEventListener("click", () => switchPaneMode("auto"));
    tabManualModeBtn.addEventListener("click", () => switchPaneMode("manual"));

    toggleBilingualBtn.addEventListener("click", () => {
      if (currentPaneMode !== "auto") switchPaneMode("auto");
      setAutoTranslate(!autoTranslateEnabled);
    });

    autoTranslateCheck.addEventListener("change", () => {
      setAutoTranslate(autoTranslateCheck.checked);
    });

    translateCurrentPageBtn.addEventListener("click", () => {
      if (!pdfDoc) return;
      setBilingualPaneVisible(true);
      if (currentPaneMode !== "auto") switchPaneMode("auto");
      enqueuePageParagraphs(currentPage, true);
    });

    newBlankCardBtn.addEventListener("click", () => {
      setBilingualPaneVisible(true);
      createEditableBlankCard();
    });

    exportMarkdownBtn.addEventListener("click", () => {
      openExportModal();
    });

    closeExportModalBtn.addEventListener("click", () => {
      closeExportModal();
    });

    exportModal.addEventListener("click", (event) => {
      if (event.target === exportModal) {
        closeExportModal();
      }
    });

    copyMarkdownBtn.addEventListener("click", async () => {
      await handleCopyMarkdown();
    });

    downloadMarkdownBtn.addEventListener("click", () => {
      handleDownloadMarkdown();
    });

    // Restore saved bilingual pane width
    try {
      const savedWidth = Number(localStorage.getItem("pdf_bilingual_pane_width"));
      if (savedWidth && savedWidth >= 320 && savedWidth <= window.innerWidth * 0.7) {
        bilingualPaneEl.style.width = `${savedWidth}px`;
      }
    } catch {}

    // Resizer divider drag handling
    if (paneResizerEl) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      paneResizerEl.addEventListener("mousedown", (e) => {
        if (bilingualPaneEl.hidden) return;
        isResizing = true;
        startX = e.clientX;
        startWidth = bilingualPaneEl.getBoundingClientRect().width;
        paneResizerEl.classList.add("resizing");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMouseMove = (ev) => {
          if (!isResizing) return;
          const deltaX = startX - ev.clientX;
          const maxW = Math.max(400, window.innerWidth * 0.65);
          const newW = Math.max(320, Math.min(maxW, startWidth + deltaX));
          bilingualPaneEl.style.width = `${newW}px`;
        };

        const onMouseUp = () => {
          if (!isResizing) return;
          isResizing = false;
          paneResizerEl.classList.remove("resizing");
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
          const finalW = Math.round(bilingualPaneEl.getBoundingClientRect().width);
          try {
            localStorage.setItem("pdf_bilingual_pane_width", String(finalW));
          } catch {}
          if (currentScaleMode === "fit-width" && pdfDoc) {
            rebuildPdfLayout();
          }
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });
    }

    toggleSidePaneBtn.addEventListener("click", () => {
      setBilingualPaneVisible(bilingualPaneEl.hidden);
    });

    openSettingsBtn.addEventListener("click", () => {
      if (globalThis.chrome?.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.runtime?.sendMessage?.({ type: "OPEN_OPTIONS" });
      }
    });

    bilingualPaneEl.addEventListener("mouseenter", () => {
      isHoveringBilingualPane = true;
    });
    bilingualPaneEl.addEventListener("mouseleave", () => {
      isHoveringBilingualPane = false;
    });

    canvasPaneEl.addEventListener("scroll", () => {
      if (canvasScrollRaf) return;
      canvasScrollRaf = requestAnimationFrame(() => {
        canvasScrollRaf = 0;
        detectCurrentPageFromScroll();
      });
    }, { passive: true });
  }

  function detectCurrentPageFromScroll() {
    if (!pdfDoc) return;
    const paneRect = canvasPaneEl.getBoundingClientRect();
    if (paneRect.height <= 0) return;

    // Use a reading focal line at 42% from the top of the viewport:
    // the next page only becomes active after its top scrolls above the lower 58% of the screen.
    const focalY = paneRect.top + paneRect.height * 0.42;
    const wrappers = pagesListEl.querySelectorAll(".pdf-page-wrapper");
    let bestPage = currentPage;
    let maxVisibleHeight = -1;

    for (const wrapper of wrappers) {
      const r = wrapper.getBoundingClientRect();
      const pageNum = Number(wrapper.dataset.pageNumber);
      if (!pageNum) continue;
      if (r.top <= focalY && r.bottom >= focalY) {
        bestPage = pageNum;
        break;
      }
      const visibleTop = Math.max(paneRect.top, r.top);
      const visibleBottom = Math.min(paneRect.bottom, r.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      if (visibleHeight > maxVisibleHeight) {
        maxVisibleHeight = visibleHeight;
        bestPage = pageNum;
      }
    }

    if (bestPage !== currentPage) {
      const isUserScrollingCanvas = Date.now() > programmaticCanvasScrollUntil && !isHoveringBilingualPane;
      setCurrentPage(bestPage, { syncRightScroll: isUserScrollingCanvas });
    }
  }

  function switchPaneMode(mode) {
    currentPaneMode = mode === "manual" ? "manual" : "auto";
    const isAuto = currentPaneMode === "auto";
    tabAutoModeBtn.classList.toggle("active", isAuto);
    tabAutoModeBtn.setAttribute("aria-selected", String(isAuto));
    tabManualModeBtn.classList.toggle("active", !isAuto);
    tabManualModeBtn.setAttribute("aria-selected", String(!isAuto));

    bilingualBodyEl.hidden = !isAuto;
    manualBodyEl.hidden = isAuto;
    autoTranslateLabel.hidden = !isAuto;
    translateCurrentPageBtn.hidden = !isAuto;

    clearPdfSourceHighlight();
    updateBilingualStatus();
  }

  function bindDragAndDrop() {
    window.addEventListener("dragover", (event) => {
      event.preventDefault();
      workspaceEl.classList.add("drag-over");
    });
    window.addEventListener("dragleave", (event) => {
      if (event.relatedTarget === null || !workspaceEl.contains(event.relatedTarget)) {
        workspaceEl.classList.remove("drag-over");
      }
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      workspaceEl.classList.remove("drag-over");
      const file = [...(event.dataTransfer?.files || [])].find(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)
      );
      if (file) loadPdfFromFile(file);
    });
  }

  async function loadPdfFromFile(file) {
    try {
      docTitleEl.textContent = `正在加载: ${file.name}…`;
      const buffer = await file.arrayBuffer();
      await openPdfDocument({ data: buffer }, file.name.replace(/\.pdf$/i, ""));
    } catch (error) {
      docTitleEl.textContent = `加载失败: ${error.message}`;
    }
  }

  async function loadPdfFromUrl(url) {
    try {
      docTitleEl.textContent = `正在加载链接: ${url}…`;
      const fileName = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "PDF Document").replace(/\.pdf$/i, "");
      await openPdfDocument({ url }, fileName);
    } catch (error) {
      docTitleEl.textContent = `链接加载失败（若为受限链接，请先下载到本地后拖入此页面）: ${error.message}`;
    }
  }

  async function openPdfDocument(source, title) {
    if (!globalThis.pdfjsLib) {
      throw new Error("PDF.js 引擎未加载");
    }
    renderSession++;
    pageTextContentCache.clear();
    pageBaseBoxCache.clear();
    pageParagraphsCache.clear();
    renderedPages.clear();
    pdfTranslateQueue.length = 0;
    clearAppendTarget();

    if (pdfDoc) {
      await pdfDoc.destroy().catch(() => {});
      pdfDoc = null;
    }

    const loadingTask = pdfjsLib.getDocument(source);
    pdfDoc = await loadingTask.promise;

    document.title = `${title} - 本地 AI 论文阅读器`;
    docTitleEl.textContent = title;
    dropzoneEl.hidden = true;
    pagesListEl.hidden = false;

    prevPageBtn.disabled = false;
    nextPageBtn.disabled = false;
    pageNumberInput.disabled = false;
    pageNumberInput.max = String(pdfDoc.numPages);
    pageNumberInput.value = "1";
    pageCountSpan.textContent = String(pdfDoc.numPages);
    zoomOutBtn.disabled = false;
    zoomInBtn.disabled = false;
    zoomSelect.disabled = false;
    boxSelectModeBtn.disabled = false;
    keepBoxSelectCheck.disabled = false;
    toggleBilingualBtn.disabled = false;
    translateCurrentPageBtn.disabled = false;
    exportMarkdownBtn.disabled = false;
    currentPage = 1;

    // Reset manual body cards when opening a new PDF
    manualBodyEl.querySelectorAll(".pdf-para-card").forEach((c) => c.remove());
    if (manualPlaceholderEl) manualPlaceholderEl.hidden = false;

    await rebuildPdfLayout();
  }

  function adjustZoom(delta) {
    if (!pdfDoc) return;
    currentNumericScale = Math.max(0.6, Math.min(2.5, Math.round((currentNumericScale + delta) * 100) / 100));
    currentScaleMode = String(currentNumericScale);
    if (![...zoomSelect.options].some((opt) => opt.value === currentScaleMode)) {
      const customOpt = document.createElement("option");
      customOpt.value = currentScaleMode;
      customOpt.textContent = `${Math.round(currentNumericScale * 100)}%`;
      zoomSelect.append(customOpt);
    }
    zoomSelect.value = currentScaleMode;
    rebuildPdfLayout();
  }

  async function computeScaleForPage(page) {
    const baseViewport = page.getViewport({ scale: 1 });
    if (currentScaleMode === "fit-width") {
      const availableWidth = Math.max(360, canvasPaneEl.clientWidth - 48);
      currentNumericScale = Math.max(0.65, Math.min(2.2, availableWidth / baseViewport.width));
    }
    return currentNumericScale;
  }

  async function rebuildPdfLayout() {
    if (!pdfDoc) return;
    const session = ++renderSession;
    renderedPages.clear();
    pagesListEl.replaceChildren();
    bilingualBodyEl.replaceChildren();

    if (pageRenderObserver) pageRenderObserver.disconnect();

    const firstPage = await pdfDoc.getPage(1);
    if (session !== renderSession) return;
    const scale = await computeScaleForPage(firstPage);
    const defaultViewport = firstPage.getViewport({ scale });

    pageRenderObserver = new IntersectionObserver((entries) => {
      if (session !== renderSession) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNum = Number(entry.target.dataset.pageNumber);
        if (pageNum && !renderedPages.has(pageNum)) {
          renderedPages.add(pageNum);
          renderSinglePage(pageNum, entry.target, scale, session);
        }
      }
    }, { root: canvasPaneEl, rootMargin: "600px 0px" });

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page-wrapper";
      wrapper.dataset.pageNumber = String(pageNum);
      wrapper.style.width = `${Math.floor(defaultViewport.width)}px`;
      wrapper.style.height = `${Math.floor(defaultViewport.height)}px`;

      const badge = document.createElement("span");
      badge.className = "pdf-page-badge";
      badge.textContent = `${pageNum} / ${pdfDoc.numPages}`;
      wrapper.append(badge);

      pagesListEl.append(wrapper);
      pageRenderObserver.observe(wrapper);

      const group = document.createElement("section");
      group.className = "pdf-page-group";
      group.id = `pdf-bilingual-page-${pageNum}`;
      group.dataset.pageNumber = String(pageNum);
      group.hidden = true;
      bilingualBodyEl.append(group);
    }

    setCurrentPage(currentPage);
  }

  async function renderSinglePage(pageNum, wrapper, scale, session) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      if (session !== renderSession) return;

      const viewport = page.getViewport({ scale });
      wrapper.style.width = `${Math.floor(viewport.width)}px`;
      wrapper.style.height = `${Math.floor(viewport.height)}px`;
      wrapper.dataset.scale = String(viewport.scale);

      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      textLayerDiv.style.setProperty("--scale-factor", String(viewport.scale));

      wrapper.prepend(canvas, textLayerDiv);
      bindPdfPageHoverSync(wrapper, pageNum);

      const ctx = canvas.getContext("2d");
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
      await page.render({ canvasContext: ctx, transform, viewport }).promise;
      if (session !== renderSession) return;

      let textContent = pageTextContentCache.get(pageNum);
      if (!textContent) {
        textContent = await page.getTextContent();
        pageTextContentCache.set(pageNum, textContent);
      }
      if (session !== renderSession) return;

      if (pdfjsLib.renderTextLayer) {
        await pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
          textDivs: []
        }).promise;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      populatePageParagraphs(pageNum, textContent, baseViewport);
    } catch {
      // Page render cancelled or failed
    }
  }

  function populatePageParagraphs(pageNum, textContent, baseViewport) {
    const viewBox = Array.isArray(baseViewport.viewBox) ? baseViewport.viewBox : [0, 0, baseViewport.width, baseViewport.height];
    const pageBox = {
      width: baseViewport.width,
      height: baseViewport.height,
      xMin: viewBox[0] || 0,
      yMin: viewBox[1] || 0
    };
    pageBaseBoxCache.set(pageNum, pageBox);

    let paragraphs = pageParagraphsCache.get(pageNum);
    if (!paragraphs) {
      paragraphs = PdfParagraphsLib.extractParagraphsFromTextItems(textContent.items, pageBox);
      pageParagraphsCache.set(pageNum, paragraphs);
    }

    const group = document.getElementById(`pdf-bilingual-page-${pageNum}`);
    if (!group) return;
    group.replaceChildren();

    if (!paragraphs.length) return;

    group.hidden = false;
    const header = document.createElement("div");
    header.className = "pdf-page-group-header";
    const title = document.createElement("span");
    title.textContent = uiText(`第 ${pageNum} 页（${paragraphs.length} 段）`, `Page ${pageNum} (${paragraphs.length} paragraphs)`);
    const pageTransBtn = document.createElement("button");
    pageTransBtn.type = "button";
    pageTransBtn.className = "pdf-para-translate-btn";
    pageTransBtn.textContent = uiText("翻译本页", "Translate page");
    pageTransBtn.addEventListener("click", () => enqueuePageParagraphs(pageNum, true));
    header.append(title, pageTransBtn);
    group.append(header);

    paragraphs.forEach((para, idx) => {
      const card = createParagraphCard({
        pageNum,
        paraIndex: idx,
        sourceText: para.text,
        regions: [{ pageNum, rect: para }],
        isManual: false,
        openInEditMode: false
      });
      group.append(card);
    });

    if (autoTranslateEnabled && Math.abs(pageNum - currentPage) <= 1) {
      enqueuePageParagraphs(pageNum, false);
    }
    updateBilingualStatus();
  }

  // =========================================================================
  // Unified Paragraph Card (Supports Edit, Line-Break Removal, Cross-Page Append, Multi-Region Highlight)
  // =========================================================================

  function createParagraphCard({ pageNum, paraIndex = null, sourceText = "", regions = [], isManual = false, openInEditMode = false }) {
    const card = document.createElement("article");
    card.className = `pdf-para-card${isManual ? " manual-card" : ""}`;
    card.dataset.pageNumber = String(pageNum || currentPage);
    if (paraIndex !== null) card.dataset.paraIndex = String(paraIndex);
    card._regions = Array.isArray(regions) ? [...regions] : [];

    // Optional top badge row for manual cards
    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.alignItems = "center";
    topRow.style.marginBottom = "4px";

    const badge = document.createElement("span");
    badge.className = "pdf-manual-badge";
    const updateBadgeText = () => {
      const pages = [...new Set(card._regions.map((r) => r.pageNum))].filter(Boolean);
      const pageLabel = pages.length ? `P${pages.join("+P")}` : `P${pageNum || currentPage}`;
      badge.textContent = isManual
        ? uiText(`${pageLabel} · 手动选区`, `${pageLabel} · Manual`)
        : uiText(`${pageLabel} · 段落`, `${pageLabel} · Paragraph`);
    };
    updateBadgeText();

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "pdf-para-translate-btn";
    removeBtn.textContent = "×";
    removeBtn.title = uiText("移除此段落卡片", "Remove card");
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (appendTargetCard === card) clearAppendTarget();
      clearPdfSourceHighlight();
      const parentGroup = card.closest(".pdf-page-group");
      card.remove();
      if (parentGroup) updateGroupHeaderCount(parentGroup, pageNum || currentPage);
      if (currentPaneMode === "manual" && manualPlaceholderEl) {
        manualPlaceholderEl.hidden = manualBodyEl.querySelectorAll(".pdf-para-card").length > 0;
      }
    });
    topRow.append(badge, removeBtn);

    const sourceP = document.createElement("p");
    sourceP.className = "pdf-para-source";
    sourceP.textContent = sourceText;

    const editorContainer = document.createElement("div");
    editorContainer.className = "pdf-para-editor";
    editorContainer.hidden = true;

    const targetDiv = document.createElement("div");
    targetDiv.className = "pdf-para-target";
    targetDiv.hidden = true;

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "pdf-para-actions";

    const appendBtn = document.createElement("button");
    appendBtn.type = "button";
    appendBtn.className = "pdf-para-translate-btn";
    appendBtn.title = uiText("在 PDF（可翻到下一页）画框，将框选文字追加拼接到此段末尾并重译", "Draw a box on any page to append text to this paragraph");
    appendBtn.textContent = uiText("+ 追加框选", "+ Append Box");

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "pdf-para-translate-btn";
    editBtn.title = uiText("手动编辑原文、粘贴跨页内容或一键把换行换成空格", "Edit source text or convert line breaks to spaces");
    editBtn.textContent = uiText("编辑", "Edit");

    const singleBtn = document.createElement("button");
    singleBtn.type = "button";
    singleBtn.className = "pdf-para-translate-btn";
    singleBtn.textContent = uiText("翻译此段", "Translate");

    appendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (appendTargetCard === card) {
        clearAppendTarget();
        setBoxSelectMode(false);
      } else {
        clearAppendTarget();
        appendTargetCard = card;
        appendBtn.classList.add("active-append");
        appendBtn.textContent = uiText("请画框追加…", "Draw box…");
        setBoxSelectMode(true);
      }
    });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCardEditor();
    });

    singleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      enqueueSingleParagraph(sourceP.textContent, targetDiv, singleBtn, true);
    });

    actionsDiv.append(appendBtn, editBtn, singleBtn);
    card.append(topRow, sourceP, editorContainer, targetDiv, actionsDiv);

    // Helper for inline editing + Easydict-style newline-to-space conversion
    function openCardEditor() {
      sourceP.hidden = true;
      actionsDiv.hidden = true;
      editorContainer.hidden = false;
      editorContainer.replaceChildren();

      const textarea = document.createElement("textarea");
      textarea.className = "pdf-para-textarea";
      textarea.value = sourceP.textContent;
      textarea.placeholder = uiText("在此输入或粘贴跨页 PDF 原文…", "Type or paste PDF text here…");

      const bar = document.createElement("div");
      bar.className = "pdf-para-editor-bar";

      const leftGroup = document.createElement("div");
      leftGroup.className = "pdf-para-editor-left";

      const cleanNewlinesBtn = document.createElement("button");
      cleanNewlinesBtn.type = "button";
      cleanNewlinesBtn.className = "pdf-para-translate-btn";
      cleanNewlinesBtn.title = uiText("一键将所有换行符替换为空格，并自动拼接跨行连字符单词", "Replace all line breaks with spaces and join hyphenated words");
      cleanNewlinesBtn.textContent = uiText("换行转空格", "Remove Line Breaks");
      cleanNewlinesBtn.addEventListener("click", () => {
        textarea.value = PdfParagraphsLib.cleanPdfText(textarea.value);
        textarea.focus();
      });
      leftGroup.append(cleanNewlinesBtn);

      const rightGroup = document.createElement("div");
      rightGroup.className = "pdf-para-editor-right";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "pdf-para-translate-btn";
      cancelBtn.textContent = uiText("取消", "Cancel");
      cancelBtn.addEventListener("click", () => {
        if (!sourceP.textContent.trim() && isManual) {
          card.remove();
          if (currentPaneMode === "manual" && manualPlaceholderEl) {
            manualPlaceholderEl.hidden = manualBodyEl.querySelectorAll(".pdf-para-card").length > 0;
          }
          return;
        }
        editorContainer.hidden = true;
        sourceP.hidden = false;
        actionsDiv.hidden = false;
      });

      const saveTranslateBtn = document.createElement("button");
      saveTranslateBtn.type = "button";
      saveTranslateBtn.className = "pdf-btn pdf-btn-primary pdf-btn-small";
      saveTranslateBtn.textContent = uiText("保存并重译", "Save & Translate");
      saveTranslateBtn.addEventListener("click", () => {
        const cleaned = PdfParagraphsLib.cleanPdfText(textarea.value);
        if (!cleaned) return;
        sourceP.textContent = cleaned;
        editorContainer.hidden = true;
        sourceP.hidden = false;
        actionsDiv.hidden = false;
        enqueueSingleParagraph(cleaned, targetDiv, singleBtn, true);
      });

      textarea.addEventListener("keydown", (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
          ev.preventDefault();
          saveTranslateBtn.click();
        }
      });

      rightGroup.append(cancelBtn, saveTranslateBtn);
      bar.append(leftGroup, rightGroup);
      editorContainer.append(textarea, bar);
      textarea.focus();
    }

    // Expose method on card to append text & region from "+ 追加框选"
    card._appendSelection = (newText, newPageNum, newRect) => {
      const merged = PdfParagraphsLib.joinParagraphTexts(sourceP.textContent, newText);
      sourceP.textContent = merged;
      if (newRect) {
        card._regions.push({ pageNum: newPageNum, rect: newRect });
        updateBadgeText();
      }
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      highlightCardRegions(card._regions, "none");
      enqueueSingleParagraph(merged, targetDiv, singleBtn, true);
    };

    card._resetAppendButton = () => {
      appendBtn.classList.remove("active-append");
      appendBtn.textContent = uiText("+ 追加框选", "+ Append Box");
    };

    card.addEventListener("mouseenter", () => {
      card.classList.add("active-match");
      highlightCardRegions(card._regions, "none");
    });
    card.addEventListener("mouseleave", () => {
      card.classList.remove("active-match");
      clearPdfSourceHighlight();
    });
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, textarea")) return;
      const sel = globalThis.getSelection?.();
      if (sel && !sel.isCollapsed) return;
      programmaticCanvasScrollUntil = Date.now() + 700;
      highlightCardRegions(card._regions, "center");
    });

    const cacheKey = JSON.stringify([pdfSettings.serviceUrl, pdfSettings.source, pdfSettings.target, sourceText]);
    if (sourceText && pdfTranslationCache.has(cacheKey)) {
      targetDiv.hidden = false;
      targetDiv.className = "pdf-para-target";
      targetDiv.textContent = pdfTranslationCache.get(cacheKey);
      singleBtn.textContent = uiText("重译", "Retranslate");
    }

    if (openInEditMode) {
      openCardEditor();
    }

    return card;
  }

  function clearAppendTarget() {
    if (appendTargetCard && appendTargetCard._resetAppendButton) {
      appendTargetCard._resetAppendButton();
    }
    appendTargetCard = null;
  }

  function createEditableBlankCard() {
    const card = createParagraphCard({
      pageNum: currentPage,
      sourceText: "",
      regions: [],
      isManual: true,
      openInEditMode: true
    });

    if (currentPaneMode === "manual") {
      if (manualPlaceholderEl) manualPlaceholderEl.hidden = true;
      manualBodyEl.prepend(card);
    } else {
      const group = document.getElementById(`pdf-bilingual-page-${currentPage}`);
      if (group) {
        group.hidden = false;
        const header = group.querySelector(".pdf-page-group-header");
        if (header && header.nextSibling) group.insertBefore(card, header.nextSibling);
        else group.prepend(card);
      } else {
        switchPaneMode("manual");
        if (manualPlaceholderEl) manualPlaceholderEl.hidden = true;
        manualBodyEl.prepend(card);
      }
    }
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function setCurrentPage(pageNum, { syncRightScroll = false } = {}) {
    if (!pdfDoc) return;
    currentPage = Math.max(1, Math.min(pdfDoc.numPages, pageNum));
    pageNumberInput.value = String(currentPage);
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= pdfDoc.numPages;

    if (currentPaneMode === "auto") {
      if (syncRightScroll && !isHoveringBilingualPane) {
        const group = document.getElementById(`pdf-bilingual-page-${currentPage}`);
        const header = group?.querySelector(".pdf-page-group-header") || group;
        if (group && !group.hidden && header) {
          header.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      if (autoTranslateEnabled) {
        enqueuePageParagraphs(currentPage, false);
      }
    }
    updateBilingualStatus();
  }

  function scrollToPage(pageNum) {
    if (!pdfDoc) return;
    const target = Math.max(1, Math.min(pdfDoc.numPages, pageNum));
    const wrapper = pagesListEl.querySelector(`.pdf-page-wrapper[data-page-number="${target}"]`);
    if (wrapper) {
      programmaticCanvasScrollUntil = Date.now() + 700;
      wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(target, { syncRightScroll: true });
    }
  }

  function setAutoTranslate(enabled) {
    autoTranslateEnabled = Boolean(enabled);
    autoTranslateCheck.checked = autoTranslateEnabled;
    toggleBilingualBtn.classList.toggle("active", autoTranslateEnabled);
    toggleBilingualBtn.textContent = autoTranslateEnabled
      ? uiText("全文双语对照：已开启", "Bilingual Mode: ON")
      : uiText("开启全文双语对照", "Enable Bilingual Mode");

    if (autoTranslateEnabled) {
      setBilingualPaneVisible(true);
      enqueuePageParagraphs(currentPage, false);
      if (currentPage + 1 <= (pdfDoc?.numPages || 0)) {
        enqueuePageParagraphs(currentPage + 1, false);
      }
    } else {
      pdfTranslateQueue.length = 0;
    }
    updateBilingualStatus();
  }

  function enqueuePageParagraphs(pageNum, force = false) {
    const group = document.getElementById(`pdf-bilingual-page-${pageNum}`);
    if (!group) return;
    const cards = group.querySelectorAll(".pdf-para-card");
    for (const card of cards) {
      const sourceText = card.querySelector(".pdf-para-source")?.textContent || "";
      const targetDiv = card.querySelector(".pdf-para-target");
      const btn = card.querySelectorAll(".pdf-para-actions .pdf-para-translate-btn")[2];
      if (!sourceText || !targetDiv) continue;
      if (!force && !targetDiv.hidden && !targetDiv.classList.contains("error")) continue;
      enqueueSingleParagraph(sourceText, targetDiv, btn, force);
    }
  }

  function enqueueSingleParagraph(sourceText, targetDiv, btn, force = false) {
    if (!WebTranslateLib.shouldTranslateText(sourceText, pdfSettings.target)) return;
    const cacheKey = JSON.stringify([pdfSettings.serviceUrl, pdfSettings.source, pdfSettings.target, sourceText]);
    if (!force && pdfTranslationCache.has(cacheKey)) {
      targetDiv.hidden = false;
      targetDiv.className = "pdf-para-target";
      targetDiv.textContent = pdfTranslationCache.get(cacheKey);
      if (btn) btn.textContent = uiText("重译", "Retranslate");
      return;
    }

    targetDiv.hidden = false;
    targetDiv.className = "pdf-para-target loading";
    targetDiv.textContent = uiText("正在翻译段落…", "Translating paragraph…");

    pdfTranslateQueue.push({ sourceText, targetDiv, btn, cacheKey });
    updateBilingualStatus();
    pumpPdfQueue();
  }

  function pumpPdfQueue() {
    while (activePdfWorkers < MAX_PDF_WORKERS && pdfTranslateQueue.length > 0) {
      const task = pdfTranslateQueue.shift();
      activePdfWorkers++;
      runPdfParagraphTask(task).finally(() => {
        activePdfWorkers = Math.max(0, activePdfWorkers - 1);
        updateBilingualStatus();
        pumpPdfQueue();
      });
    }
  }

  async function runPdfParagraphTask(task) {
    const { sourceText, targetDiv, btn, cacheKey } = task;
    if (!targetDiv.isConnected) return;
    const requestId = `pdfpara-${pdfReqNamespace}-${++nextPdfReqId}`;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_WEB_TEXT",
        requestId,
        text: sourceText,
        source: pdfSettings.source,
        target: pdfSettings.target
      });
      if (!response?.ok) throw new Error(response?.error || "翻译失败");
      pdfTranslationCache.set(cacheKey, response.translatedText);
      targetDiv.className = "pdf-para-target";
      targetDiv.textContent = response.translatedText;
      if (btn) btn.textContent = uiText("重译", "Retranslate");
    } catch (error) {
      targetDiv.className = "pdf-para-target error";
      targetDiv.textContent = `翻译失败：${error.message}`;
    }
  }

  function updateBilingualStatus() {
    if (!pdfDoc) return;
    if (appendTargetCard) {
      bilingualStatusText.textContent = uiText(
        "追加模式：请在左侧 PDF 上拖拽画框，框内文本将自动拼接到目标卡片末尾",
        "Append mode: draw a box on the PDF to append text to the target card"
      );
      return;
    }
    if (boxSelectMode) {
      bilingualStatusText.textContent = keepBoxSelectCheck.checked
        ? uiText("持续画框已开启：在左侧 PDF 拖拽画框提取段落（取消勾选「保持画框」可单次自动退出）", "Continuous Box-Select ON: drag on PDF to extract paragraphs")
        : uiText("单次画框已开启：在左侧 PDF 拖拽画框后将自动回到普通划词状态", "Single Box-Select: drag a box on PDF; will return to text selection after");
      return;
    }
    const busy = activePdfWorkers > 0 || pdfTranslateQueue.length > 0;
    if (busy) {
      bilingualStatusText.textContent = uiText(
        `正在翻译（队列剩余 ${pdfTranslateQueue.length + activePdfWorkers} 段）…`,
        `Translating (${pdfTranslateQueue.length + activePdfWorkers} remaining)…`
      );
      return;
    }
    if (currentPaneMode === "manual") {
      const manualCount = manualBodyEl.querySelectorAll(".pdf-para-card").length;
      bilingualStatusText.textContent = uiText(
        `纯手动选区模式 · 共 ${manualCount} 段（点击顶部「画框选取」或「+ 粘贴段」添加）`,
        `Manual mode · ${manualCount} paragraphs`
      );
    } else {
      const count = pageParagraphsCache.get(currentPage)?.length || 0;
      bilingualStatusText.textContent = uiText(
        `第 ${currentPage} / ${pdfDoc.numPages} 页 · 已提取 ${count} 个自然段（支持悬停高亮、编辑与跨页追加）`,
        `Page ${currentPage} / ${pdfDoc.numPages} · ${count} paragraphs`
      );
    }
  }

  function highlightCardRegions(regions, scrollMode = "none") {
    clearPdfSourceHighlight();
    if (!Array.isArray(regions) || !regions.length) return;
    let firstBox = null;

    for (const item of regions) {
      const { pageNum, rect: para } = item;
      const wrapper = pagesListEl.querySelector(`.pdf-page-wrapper[data-page-number="${pageNum}"]`);
      if (!wrapper || !para) continue;

      const scale = Number(wrapper.dataset.scale) || currentNumericScale || 1;
      const pad = 4;
      const left = Math.max(0, para.left * scale - pad);
      const top = Math.max(0, para.top * scale - pad);
      const width = Math.max(24, (para.right - para.left) * scale + pad * 2);
      const height = Math.max(14, (para.bottom - para.top) * scale + pad * 2);

      const box = document.createElement("div");
      box.className = "pdf-source-highlight";
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
      box.style.width = `${Math.round(width)}px`;
      box.style.height = `${Math.round(height)}px`;
      wrapper.append(box);
      if (!firstBox) firstBox = box;
    }

    if (firstBox && scrollMode !== "none") {
      const paneRect = canvasPaneEl.getBoundingClientRect();
      const boxRect = firstBox.getBoundingClientRect();
      const outOfView = boxRect.top < paneRect.top + 24 || boxRect.bottom > paneRect.bottom - 24;
      if (scrollMode === "center" || outOfView) {
        firstBox.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function clearPdfSourceHighlight() {
    pagesListEl.querySelectorAll(".pdf-source-highlight").forEach((el) => el.remove());
  }

  function setBoxSelectMode(enabled) {
    boxSelectMode = Boolean(enabled);
    boxSelectModeBtn.classList.toggle("pdf-btn-primary", boxSelectMode);
    boxSelectModeBtn.textContent = boxSelectMode
      ? uiText("退出画框 (Esc)", "Exit Box-Select")
      : uiText("画框选取", "Box-Select");
    canvasPaneEl.classList.toggle("box-select-active", boxSelectMode);
    updateBilingualStatus();
  }

  function bindPdfPageHoverSync(wrapper, pageNum) {
    let lastMatchedIndex = -1;

    wrapper.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || !boxSelectMode) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = wrapper.getBoundingClientRect();
      const startX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const startY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

      const lasso = document.createElement("div");
      lasso.className = "pdf-box-lasso";
      lasso.style.left = `${startX}px`;
      lasso.style.top = `${startY}px`;
      lasso.style.width = "0px";
      lasso.style.height = "0px";
      wrapper.append(lasso);

      activeBoxDrag = { wrapper, pageNum, startX, startY, endX: startX, endY: startY, lasso };

      const onMove = (moveEvent) => {
        if (!activeBoxDrag) return;
        const r = wrapper.getBoundingClientRect();
        activeBoxDrag.endX = Math.max(0, Math.min(r.width, moveEvent.clientX - r.left));
        activeBoxDrag.endY = Math.max(0, Math.min(r.height, moveEvent.clientY - r.top));
        const left = Math.min(activeBoxDrag.startX, activeBoxDrag.endX);
        const top = Math.min(activeBoxDrag.startY, activeBoxDrag.endY);
        const width = Math.abs(activeBoxDrag.endX - activeBoxDrag.startX);
        const height = Math.abs(activeBoxDrag.endY - activeBoxDrag.startY);
        lasso.style.left = `${Math.round(left)}px`;
        lasso.style.top = `${Math.round(top)}px`;
        lasso.style.width = `${Math.round(width)}px`;
        lasso.style.height = `${Math.round(height)}px`;
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", onUp, true);
        const drag = activeBoxDrag;
        activeBoxDrag = null;
        lasso.remove();
        if (!drag) return;
        const width = Math.abs(drag.endX - drag.startX);
        const height = Math.abs(drag.endY - drag.startY);
        if (width < 12 || height < 8) return;

        const scale = Number(wrapper.dataset.scale) || currentNumericScale || 1;
        const pdfRect = {
          left: Math.min(drag.startX, drag.endX) / scale,
          top: Math.min(drag.startY, drag.endY) / scale,
          right: Math.max(drag.startX, drag.endX) / scale,
          bottom: Math.max(drag.startY, drag.endY) / scale
        };
        handleBoxSelectionComplete(pageNum, pdfRect);
      };

      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
    });

    wrapper.addEventListener("mousemove", (event) => {
      if (activeBoxDrag || boxSelectMode) return;
      const container = currentPaneMode === "manual" ? manualBodyEl : bilingualBodyEl;
      const cards = [...container.querySelectorAll(".pdf-para-card")];
      if (!cards.length) return;

      const rect = wrapper.getBoundingClientRect();
      const scale = Number(wrapper.dataset.scale) || currentNumericScale || 1;
      const pdfX = (event.clientX - rect.left) / scale;
      const pdfY = (event.clientY - rect.top) / scale;

      const matchedCard = cards.find((c) =>
        Array.isArray(c._regions) &&
        c._regions.some(
          (r) => r.pageNum === pageNum &&
            r.rect &&
            pdfX >= r.rect.left - 8 &&
            pdfX <= r.rect.right + 8 &&
            pdfY >= r.rect.top - 6 &&
            pdfY <= r.rect.bottom + 6
        )
      ) || null;

      if (matchedCard === lastMatchedIndex) return;
      lastMatchedIndex = matchedCard;

      container.querySelectorAll(".pdf-para-card.active-match").forEach((c) => c.classList.remove("active-match"));
      clearPdfSourceHighlight();
      if (matchedCard) {
        matchedCard.classList.add("active-match");
        highlightCardRegions(matchedCard._regions, "none");
      }
    });

    wrapper.addEventListener("click", () => {
      if (boxSelectMode || !lastMatchedIndex) return;
      const sel = globalThis.getSelection?.();
      if (sel && !sel.isCollapsed) return;
      if (lastMatchedIndex.isConnected) {
        lastMatchedIndex.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    wrapper.addEventListener("mouseleave", () => {
      lastMatchedIndex = null;
      const container = currentPaneMode === "manual" ? manualBodyEl : bilingualBodyEl;
      container.querySelectorAll(".pdf-para-card.active-match").forEach((c) => c.classList.remove("active-match"));
      clearPdfSourceHighlight();
    });
  }

  function handleBoxSelectionComplete(pageNum, pdfRect) {
    const textContent = pageTextContentCache.get(pageNum);
    const pageBox = pageBaseBoxCache.get(pageNum) || { width: 600, height: 800, xMin: 0, yMin: 0 };
    if (!textContent) return;

    const extractedText = PdfParagraphsLib.extractTextFromRect(textContent.items, pdfRect, pageBox);
    if (!extractedText) {
      bilingualStatusText.textContent = uiText("所选框内未检测到文本", "No text found inside the selected box");
      return;
    }

    setBilingualPaneVisible(true);

    // Case 1: Appending to an existing card ("+ 追加框选")
    if (appendTargetCard && appendTargetCard.isConnected) {
      const targetCard = appendTargetCard;
      clearAppendTarget();
      if (!keepBoxSelectCheck.checked) setBoxSelectMode(false);
      targetCard._appendSelection(extractedText, pageNum, pdfRect);
      return;
    }

    // Case 2: Creating a new card in Manual Mode or adjusting in Auto Mode
    if (!keepBoxSelectCheck.checked) {
      setBoxSelectMode(false);
    }

    const card = createParagraphCard({
      pageNum,
      sourceText: extractedText,
      regions: [{ pageNum, rect: pdfRect }],
      isManual: true,
      openInEditMode: false
    });

    if (currentPaneMode === "manual") {
      if (manualPlaceholderEl) manualPlaceholderEl.hidden = true;
      manualBodyEl.append(card);
    } else {
      const group = document.getElementById(`pdf-bilingual-page-${pageNum}`);
      if (!group) return;
      group.hidden = false;
      insertOrReplaceCardInAutoGroup(group, pageNum, card, pdfRect, pageBox.width);
    }

    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    highlightCardRegions(card._regions, "none");
    const targetDiv = card.querySelector(".pdf-para-target");
    const singleBtn = card.querySelectorAll(".pdf-para-actions .pdf-para-translate-btn")[2];
    enqueueSingleParagraph(extractedText, targetDiv, singleBtn, true);
  }

  function insertOrReplaceCardInAutoGroup(group, pageNum, newCard, pdfRect, pageWidth = 600) {
    const existingCards = [...group.querySelectorAll(".pdf-para-card")];
    const bArea = Math.max(1, (pdfRect.right - pdfRect.left) * (pdfRect.bottom - pdfRect.top));

    const overlappedCards = existingCards.filter((card) => {
      const reg = card._regions?.find((r) => r.pageNum === pageNum)?.rect;
      if (!reg) return false;
      const overlapX = Math.max(0, Math.min(reg.right, pdfRect.right) - Math.max(reg.left, pdfRect.left));
      const overlapY = Math.max(0, Math.min(reg.bottom, pdfRect.bottom) - Math.max(reg.top, pdfRect.top));
      const overlapArea = overlapX * overlapY;
      if (overlapArea <= 0) return false;
      const rArea = Math.max(1, (reg.right - reg.left) * (reg.bottom - reg.top));
      return overlapArea / rArea >= 0.25 || overlapArea / bArea >= 0.45;
    });

    if (overlappedCards.length > 0) {
      group.insertBefore(newCard, overlappedCards[0]);
      for (const oldCard of overlappedCards) {
        if (appendTargetCard === oldCard) clearAppendTarget();
        oldCard.remove();
      }
      updateGroupHeaderCount(group, pageNum);
      return;
    }

    // No overlapped card: insert in reading order (full/left/right column + vertical top)
    const midX = (Number(pageWidth) || 600) * 0.5;
    const rankOfRect = (r) => {
      const spansCenter = r.left < midX * 0.78 && r.right > midX * 1.22;
      const colOrder = spansCenter ? 0 : (r.left + r.right) / 2 < midX ? 1 : 2;
      return colOrder * 100000 + (Number(r.top) || 0);
    };
    const newRank = rankOfRect(pdfRect);

    const insertBeforeCard = existingCards.find((card) => {
      const reg = card._regions?.find((r) => r.pageNum === pageNum)?.rect;
      return reg && rankOfRect(reg) > newRank;
    });

    if (insertBeforeCard) {
      group.insertBefore(newCard, insertBeforeCard);
    } else {
      group.append(newCard);
    }
    updateGroupHeaderCount(group, pageNum);
  }

  function updateGroupHeaderCount(group, pageNum) {
    const titleSpan = group?.querySelector(".pdf-page-group-header span");
    if (!titleSpan) return;
    const count = group.querySelectorAll(".pdf-para-card").length;
    titleSpan.textContent = uiText(`第 ${pageNum} 页（${count} 段）`, `Page ${pageNum} (${count} paragraphs)`);
  }

  // =========================================================================
  // Export Bilingual Notes to Markdown (.md)
  // =========================================================================

  function openExportModal() {
    const container = currentPaneMode === "manual" ? manualBodyEl : bilingualBodyEl;
    const cards = [...container.querySelectorAll(".pdf-para-card")];
    const translatedCards = cards.filter((c) => {
      const targetEl = c.querySelector(".pdf-para-target");
      return (
        targetEl &&
        !targetEl.hidden &&
        targetEl.textContent.trim() &&
        targetEl.textContent !== uiText("翻译中…", "Translating…") &&
        !targetEl.classList.contains("error")
      );
    });

    const modeName = currentPaneMode === "manual" ? uiText("手动选区", "Manual Box-Select") : uiText("自动分段", "Auto-Segment");
    if (cards.length > 0) {
      exportSummaryText.textContent = uiText(
        `当前为「${modeName}」模式：检测到 ${cards.length} 个段落卡片（已完成翻译 ${translatedCards.length} 段）。`,
        `Current mode: "${modeName}". Found ${cards.length} paragraph cards (${translatedCards.length} translated).`
      );
    } else {
      exportSummaryText.textContent = uiText(
        `当前「${modeName}」模式暂无可导出的段落卡片。可先在左侧画框选取或点击「开启全文双语对照」。`,
        `No paragraph cards found in "${modeName}" mode. Draw a box or enable full-page bilingual translation first.`
      );
    }

    exportStatusMsg.textContent = "";
    exportModal.hidden = false;
  }

  function closeExportModal() {
    exportModal.hidden = true;
    exportStatusMsg.textContent = "";
  }

  function buildExportMarkdown() {
    const container = currentPaneMode === "manual" ? manualBodyEl : bilingualBodyEl;
    const cardEls = [...container.querySelectorAll(".pdf-para-card")];
    const onlyTranslated = exportOnlyTranslatedCheck?.checked || false;
    const includePageHeaders = exportIncludePageHeadersCheck?.checked !== false;
    const includeMetadata = exportIncludeMetadataCheck?.checked !== false;
    const format = exportModal.querySelector('input[name="exportFormat"]:checked')?.value || "quote";

    const items = [];
    for (const card of cardEls) {
      const source = card.querySelector(".pdf-para-source")?.textContent?.trim() || "";
      if (!source) continue;
      const targetEl = card.querySelector(".pdf-para-target");
      const isTranslated = Boolean(
        targetEl &&
        !targetEl.hidden &&
        targetEl.textContent.trim() &&
        targetEl.textContent !== uiText("翻译中…", "Translating…") &&
        !targetEl.classList.contains("error")
      );
      const target = isTranslated ? targetEl.textContent.trim() : "";
      if (onlyTranslated && !isTranslated) continue;

      let pageNum = Number(card.dataset.pageNumber) || currentPage || 1;
      if (Array.isArray(card._regions) && card._regions.length > 0) {
        const p = card._regions[0]?.pageNum;
        if (p) pageNum = p;
      }

      items.push({
        pageNum,
        source,
        target,
        isTranslated
      });
    }

    if (!items.length) {
      return { markdown: "", count: 0, filename: "paper_bilingual.md" };
    }

    const title = (docTitleEl?.textContent || "PDF Document").replace(/\s*-\s*本地 AI 论文阅读器$/, "").trim();
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_") || "paper";
    const dateObj = new Date();
    const dateStr =
      dateObj.getFullYear() +
      String(dateObj.getMonth() + 1).padStart(2, "0") +
      String(dateObj.getDate()).padStart(2, "0");

    const lines = [];
    lines.push(`# ${title} - 双语精读笔记\n`);

    if (includeMetadata) {
      const timeStr =
        dateObj.getFullYear() + "-" +
        String(dateObj.getMonth() + 1).padStart(2, "0") + "-" +
        String(dateObj.getDate()).padStart(2, "0") + " " +
        String(dateObj.getHours()).padStart(2, "0") + ":" +
        String(dateObj.getMinutes()).padStart(2, "0");
      const modeLabel = currentPaneMode === "manual" ? "手动选区精读" : "全文自动分段";
      const transCount = items.filter((i) => i.isTranslated).length;

      lines.push(`> - **导出时间**：${timeStr}`);
      lines.push(`> - **来源文献**：${title}`);
      lines.push(`> - **导出模式**：${modeLabel}`);
      lines.push(`> - **段落统计**：共计 ${items.length} 段（已翻译 ${transCount} 段）\n`);
      lines.push(`---\n`);
    }

    let currentPageNum = null;
    let tableOpen = false;

    const closeTable = () => {
      if (tableOpen) {
        lines.push("");
        tableOpen = false;
      }
    };

    for (const item of items) {
      if (includePageHeaders && item.pageNum !== currentPageNum) {
        closeTable();
        currentPageNum = item.pageNum;
        lines.push(`## 第 ${currentPageNum} 页\n`);
      }

      const sourceText = item.source;
      const targetText = item.target || (item.isTranslated ? "" : "*（未翻译）*");

      if (format === "quote") {
        const quotedSource = sourceText.split("\n").map((l) => `> ${l}`).join("\n");
        lines.push(`${quotedSource}\n`);
        if (targetText) {
          lines.push(`${targetText}\n`);
        }
        lines.push(`---\n`);
      } else if (format === "compact") {
        lines.push(`${sourceText}\n`);
        if (targetText) {
          lines.push(`${targetText}\n`);
        }
        lines.push(`---\n`);
      } else if (format === "table") {
        if (!tableOpen) {
          lines.push(`| 原文 (Source) | 译文 (Translation) |`);
          lines.push(`| :--- | :--- |`);
          tableOpen = true;
        }
        const safeSource = sourceText.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
        const safeTarget = targetText.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
        lines.push(`| ${safeSource} | ${safeTarget} |`);
      }
    }

    closeTable();

    return {
      markdown: lines.join("\n"),
      count: items.length,
      filename: `${safeTitle}_Bilingual_${dateStr}.md`
    };
  }

  async function handleCopyMarkdown() {
    const { markdown, count } = buildExportMarkdown();
    if (!count || !markdown) {
      exportStatusMsg.textContent = uiText("暂无可导出的段落内容", "No paragraphs available to export");
      return;
    }
    try {
      await navigator.clipboard.writeText(markdown);
      exportStatusMsg.textContent = uiText(`✓ 已成功复制 ${count} 个段落到剪贴板！`, `✓ Copied ${count} paragraphs to clipboard!`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = markdown;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      exportStatusMsg.textContent = uiText(`✓ 已成功复制 ${count} 个段落到剪贴板！`, `✓ Copied ${count} paragraphs to clipboard!`);
    }
  }

  function handleDownloadMarkdown() {
    const { markdown, count, filename } = buildExportMarkdown();
    if (!count || !markdown) {
      exportStatusMsg.textContent = uiText("暂无可导出的段落内容", "No paragraphs available to export");
      return;
    }
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportStatusMsg.textContent = uiText(`✓ 已下载 ${filename}`, `✓ Downloaded ${filename}`);
  }
})();
