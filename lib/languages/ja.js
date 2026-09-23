(function (root, factory) {
  const profile = factory();
  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.SubtitleLanguageJA = profile;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    code: "ja",
    isTextPlausible(text) {
      const japanese = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
      const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
      return japanese > 0 && latin <= Math.max(2, japanese * 0.3) && !/\p{Script=Hangul}/u.test(text);
    }
  };
});
