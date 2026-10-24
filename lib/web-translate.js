(function (root, factory) {
  const shared = typeof module === "object" && module.exports ? require("./shared.js") : root.SubtitleShared;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebTranslateLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  const BLOCK_TAGS = new Set([
    "P", "H1", "H2", "H3", "H4", "H5", "H6",
    "LI", "BLOCKQUOTE", "DD", "DT", "FIGCAPTION", "TD", "TH", "SUMMARY"
  ]);

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "KBD", "SAMP", "VAR",
    "TEXTAREA", "INPUT", "SELECT", "BUTTON", "SVG", "MATH", "CANVAS",
    "VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED", "NAV", "FOOTER"
  ]);

  const SKIP_SELECTOR = [
    "#nf-zh-overlay",
    "#lai-web-translator-root",
    "[data-lai-bilingual]",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[translate='no']",
    ".notranslate",
    ".html5-video-player",
    ".watch-video",
    ".nf-player-container"
  ].join(", ");

  function normalizeWebSelection(value, maxLength = 2000) {
    const text = String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/([a-zA-Z])-\s*\n\s*([a-z])/g, "$1$2")
      .replace(/([^\n])\n(?=[a-zA-Z0-9(\["'“‘\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1 ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text || text.length > maxLength) return "";
    return text;
  }

  function classifySelection(rawText) {
    const text = normalizeWebSelection(rawText, 2000);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) {
      return { kind: "", text: "" };
    }
    const singleLine = !/\n/.test(text);
    const shortTerm = shared ? shared.normalizeSelection(text, 80) : text;
    if (singleLine && shortTerm && shared && !shared.selectionIssue(shortTerm, "auto")) {
      return { kind: "lookup", text: shortTerm };
    }
    return { kind: "translate", text };
  }

  function extractSentenceFromText(fullText, selectedTerm, maxLength = 400) {
    const cleanFull = String(fullText || "")
      .replace(/([a-zA-Z])-\s+([a-z])/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
    const cleanTerm = String(selectedTerm || "").replace(/\s+/g, " ").trim();
    if (!cleanFull) return cleanTerm.slice(0, maxLength);
    if (!cleanTerm) return cleanFull.slice(0, maxLength);

    const index = cleanFull.toLowerCase().indexOf(cleanTerm.toLowerCase());
    if (index < 0) return cleanFull.slice(0, maxLength);

    const boundary = /[.!?。！？；;\n]/u;
    let start = index;
    while (start > 0 && !boundary.test(cleanFull[start - 1])) {
      start--;
    }
    let end = index + cleanTerm.length;
    while (end < cleanFull.length && !boundary.test(cleanFull[end])) {
      end++;
    }
    if (end < cleanFull.length && boundary.test(cleanFull[end])) {
      end++;
    }

    const sentence = cleanFull.slice(start, end).trim();
    if (!sentence) return cleanFull.slice(0, maxLength);
    if (sentence.length <= maxLength) return sentence;

    const relativePos = Math.max(0, index - start);
    const half = Math.floor((maxLength - cleanTerm.length) / 2);
    const sliceStart = Math.max(0, relativePos - half);
    return sentence.slice(sliceStart, sliceStart + maxLength).trim();
  }

  function readCleanElementText(element) {
    if (!element) return "";
    if (typeof document === "undefined" || !document.createTreeWalker) {
      return String(element.textContent || "").replace(/\s+/g, " ").trim();
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-lai-bilingual], script, style, noscript, svg, code, pre")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const parts = [];
    while (walker.nextNode()) {
      parts.push(walker.currentNode.nodeValue);
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function shouldTranslateText(rawText, targetLanguage = "zh") {
    const text = String(rawText || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return false;
    const letters = (text.match(/\p{L}/gu) || []).length;
    if (letters < 2) return false;
    if (/^(?:https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+)$/i.test(text)) return false;

    const han = (text.match(/\p{Script=Han}/gu) || []).length;
    const kana = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
    const hangul = (text.match(/\p{Script=Hangul}/gu) || []).length;
    const latin = (text.match(/\p{Script=Latin}/gu) || []).length;

    if (targetLanguage === "zh") {
      if (kana === 0 && hangul === 0 && han > 0 && han / letters >= 0.65 && latin / letters < 0.25) {
        return false;
      }
    } else if (targetLanguage === "en") {
      if (han === 0 && kana === 0 && hangul === 0 && latin / letters >= 0.85) {
        return false;
      }
    }
    return true;
  }

  function isElementVisible(element) {
    if (!element || element.hidden) return false;
    if (typeof getComputedStyle === "function") {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        return false;
      }
    }
    if (typeof element.getBoundingClientRect === "function") {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
    }
    return true;
  }

  function hasNestedBlockCandidate(element) {
    if (!element?.children) return false;
    for (const child of element.children) {
      if (child.hasAttribute?.("data-lai-bilingual")) continue;
      if (BLOCK_TAGS.has(child.tagName)) return true;
      if (hasNestedBlockCandidate(child)) return true;
    }
    return false;
  }

  function collectTranslatableBlocks(root, targetLanguage = "zh") {
    if (!root || !root.querySelectorAll) return [];
    const selector = [...BLOCK_TAGS].map((tag) => tag.toLowerCase()).join(", ");
    const candidates = root.matches?.(selector)
      ? [root, ...root.querySelectorAll(selector)]
      : [...root.querySelectorAll(selector)];

    const results = [];
    for (const element of candidates) {
      if (!element || SKIP_TAGS.has(element.tagName)) continue;
      if (element.closest?.(SKIP_SELECTOR)) continue;
      if (hasNestedBlockCandidate(element)) continue;
      if (!isElementVisible(element)) continue;
      const text = readCleanElementText(element);
      if (!shouldTranslateText(text, targetLanguage)) continue;
      results.push(element);
    }
    return results;
  }

  return {
    BLOCK_TAGS,
    SKIP_TAGS,
    normalizeWebSelection,
    classifySelection,
    extractSentenceFromText,
    readCleanElementText,
    shouldTranslateText,
    collectTranslatableBlocks
  };
});
