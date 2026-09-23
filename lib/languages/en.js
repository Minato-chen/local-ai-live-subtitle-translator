(function (root, factory) {
  const profile = factory();
  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.SubtitleLanguageEN = profile;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    code: "en",
    isTextPlausible(text) {
      const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
      const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
      return latin > 0 && cjk <= Math.max(1, latin * 0.2);
    }
  };
});
