(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtitleShared = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeSelection(value, maxLength = 80) {
    const text = String(value || "").replace(/\s+/g, " ").trim()
      .replace(/^[\s.,!?;:，。！？；："“”'‘’()[\]{}<>《》【】「」『』—–-]+|[\s.,!?;:，。！？；："“”'‘’()[\]{}<>《》【】「」『』—–-]+$/g, "");
    if (!text || text.length > maxLength) return "";
    return text;
  }

  function tokenizeWordBlocks(value) {
    const text = String(value || "");
    if (!/\p{Script=Latin}/u.test(text) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return null;
    return (text.match(/\s+|\S+/gu) || []).map((part) => ({ text: part, word: /[\p{L}\p{N}]/u.test(part) }));
  }

  function wordBlockRange(parts, start, end) {
    if (!Array.isArray(parts) || !Number.isInteger(start) || !Number.isInteger(end)) return "";
    const low = Math.min(start, end); const high = Math.max(start, end);
    if (!parts[low]?.word || !parts[high]?.word) return "";
    return normalizeSelection(parts.slice(low, high + 1).map((part) => part.text).join(""));
  }

  function selectionIssue(text, kind) {
    const value = normalizeSelection(text);
    if (!value) return "选区为空或过长，请重新选择";
    if (kind === "auto" && /[.!?。！？；;][\s\S]*\p{L}/u.test(value)) return "选区跨越句子边界，请缩小范围";
    if (kind === "auto" && (value.match(/\S+/gu) || []).length > 6) return "选区过长，请缩小范围";
    if (kind === "auto" && [...value].length > 30) return "选区过长，请缩小范围";
    if (kind === "word" && (/\s/u.test(value) || [...value].length > 24)) return "选区不像单词，请缩小范围或选择短语";
    if (kind === "phrase" && /[.!?。！？；;][\s\S]*\p{L}/u.test(value)) return "选区跨越句子边界，请缩小范围";
    if (kind === "phrase" && (value.match(/\S+/gu) || []).length > 6) return "短语过长，请缩小选区";
    return "";
  }

  function validateLoopbackHttpUrl(value, fallback) {
    let url;
    try { url = new URL(value || fallback); } catch { throw new Error("本机服务地址无效"); }
    if (url.protocol !== "http:") throw new Error("本机服务仅支持 HTTP 地址");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("仅支持本机回环地址");
    if (url.username || url.password) throw new Error("本机服务地址不能包含账号信息");
    return url.toString().replace(/\/$/, "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function toAnkiHtml(value) { return escapeHtml(value).replace(/\r?\n/g, "<br>"); }

  function sourceTags(title, hostname) {
    const slug = String(title || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 48);
    const platform = /youtube/.test(hostname || "") ? "source-youtube" : /netflix/.test(hostname || "") ? "source-netflix" : "source-video";
    return [platform, ...(slug ? [`title-${slug}`] : [])];
  }

  function computeFloatingPosition(anchor, panel, viewport, margin = 8, gap = 8) {
    const viewportWidth = Math.max(0, Number(viewport?.width) || 0);
    const viewportHeight = Math.max(0, Number(viewport?.height) || 0);
    const panelWidth = Math.min(Math.max(0, Number(panel?.width) || 0), Math.max(0, viewportWidth - margin * 2));
    const panelHeight = Math.min(Math.max(0, Number(panel?.height) || 0), Math.max(0, viewportHeight - margin * 2));
    const left = Math.max(margin, Math.min(viewportWidth - margin - panelWidth, Number(anchor?.left) || margin));
    const anchorTop = Number(anchor?.top) || margin;
    const anchorBottom = Number(anchor?.bottom) || anchorTop;
    const spaceAbove = Math.max(0, anchorTop - gap - margin);
    const spaceBelow = Math.max(0, viewportHeight - anchorBottom - gap - margin);
    const placeAbove = spaceAbove >= panelHeight || spaceAbove > spaceBelow;
    const desiredTop = placeAbove ? anchorTop - gap - panelHeight : anchorBottom + gap;
    const top = Math.max(margin, Math.min(viewportHeight - margin - panelHeight, desiredTop));
    return { left, top, maxHeight: Math.max(80, placeAbove ? spaceAbove : spaceBelow), placement: placeAbove ? "above" : "below" };
  }

  function computeCaptionSafeTop(player, caption, overlayHeight, viewportHeight, padding = 8) {
    const height = Math.max(0, Number(overlayHeight) || 0);
    const topLimit = Math.max(8, player.top + padding);
    const bottomLimit = Math.min(viewportHeight - 8, player.bottom - padding);
    const maxTop = Math.max(topLimit, bottomLimit - height);
    let top = maxTop;
    if (caption) {
      const above = caption.top - 8 - height;
      const below = caption.bottom + 8;
      const followsLowerCaption = caption.top >= player.top + (player.bottom - player.top) * 0.5;
      const overlaps = top < caption.bottom + 4 && top + height > caption.top - 4;
      if (above >= topLimit && (followsLowerCaption || overlaps)) top = above;
      else if (overlaps && below + height <= bottomLimit) top = below;
    }
    return Math.max(topLimit, Math.min(maxTop, top));
  }

  return { normalizeSelection, tokenizeWordBlocks, wordBlockRange, selectionIssue, validateLoopbackHttpUrl, escapeHtml, toAnkiHtml, sourceTags, computeFloatingPosition, computeCaptionSafeTop };
});
