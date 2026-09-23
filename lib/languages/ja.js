(function (root, factory) {
  const profile = factory();
  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.SubtitleLanguageJA = profile;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  return {
    code: "ja",
    dictionaryInstruction: "日语专用规则，不套用英语时态/过去式术语。partOfSpeech 只写基本词性：名词、动词或形容词；其他或不确定时留空，不在词性字段写一类/二类动词等细分类别。先判断词性：普通名词（例如 お父さん）没有过去式，不得添加活用说明，不得把相邻的 です 当作该名词原形。动词能确定时写辞书形和活用关系；区分一类（五段）、二类（一段）、三类（サ变/カ变）动词，仅在确定时说明类别。活用术语按实际情况选用：丁寧形（ます形）、た形、て形、ない形、可能形、使役形、受身形、使役受身形；不要因为原句有过去时间就推断选中词是过去形。形容词可说明对应活用。保留用户选中的表面形；normalizedTerm 仅在有把握时写辞书形。formNote 用释义目标语言简短说明实际活用关系，例如 食べました→食べる（二类动词、丁寧过去形）；不确定就留空。助词、助动词不要硬并入辞书形。pronunciation 可用假名标注读音，不要编造 IPA。短语解释整体含义，不逐字拼接。",
    contextInstruction: "日语请依据选中表面形及其助词、活用在当前句中的作用解释，不要把整句翻译当作词义。",
    sanitizeWordForm(entry, term) {
      const raw = String(entry.partOfSpeech || "").toLocaleLowerCase().trim();
      let partOfSpeech = "";
      if (!/\b(auxiliary|pronoun|adverb|particle)\b|助動詞|助动词|代名詞|代名词|副詞|副词|助詞|助词/.test(raw)) {
        if (/\bnoun\b|名詞|名词/.test(raw)) partOfSpeech = "名词";
        else if (/\bverb\b|動詞|动词/.test(raw)) partOfSpeech = "动词";
        else if (/\badjective\b|形容詞|形容词|形容動詞|形容动词/.test(raw)) partOfSpeech = "形容词";
      }
      if (partOfSpeech === "名词") return { ...entry, partOfSpeech, normalizedTerm: term, formNote: "" };
      return { ...entry, partOfSpeech };
    },
    isPronunciationPlausible(text) {
      return !text || /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u.test(text) ||
        (/^[/\[].+[/\]]$/.test(text) && !/[\p{Script=Han}\p{Script=Arabic}]/u.test(text));
    },
    isTextPlausible(text) {
      // Japanese terms can be entirely kanji, so kana must not be mandatory.
      const japanese = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
      const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
      return japanese > 0 && latin <= Math.max(2, japanese * 0.3) && !/\p{Script=Hangul}/u.test(text);
    }
  };
});
