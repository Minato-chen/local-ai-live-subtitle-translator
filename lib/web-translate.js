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

  // Candidates for container elements that often hold independent leaf text paragraphs
  const LEAF_CONTAINER_TAGS = new Set([
    "DIV", "SECTION", "ARTICLE", "ASIDE", "LABEL", "HEADER", "FOOTER", "SPAN"
  ]);

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "KBD", "SAMP", "VAR",
    "TEXTAREA", "INPUT", "SELECT", "BUTTON", "SVG", "MATH", "CANVAS",
    "VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED", "NAV"
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
    ".nf-player-container",
    // Interactive controls & input fields: never inject bilingual badges inside or adjacent to them
    "button",
    "[role='button']",
    "[role='tab']",
    "[role='menuitem']",
    "[role='checkbox']",
    "[role='switch']",
    "[role='radio']",
    "input",
    "textarea",
    "select",
    ".btn",
    "[class*='button']",
    "[class*='Button']",
    "[class*='input-wrapper']",
    "[class*='InputWrapper']",
    "[class*='text-field']",
    "[class*='TextField']"
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
    } else if (targetLanguage === "ja") {
      if (kana > 0 || (han > 0 && kana / (kana + latin + 0.1) > 0.4)) {
        return false;
      }
    } else if (targetLanguage === "ko") {
      if (hangul / letters >= 0.6) {
        return false;
      }
    } else if (targetLanguage === "de" || targetLanguage === "fr" || targetLanguage === "es") {
      if (han === 0 && kana === 0 && hangul === 0 && latin / letters >= 0.85) {
        // If already western/latin text, skip if source and target are roughly same charset
        // and doesn't contain obvious non-latin
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
      if (isLeafBlockCandidate(child)) return true;
      if (hasNestedBlockCandidate(child)) return true;
    }
    return false;
  }

  function isLeafBlockCandidate(element) {
    if (!element || SKIP_TAGS.has(element.tagName)) return false;
    if (BLOCK_TAGS.has(element.tagName)) return true;
    if (!LEAF_CONTAINER_TAGS.has(element.tagName)) return false;

    // Check if this container has direct meaningful text or only inline children
    if (!element.childNodes || element.childNodes.length === 0) return false;

    let hasAnyText = false;
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue.trim().length > 0) hasAnyText = true;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.hasAttribute?.("data-lai-bilingual")) continue;
        const tag = node.tagName;
        if (BLOCK_TAGS.has(tag)) return false;
        if (SKIP_TAGS.has(tag)) return false;
        // If child is a div/section etc. that itself has text or nested blocks, this parent is not a leaf
        if (LEAF_CONTAINER_TAGS.has(tag)) {
          const childText = node.textContent?.trim();
          if (childText && childText.length > 0) return false;
        }
      }
    }
    return hasAnyText;
  }

  function collectTranslatableBlocks(root, targetLanguage = "zh") {
    if (!root || !root.querySelectorAll) return [];
    
    // Select standard block tags plus potential leaf containers
    const blockSelectors = [...BLOCK_TAGS].map((t) => t.toLowerCase()).join(", ");
    const containerSelectors = [...LEAF_CONTAINER_TAGS].map((t) => t.toLowerCase()).join(", ");
    const combinedSelector = `${blockSelectors}, ${containerSelectors}`;

    const candidates = root.matches?.(combinedSelector)
      ? [root, ...root.querySelectorAll(combinedSelector)]
      : [...root.querySelectorAll(combinedSelector)];

    const results = [];
    for (const element of candidates) {
      if (!element || SKIP_TAGS.has(element.tagName)) continue;
      if (element.closest?.(SKIP_SELECTOR)) continue;
      if (element.hasAttribute?.("data-lai-bilingual")) continue;

      // Strictly ignore any element that directly contains form controls (input, textarea, select, button)
      if (element.querySelector?.("input, textarea, select, button, [role='button']")) continue;

      // Ignore input labels that are tightly bound to an input field
      if (element.tagName === "LABEL" && (element.htmlFor || element.closest?.("form, fieldset, [class*='field'], [class*='form']"))) {
        // If the label is just a field title like "Email" or "Password", skip it
        const clean = readCleanElementText(element);
        if (clean.length < 30) continue;
      }

      if (BLOCK_TAGS.has(element.tagName)) {
        if (hasNestedBlockCandidate(element)) continue;
      } else if (!isLeafBlockCandidate(element)) {
        continue;
      }

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
