const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../lib/dictionary.js");

test("one prompt handles words and phrases without grammar or JSON", () => {
  const word = d.buildMeaningMessages({ term: "kept", sentence: "He kept me here.", source: "en", target: "zh" });
  const phrase = d.buildMeaningMessages({ term: "気にする", sentence: "気にしないで。", source: "ja", target: "zh" });
  assert.match(word[0].content, /简明学习辞书/);
  assert.match(word[1].content, /选中内容：kept/);
  assert.match(phrase[1].content, /选中内容：気にする/);
  assert.doesNotMatch(word[0].content, /JSON Schema|词性分析/);
});
test("Japanese short selections are looked up as dictionary headwords", () => {
  const messages = d.buildMeaningMessages({ term: "そこら", sentence: "そこらの武将より頼りになる", source: "ja", target: "zh" });
  assert.match(messages[0].content, /相邻助词、名词或整句内容/);
  assert.match(messages[1].content, /选中内容：そこら/);
  assert.doesNotMatch(messages[1].content, /武将/);
  const phrase = d.buildMeaningMessages({ term: "そこらの武将", sentence: "そこらの武将より頼りになる", source: "ja", target: "zh" });
  assert.match(phrase[1].content, /视频原句：/);
});
test("short Japanese headwords reject sentence-length meanings", () => {
  const context = { source: "ja", term: "そこら" };
  const response = (content) => ({ choices: [{ message: { content } }] });
  assert.deepEqual(d.parseMeaningResponse(response("释义：那一带；附近"), "zh", context), { meaning: "那一带；附近" });
  assert.throws(() => d.parseMeaningResponse(response("释义：那个地方的将领比其他的更可靠"), "zh", context), { code: "LOW_QUALITY_DICTIONARY" });
  assert.deepEqual(d.parseMeaningResponse(response("释义：那个地方的将领比其他的更可靠"), "zh"), { meaning: "那个地方的将领比其他的更可靠" });
});
test("accepts a plain concise meaning", () => {
  assert.deepEqual(d.parseMeaningResponse({ choices: [{ message: { content: "释义：父亲；爸爸" } }] }, "zh"), { meaning: "父亲；爸爸" });
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: "狗" } }] }, "zh").meaning, "狗");
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: "- **释义：** 那一带；附近" } }] }, "zh").meaning, "那一带；附近");
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: "释义：\n那一带；附近" } }] }, "zh").meaning, "那一带；附近");
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: "そこら：那一带（そこら）" } }] }, "zh", { term: "そこら" }).meaning, "那一带");
});
test("ignores an extra explanation line from an older model response", () => {
  assert.deepEqual(d.parseMeaningResponse({ choices: [{ message: { content: "<think>reason</think>释义：保持；留下\n说明：kept → keep（过去式）" } }] }, "zh"), { meaning: "保持；留下" });
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "说明：kept → keep（过去式）" } }] }, "zh"), /可用释义/);
});
test("accepts a JSON answer without requiring one", () => {
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: '{"meaning":"放弃"}' } }] }, "zh").meaning, "放弃");
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: '{"definitions":["放弃","停止尝试"]}' } }] }, "zh").meaning, "放弃；停止尝试");
  assert.equal(d.parseMeaningResponse({ choices: [{ message: { content: '{"meaning":"放弃",}' } }] }, "zh").meaning, "放弃");
});
test("rejects empty, wrong-language, and malformed meanings", () => {
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "" } }] }, "zh"), /可用释义/);
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "keep doing that" } }] }, "zh"), /可用释义/);
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "{bad}" } }] }, "zh"), /可用释义/);
  assert.throws(() => d.parseMeaningResponse({ choices: [{ message: { content: "<think>unfinished" } }] }, "zh"), { code: "UNUSABLE_MEANING" });
  const retry = d.buildMeaningRetryMessages({ term: "そこら", source: "ja", target: "zh" });
  assert.match(retry[1].content, /そこら/);
  assert.doesNotMatch(retry[1].content, /视频原句/);
});
test("infers Japanese from current kana or recent original subtitle", () => {
  assert.equal(d.inferSourceLanguage("auto", "これは質問です"), "ja");
  assert.equal(d.inferSourceLanguage("auto", "学校", ["昨日は映画を見た。"]), "ja");
  assert.equal(d.inferSourceLanguage("auto", "学校", ["昨日は映画を見た。", "Hello there!"]), "zh");
  assert.equal(d.inferSourceLanguage("zh", "学校", ["昨日は映画を見た。"]), "zh");
  assert.equal(d.inferSourceLanguage("ja", "学校", []), "ja");
});
