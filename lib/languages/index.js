(function (root, factory) {
  const en = typeof module === "object" && module.exports ? require("./en.js") : root.SubtitleLanguageEN;
  const zh = typeof module === "object" && module.exports ? require("./zh.js") : root.SubtitleLanguageZH;
  const ja = typeof module === "object" && module.exports ? require("./ja.js") : root.SubtitleLanguageJA;
  const api = factory({ en, zh, ja });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtitleLanguageProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (profiles) {
  function get(code) { return Object.hasOwn(profiles, code) ? profiles[code] : null; }
  function isTextPlausible(text, code) {
    const value = String(text || "").trim();
    if (!value || /\p{Script=Arabic}/u.test(value)) return false;
    const profile = get(code);
    if (profile) return profile.isTextPlausible(value);
    if (code === "ko") return /\p{Script=Hangul}/u.test(value);
    return profiles.en.isTextPlausible(value);
  }
  return { get, isTextPlausible };
});
