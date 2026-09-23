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

  return { normalizeSelection, tokenizeWordBlocks, wordBlockRange, validateLoopbackHttpUrl, escapeHtml, toAnkiHtml, sourceTags, computeFloatingPosition };
});
