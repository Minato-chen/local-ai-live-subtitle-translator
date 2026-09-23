(function (root, factory) {
  const profile = factory();
  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.SubtitleLanguageEN = profile;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    code: "en",
    dictionaryInstruction: "英语单词：normalizedTerm 只在能确定词典原形时填写；formNote 简短说明选中词形与原形的关系。英语短语解释整体含义。",
    isTextPlausible(text) {
      const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
      const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
      return latin > 0 && cjk <= Math.max(1, latin * 0.2);
    }
  };
});
