(function (root, factory) {
  const profiles = typeof module === "object" && module.exports ? require("./languages/index.js") : root.SubtitleLanguageProfiles;
  const api = factory(profiles);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DictionaryLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (profiles) {
  const clean = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";

  function inferSourceLanguage(configured, sentence, context = []) {
    if (configured && configured !== "auto") return configured;
    const text = clean(sentence, 500);
    if (/\p{Script=Hangul}/u.test(text)) return "ko";
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "ja";
    if (/\p{Script=Han}/u.test(text) && !/\p{Script=Latin}/u.test(text)) {
      const recent = Array.isArray(context) ? context.slice(-8).reverse() : [];
      for (const line of recent) {
        const previous = clean(line, 500);
        if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(previous)) return "ja";
        if (/\p{Script=Hangul}/u.test(previous) || /\p{Script=Latin}/u.test(previous)) break;
      }
      return "zh";
    }
    return "en";
  }

  function buildMeaningMessages({ term, sentence, source, target }) {
    if (!clean(term, 80)) throw new Error("请选择一个单词或短语");
    const sourceLanguage = inferSourceLanguage(source, sentence);
    const selected = clean(term, 80);
    const japaneseTermOnly = sourceLanguage === "ja" && [...selected].length <= 4;
    const languageInstruction = sourceLanguage === "ja" && (target || "zh") === "zh" ? profiles.get("ja")?.dictionaryInstruction || "" : "";
    return [
      { role: "system", content: `你是简明学习辞书。用${target || "zh"}解释选中内容本身的常用意思，不区分单词或短语。只输出一行“释义：”后接一至两个简短义项，以分号分隔。原句仅用于消歧，不能翻译或概括整句。不要输出第二行、词形、原型、时态、语境说明、词性、整句翻译或新例句。不要 JSON。${languageInstruction}` },
      { role: "user", content: `原句语言：${sourceLanguage}\n选中内容：${selected}${japaneseTermOnly ? "" : `\n视频原句：${clean(sentence, 500)}`}` }
    ];
  }

  function isTargetLanguage(value, language) {
    const text = clean(value, 500);
    if (!profiles.isTextPlausible(text, language)) return false;
    return language !== "zh" || /\p{Script=Han}/u.test(text);
  }

  function unusableMeaning(message = "本地模型没有返回可用释义") {
    const error = new Error(message);
    error.code = "UNUSABLE_MEANING";
    return error;
  }

  function buildMeaningRetryMessages({ term, source, target }) {
    return [
      { role: "system", content: `你是简明辞书。只用${target || "zh"}给出选中内容本身的一个或两个常用意思。只输出释义文字，不要标题、整句翻译、解释或其他内容。` },
      { role: "user", content: `原文语言：${source || "auto"}\n选中内容：${clean(term, 80)}` }
    ];
  }

  function parseMeaningResponse(data, targetLanguage = "zh", context = {}) {
    let raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw unusableMeaning("本地模型没有返回释义");
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^```[\w-]*\s*|\s*```$/g, "").trim();
    if (/<think\b/i.test(raw)) throw unusableMeaning();
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const value = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
        raw = clean(value.meaning || value.contextualMeaning || (Array.isArray(value.definitions) ? value.definitions.join("；") : value.definitions), 300);
      } catch { throw unusableMeaning(); }
    }
    const lines = raw.split(/\r?\n/u).map((line) => line.trim()
      .replace(/^(?:[-*•]\s+|\d+[.)、]\s*)/u, "")
      .replace(/^\*\*((?:释义|词义|意思|含义|meaning)\s*[：:]?)\*\*/iu, "$1"))
      .filter(Boolean);
    const label = /^(?:释义|词义|意思|含义|meaning)\s*[：:]?/iu;
    const labeledIndex = lines.findIndex((line) => label.test(line));
    const definitionLine = labeledIndex >= 0
      ? lines[labeledIndex].replace(label, "").trim() || lines[labeledIndex + 1] || ""
      : lines[0] || "";
    if (/^(?:说明|词形|form)\s*[：:]/iu.test(definitionLine)) throw unusableMeaning();
    let meaning = definitionLine
      .replace(/^(?:["“])|(?:["”])$/g, "").trim();
    const selected = clean(context.term, 80);
    if (selected && meaning.startsWith(selected)) {
      const remainder = meaning.slice(selected.length);
      if (/^\s*[：:—–-]/u.test(remainder)) meaning = remainder.replace(/^\s*[：:—–-]\s*/u, "").trim() || meaning;
    }
    if (targetLanguage === "zh") {
      meaning = meaning.replace(/[（(]([^（）()]*)[）)]/gu, (full, inside) =>
        /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Latin}\p{Script=Hangul}]/u.test(inside) ? "" : full).trim();
    }
    if (!meaning || meaning.length > 80 || /<\/?(?:think|script)[^>]*>/i.test(meaning) || !isTargetLanguage(meaning, targetLanguage)) {
      throw unusableMeaning();
    }
    if (context.source === "ja" && targetLanguage === "zh" && [...clean(context.term, 80)].length <= 4 &&
        meaning.split(/[；;]/u).some((sense) => [...sense.trim()].length > 12)) {
      const error = new Error("日语词条释义过长，可能混入整句翻译");
      error.code = "LOW_QUALITY_DICTIONARY";
      throw error;
    }
    return { meaning };
  }

  return { inferSourceLanguage, buildMeaningMessages, buildMeaningRetryMessages, isTargetLanguage, parseMeaningResponse };
});
