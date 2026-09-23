(function (root, factory) {
  const profiles = typeof module === "object" && module.exports ? require("./languages/index.js") : root.SubtitleLanguageProfiles;
  const api = factory(profiles);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DictionaryLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (profiles) {
  const DICTIONARY_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
      term: { type: "string" },
      normalizedTerm: { type: "string" },
      pronunciation: { type: "string" },
      partOfSpeech: { type: "string" },
      formNote: { type: "string" },
      definitions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
      contextualMeaning: { type: "string" }
    },
    required: ["term", "normalizedTerm", "pronunciation", "partOfSpeech", "formNote", "definitions", "contextualMeaning"]
  };

  const DICTIONARY_PROMPT_TEMPLATE = [
    "你是双语学习词典。严格按 JSON Schema 返回字段，不增加其他字段。",
    "定义规则：definitions 是简明、互不重复的目标语言释义；contextualMeaning 只解释该词在当前视频句中的具体意思，不要复述 definitions。",
    "只使用用户提供的视频原句作为语境，不要生成新例句，也不要把整句翻译当作词义。",
    "单词查询时，normalizedTerm 是可确定的词典词头；如与查询词不同，formNote 用目标语言简短说明词形关系，否则留空。不确定时不要猜。短语查询时解释整体含义，不强行给读音、词性或词形说明。",
    "pronunciation 使用该语言常见的简洁读音标记；partOfSpeech 使用常见词性名称。信息不确定时返回空字符串或空数组，不要猜测。只返回 JSON。"
  ].join("\n");

  const clean = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
  function buildDictionaryMessages({ term, sentence, source, target, kind = "word" }) {
    if (!clean(term, 80)) throw new Error("请选择一个单词或短语");
    const sourceLanguage = source && source !== "auto" ? source : inferSourceLanguage("auto", sentence);
    const profileInstruction = profiles.get(sourceLanguage)?.dictionaryInstruction || "";
    return [
      { role: "system", content: [DICTIONARY_PROMPT_TEMPLATE, profileInstruction].filter(Boolean).join("\n") },
      { role: "user", content: `查询类型：${kind === "phrase" ? "短语" : "单词"}\n查询内容：${clean(term, 80)}\n视频原句：${clean(sentence, 500)}\n释义目标语言：${target || "zh"}\n原句语言：${sourceLanguage}` }
    ];
  }
  function buildContextMeaningMessages({ term, sentence, source, target }) {
    const sourceLanguage = inferSourceLanguage(source, sentence);
    const profileInstruction = profiles.get(sourceLanguage)?.contextInstruction || "";
    return [
      { role: "system", content: [`只解释选中的词或短语在当前句中的含义。用${target || "zh"}输出一个简短释义；不要翻译整句，不要添加例句或说明。`, profileInstruction].filter(Boolean).join("\n") },
      { role: "user", content: `选中内容：${clean(term, 80)}\n当前句：${clean(sentence, 500)}` }
    ];
  }
  function preserveSelectedTerm(entry, term) {
    return { ...entry, term: clean(term, 80) };
  }
  function sanitizeWordForm(entry, term, sourceLanguage) {
    const profile = profiles.get(sourceLanguage);
    return profile?.sanitizeWordForm ? profile.sanitizeWordForm(entry, clean(term, 80)) : entry;
  }
  function parseDictionaryResponse(data) {
    let raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("词典服务没有返回内容");
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
    const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("词典返回格式无效");
    let value; try { value = JSON.parse(raw.slice(start, end + 1)); } catch { throw new Error("词典返回格式无效"); }
    const definitions = Array.isArray(value.definitions) ? value.definitions.map((x) => clean(x, 300)).filter(Boolean).slice(0, 5) : [];
    const result = {
      term: clean(value.term, 80), normalizedTerm: clean(value.normalizedTerm, 80), pronunciation: clean(value.pronunciation, 120),
      partOfSpeech: clean(value.partOfSpeech, 80), formNote: clean(value.formNote, 120), definitions, contextualMeaning: clean(value.contextualMeaning, 500)
    };
    if (!result.term && !definitions.length && !result.contextualMeaning) throw new Error("词典没有返回有效释义");
    return result;
  }
  function dictionaryResponseFormat() {
    return { type: "json_object", schema: DICTIONARY_SCHEMA };
  }
  function inferSourceLanguage(configured, sentence) {
    if (configured && configured !== "auto") return configured;
    const text = clean(sentence, 500);
    if (/\p{Script=Hangul}/u.test(text)) return "ko";
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "ja";
    if (/\p{Script=Han}/u.test(text) && !/\p{Script=Latin}/u.test(text)) return "zh";
    return "en";
  }
  function isLanguagePlausible(value, language) {
    const text = clean(value, 500);
    return profiles.isTextPlausible(text, language);
  }
  function isTargetLanguage(value, language) {
    const text = clean(value, 500);
    if (!isLanguagePlausible(text, language)) return false;
    if (language === "zh") return (text.match(/\p{Script=Han}/gu) || []).length >= 2 && !/\p{Script=Arabic}/u.test(text);
    return true;
  }
  function needsDefinitionRepair(entry, targetLanguage) {
    return !Array.isArray(entry.definitions) || !entry.definitions.some((value) => isConciseDefinition(value, targetLanguage));
  }
  function isConciseDefinition(value, targetLanguage) {
    const text = clean(value, 300);
    if (!isTargetLanguage(text, targetLanguage) || text.length > 48) return false;
    if (/[。！？!?…]/u.test(text)) return false;
    if (targetLanguage === "zh" && /[A-Za-z]{3,}/u.test(text)) return false;
    return true;
  }
  function isPlausiblePronunciation(value, sourceLanguage = "en") {
    const text = clean(value, 120);
    const profile = profiles.get(sourceLanguage);
    if (profile?.isPronunciationPlausible) return profile.isPronunciationPlausible(text);
    return !text || (/^[/\[].+[/\]]$/.test(text) && !/[\p{Script=Han}\p{Script=Arabic}]/u.test(text));
  }
  return { DICTIONARY_SCHEMA, DICTIONARY_PROMPT_TEMPLATE, buildDictionaryMessages, buildContextMeaningMessages, preserveSelectedTerm, sanitizeWordForm, dictionaryResponseFormat, parseDictionaryResponse, inferSourceLanguage, isLanguagePlausible, isTargetLanguage, needsDefinitionRepair, isConciseDefinition, isPlausiblePronunciation };
});
