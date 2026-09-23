(function (root, factory) {
  const profile = factory();
  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.SubtitleLanguageZH = profile;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    code: "zh",
    dictionaryInstruction: "中文单词：不要套用英语时态或词形术语；只有明确存在词头与词形差异时才填写 formNote。短语解释整体语义。",
    isTextPlausible(text) {
      return /\p{Script=Han}/u.test(text) &&
        !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
    }
  };
});
