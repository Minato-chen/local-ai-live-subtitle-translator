(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtitleShared = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeSelection(value, maxLength = 80) {
    const text = String(value || "").replace(/\s+/g, " ").trim()
      .replace(/^[\s.,!?;:，。！？；："“”'‘’()[\]{}<>《》【】「」『』]+|[\s.,!?;:，。！？；："“”'‘’()[\]{}<>《》【】「」『』]+$/g, "");
    if (!text || text.length > maxLength) return "";
    return text;
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

  return { normalizeSelection, validateLoopbackHttpUrl, escapeHtml, toAnkiHtml, sourceTags };
});
