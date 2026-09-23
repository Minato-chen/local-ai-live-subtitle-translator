const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../lib/dictionary.js");

test("dictionary prompt uses only the video sentence", () => {
  const messages = d.buildDictionaryMessages({ term: "run", sentence: "I run.", target: "zh" });
  assert.match(messages[0].content, /不要生成新例句/);
  assert.match(messages[1].content, /视频原句：I run/);
  assert.doesNotMatch(messages[1].content, /新例句语言/);
});
test("parses fenced response", () => {
  const result = d.parseDictionaryResponse({ choices: [{ message: { content: '```json\n{"term":"run","definitions":["跑"]}\n```' } }] });
  assert.deepEqual(result.definitions, ["跑"]);
});
test("rejects malformed or empty response", () => {
  assert.throws(() => d.parseDictionaryResponse({ choices: [{ message: { content: "nope" } }] }), /格式/);
  assert.throws(() => d.parseDictionaryResponse({ choices: [{ message: { content: "{}" } }] }), /有效释义/);
});
test("trims definitions and drops legacy generated examples", () => {
  const content = 'answer: {"term":"x","definitions":["1","2","3","4","5","6"],"generatedExample":"old"} done';
  const result = d.parseDictionaryResponse({ choices: [{ message: { content } }] });
  assert.equal(result.definitions.length, 5);
  assert.equal(Object.hasOwn(result, "generatedExample"), false);
});
test("schema does not request generated examples", () => {
  const format = d.dictionaryResponseFormat();
  assert.equal(format.type, "json_object");
  assert.equal(format.schema.additionalProperties, false);
  assert.equal(Object.hasOwn(format.schema.properties, "generatedExample"), false);
  assert.deepEqual(format.schema.properties.kind.enum, ["word", "phrase"]);
});
test("detects source language and rejects mixed-script corruption", () => {
  assert.equal(d.inferSourceLanguage("auto", "Was that my question?"), "en");
  assert.equal(d.inferSourceLanguage("auto", "これは質問です"), "ja");
  assert.equal(d.inferSourceLanguage("auto", "学校", ["昨日は映画を見た。"]), "ja");
  assert.equal(d.inferSourceLanguage("auto", "学校", ["昨日は映画を見た。", "Hello there!"]), "zh");
  assert.equal(d.inferSourceLanguage("zh", "学校", ["昨日は映画を見た。"]), "zh");
  assert.equal(d.inferSourceLanguage("ja", "学校", []), "ja");
  assert.equal(d.isLanguagePlausible("Was that my question?", "en"), true);
  assert.equal(d.isLanguagePlausible("我没问他 question", "en"), false);
});
test("flags wrong-language definitions and unsafe pronunciation", () => {
  assert.equal(d.needsDefinitionRepair({ definitions: ["neither"] }, "zh"), true);
  assert.equal(d.needsDefinitionRepair({ definitions: ["两者都不"] }, "zh"), false);
  assert.equal(d.isPlausiblePronunciation("'nsðər"), false);
  assert.equal(d.isPlausiblePronunciation("/ˈnaɪðər/"), true);
});
test("rejects sentence-like definitions", () => {
  assert.equal(d.isConciseDefinition("错误，我的错。Bogdan 只是让我留在这里很晚…", "zh"), false);
  assert.equal(d.isConciseDefinition("保持；留下", "zh"), true);
});
test("preserves selected inflected form instead of model lemma", () => {
  assert.equal(d.preserveSelectedTerm({ term: "keep" }, "kept").term, "kept");
});
test("context retry asks for a short meaning of the selected form", () => {
  const messages = d.buildContextMeaningMessages({ term: "kept", sentence: "Bogdan just kept me here late.", target: "zh" });
  assert.match(messages[0].content, /不要翻译整句/);
  assert.match(messages[1].content, /Bogdan just kept/);
});
test("dictionary prompt distinguishes word forms from phrases", () => {
  const word = d.buildDictionaryMessages({ term: "kept", sentence: "He kept me here.", target: "zh" });
  const phrase = d.buildDictionaryMessages({ term: "keep up with", sentence: "Keep up with us.", target: "zh", kind: "phrase" });
  assert.match(word[0].content, /词形关系/);
  assert.match(word[1].content, /请判断单词或短语/);
  assert.match(phrase[1].content, /查询类型：短语/);
});
test("resolves lookup type without extra interaction", () => {
  assert.equal(d.resolveLookupKind("word", "phrase", "kept"), "word");
  assert.equal(d.resolveLookupKind("phrase", "word", "keep up"), "phrase");
  assert.equal(d.resolveLookupKind("auto", "phrase", "気にする"), "phrase");
  assert.equal(d.resolveLookupKind("auto", "word", "食べました"), "word");
  assert.equal(d.resolveLookupKind("auto", "word", "keep up"), "phrase");
  assert.equal(d.resolveLookupKind("auto", "", "気にする"), "unknown");
  assert.equal(d.resolveLookupKind("auto", "word", "这是一个超过二十四个字但仍在短语长度限制内的中文选区内容"), "phrase");
});
test("shows only a nonduplicate short phrase usage note", () => {
  assert.equal(d.phraseUsage({ definitions: ["放弃"], contextualMeaning: "表示停止继续尝试" }, "zh"), "表示停止继续尝试");
  assert.equal(d.phraseUsage({ definitions: ["放弃"], contextualMeaning: "放弃" }, "zh"), "");
});
test("shows a base form only with a plausible form explanation", () => {
  assert.equal(d.trustedLemma({ normalizedTerm: "食べる", formNote: "丁寧过去形" }, "食べました", "ja", "zh"), "食べる");
  assert.equal(d.trustedLemma({ normalizedTerm: "お父さんです", formNote: "" }, "お父さん", "ja", "zh"), "");
  assert.equal(d.trustedLemma({ normalizedTerm: "keep the secret", formNote: "过去式" }, "kept", "en", "zh"), "");
});
test("uses independent Japanese dictionary and context guidance", () => {
  const messages = d.buildDictionaryMessages({ term: "食べました", sentence: "昨日食べました。", source: "ja", target: "zh" });
  assert.match(messages[0].content, /辞书形/);
  assert.match(messages[1].content, /原句语言：ja/);
  assert.match(d.buildContextMeaningMessages({ term: "食べました", sentence: "昨日食べました。", source: "ja", target: "zh" })[0].content, /活用/);
});
test("accepts Japanese kanji terms but rejects Japanese text as Chinese", () => {
  assert.equal(d.isLanguagePlausible("学校", "ja"), true);
  assert.equal(d.isLanguagePlausible("学校へ行きます。", "zh"), false);
});
test("accepts Japanese kana reading without relaxing English IPA checks", () => {
  assert.equal(d.isPlausiblePronunciation("たべる", "ja"), true);
  assert.equal(d.isPlausiblePronunciation("たべる", "en"), false);
});
test("never shows invented Japanese noun conjugation", () => {
  const noun = d.sanitizeWordForm({ partOfSpeech: "noun", normalizedTerm: "お父さんです", formNote: "过去式形式" }, "お父さん", "ja");
  assert.equal(noun.normalizedTerm, "お父さん");
  assert.equal(noun.formNote, "");
  assert.equal(noun.partOfSpeech, "名词");
});
test("Japanese displays only basic known parts of speech", () => {
  assert.equal(d.sanitizeWordForm({ partOfSpeech: "一类动词（五段）" }, "話す", "ja").partOfSpeech, "动词");
  assert.equal(d.sanitizeWordForm({ partOfSpeech: "i-adjective" }, "高い", "ja").partOfSpeech, "形容词");
  assert.equal(d.sanitizeWordForm({ partOfSpeech: "助词" }, "は", "ja").partOfSpeech, "");
  assert.equal(d.sanitizeWordForm({ partOfSpeech: "auxiliary verb" }, "です", "ja").partOfSpeech, "");
  assert.equal(d.sanitizeWordForm({ partOfSpeech: "verb" }, "run", "en").partOfSpeech, "verb");
});
