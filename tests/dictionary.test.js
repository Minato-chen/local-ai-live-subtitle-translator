const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../lib/dictionary.js");

test("one prompt handles words and phrases without grammar or JSON", () => {
  const word = d.buildMeaningMessages({ term: "kept", sentence: "He kept me here.", source: "en", target: "zh" });
  const phrase = d.buildMeaningMessages({ term: "気にする", sentence: "気にしないで。", source: "ja", target: "zh" });
  assert.match(word[0].content, /只输出释义文字/);
  assert.match(word[1].content, /选中内容：kept/);
  assert.match(phrase[1].content, /选中内容：気にする/);
  assert.doesNotMatch(word[0].content, /JSON Schema|词性分析/);
});
test("accepts a plain concise meaning", () => {
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: "释义：父亲；爸爸" } }] }, "zh"), "父亲；爸爸");
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: "狗" } }] }, "zh"), "狗");
});
test("accepts explanation and strips model think text", () => {
  const result = d.parseMeaningResponse({ choices: [{ message: { content: "<think>reason</think>表示放弃继续尝试，用于这里的语境。" } }] }, "zh");
  assert.match(result, /放弃继续尝试/);
});
test("accepts a JSON answer without requiring one", () => {
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: '{"meaning":"放弃"}' } }] }, "zh"), "放弃");
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: '{"definitions":["放弃","停止尝试"]}' } }] }, "zh"), "放弃；停止尝试");
});
test("rejects empty, wrong-language, and malformed meanings", () => {
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "" } }] }, "zh"), /可用释义/);
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "keep doing that" } }] }, "zh"), /可用释义/);
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "{bad}" } }] }, "zh"), /可用释义/);
});
test("infers Japanese from current kana or recent original subtitle", () => {
  assert.equal(d.inferSourceLanguage("auto", "これは質問です"), "ja");
  assert.equal(d.inferSourceLanguage("auto", "学校", ["昨日は映画を見た。"]), "ja");
  assert.equal(d.inferSourceLanguage("auto", "学校", ["昨日は映画を見た。", "Hello there!"]), "zh");
  assert.equal(d.inferSourceLanguage("zh", "学校", ["昨日は映画を見た。"]), "zh");
  assert.equal(d.inferSourceLanguage("ja", "学校", []), "ja");
});
