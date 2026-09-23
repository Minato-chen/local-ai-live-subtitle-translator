(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DictionaryLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DICTIONARY_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
      term: { type: "string" },
      normalizedTerm: { type: "string" },
      pronunciation: { type: "string" },
      partOfSpeech: { type: "string" },
      definitions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
      contextualMeaning: { type: "string" },
      generatedExample: { type: "string" },
      generatedExampleTranslation: { type: "string" }
    },
    required: ["term", "normalizedTerm", "pronunciation", "partOfSpeech", "definitions", "contextualMeaning", "generatedExample", "generatedExampleTranslation"]
  };

  const DICTIONARY_PROMPT_TEMPLATE = [
    "你是双语学习词典。严格按 JSON Schema 返回字段，不增加其他字段。",
    "定义规则：definitions 是简明、互不重复的目标语言释义；contextualMeaning 只解释该词在当前视频句中的具体意思，不要复述 definitions。",
    "例句规则：generatedExample 必须是包含查询词、使用用户指定新例句语言的自然新句子，不能复制视频原句；generatedExampleTranslation 是该新句子的目标语言翻译。",
    "pronunciation 使用简洁音标；partOfSpeech 使用常见词性名称。信息不确定时返回空字符串或空数组，不要猜测。只返回 JSON。"
  ].join("\n");

  const clean = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
  function buildDictionaryMessages({ term, sentence, source, target }) {
    if (!clean(term, 80)) throw new Error("请选择一个单词或短语");
    return [
      { role: "system", content: DICTIONARY_PROMPT_TEMPLATE },
      { role: "user", content: `查询词：${clean(term, 80)}\n视频原句：${clean(sentence, 500)}\n释义目标语言：${target || "zh"}\n新例句语言：${source && source !== "auto" ? source : inferSourceLanguage("auto", sentence)}` }
    ];
  }
  function buildContextMeaningMessages({ term, sentence, target }) {
    return [
      { role: "system", content: `只解释选中的词或短语在当前句中的含义。用${target || "zh"}输出一个简短释义；不要翻译整句，不要添加例句或说明。` },
      { role: "user", content: `选中内容：${clean(term, 80)}\n当前句：${clean(sentence, 500)}` }
    ];
  }
  function preserveSelectedTerm(entry, term) {
    return { ...entry, term: clean(term, 80) };
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
      partOfSpeech: clean(value.partOfSpeech, 80), definitions, contextualMeaning: clean(value.contextualMeaning, 500),
      generatedExample: clean(value.generatedExample, 500), generatedExampleTranslation: clean(value.generatedExampleTranslation, 500)
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
    if (!text || /\p{Script=Arabic}/u.test(text)) return false;
    if (language === "zh") return /\p{Script=Han}/u.test(text);
    if (language === "ja") return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
    if (language === "ko") return /\p{Script=Hangul}/u.test(text);
    const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
    const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
    return latin > 0 && cjk <= Math.max(1, latin * 0.2);
  }
  function classifyExamplePair(entry, term, sourceLanguage = "en", targetLanguage = "zh") {
    const contains = (value) => containsQueryTerm(value, term);
    if (contains(entry?.generatedExample) && isLanguagePlausible(entry.generatedExample, sourceLanguage)) return { action: "keep" };
    if (contains(entry?.generatedExampleTranslation) && isLanguagePlausible(entry.generatedExampleTranslation, sourceLanguage)) return { action: "swap" };
    const candidates = [entry?.generatedExampleTranslation, entry?.generatedExample].map((value) => clean(value, 500));
    return { action: "reverse", targetExample: candidates.find((value) => isLanguagePlausible(value, targetLanguage)) || "" };
  }
  function containsQueryTerm(value, term) {
    const query = clean(term, 80).toLocaleLowerCase();
    const text = clean(value, 500).toLocaleLowerCase();
    if (!query || !text) return false;
    if (/[^\p{Script=Latin}\p{N}\s'’\-]/u.test(query)) return text.includes(query);
    const words = (value) => value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
    const needle = words(query); const haystack = words(text);
    if (!needle.length) return false;
    return haystack.some((_, index) => needle.every((word, offset) => haystack[index + offset] === word));
  }
  function sameExample(a, b) {
    const normalize = (value) => clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    return Boolean(normalize(a)) && normalize(a) === normalize(b);
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
  function isPlausiblePronunciation(value) {
    const text = clean(value, 120);
    return !text || (/^[/\[].+[/\]]$/.test(text) && !/[\p{Script=Han}\p{Script=Arabic}]/u.test(text));
  }
  return { DICTIONARY_SCHEMA, DICTIONARY_PROMPT_TEMPLATE, buildDictionaryMessages, buildContextMeaningMessages, preserveSelectedTerm, dictionaryResponseFormat, parseDictionaryResponse, inferSourceLanguage, isLanguagePlausible, isTargetLanguage, needsDefinitionRepair, isConciseDefinition, isPlausiblePronunciation, containsQueryTerm, sameExample, classifyExamplePair };
});
