(function (root, factory) {
  const profile = factory();
  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.SubtitleLanguageJA = profile;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    code: "ja",
    dictionaryInstruction: "日语选中内容是唯一要解释的词条。输出它本身的常用中文义项；不要把相邻助词、名词或整句内容写入释义。例如选中「そこら」时解释“那一带；附近”，不要解释含有「そこら」的整句。",
    isTextPlausible(text) {
      const japanese = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
      const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
      return japanese > 0 && latin <= Math.max(2, japanese * 0.3) && !/\p{Script=Hangul}/u.test(text);
    }
  };
});
