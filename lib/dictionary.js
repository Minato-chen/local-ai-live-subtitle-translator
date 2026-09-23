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
    return [
      { role: "system", content: `你帮助用户理解视频字幕。用${target || "zh"}简短解释选中内容在原句中的意思；必要时加一句用法说明。不要翻译整句，不要生成例句，不要分析词性、原形或语法。只输出释义文字，不要 JSON 或标题。` },
      { role: "user", content: `原句语言：${sourceLanguage}\n选中内容：${clean(term, 80)}\n视频原句：${clean(sentence, 500)}` }
    ];
  }

  function isTargetLanguage(value, language) {
    const text = clean(value, 500);
    if (!profiles.isTextPlausible(text, language)) return false;
    return language !== "zh" || /\p{Script=Han}/u.test(text);
  }

  function parseMeaningResponse(data, targetLanguage = "zh") {
    let raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("本地模型没有返回释义");
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^```[\w-]*\s*|\s*```$/g, "")
      .replace(/^(?:释义|词义|意思|含义|meaning)\s*[：:]\s*/iu, "")
      .trim();
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const value = JSON.parse(raw);
        raw = clean(value.meaning || value.contextualMeaning || (Array.isArray(value.definitions) ? value.definitions.join("；") : value.definitions), 300);
      } catch { throw new Error("本地模型没有返回可用释义"); }
    }
    raw = raw.replace(/^(["“])|(["”])$/g, "").trim();
    if (!raw || raw.length > 180 || /<\/?(?:think|script)[^>]*>/i.test(raw) || !isTargetLanguage(raw, targetLanguage)) {
      throw new Error("本地模型没有返回可用释义");
    }
    return raw;
  }

  return { inferSourceLanguage, buildMeaningMessages, isTargetLanguage, parseMeaningResponse };
});
