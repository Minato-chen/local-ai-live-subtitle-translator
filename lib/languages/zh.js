(function (root, factory) {
  const profile = factory();
  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.SubtitleLanguageZH = profile;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    code: "zh",
    isTextPlausible(text) {
      return /\p{Script=Han}/u.test(text) &&
        !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
    }
  };
});
