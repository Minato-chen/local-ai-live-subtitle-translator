const test = require("node:test"); const assert = require("node:assert/strict"); const d = require("../lib/dictionary.js");
test("builds dictionary prompt", () => assert.match(d.buildDictionaryMessages({ term: "run", sentence: "I run.", target: "zh" })[1].content, /run/));
test("parses fenced response", () => { const r = d.parseDictionaryResponse({ choices: [{ message: { content: '```json\n{"term":"run","definitions":["跑"],"generatedExample":"I run daily."}\n```' } }] }); assert.deepEqual(r.definitions, ["跑"]); });
test("rejects malformed response", () => assert.throws(() => d.parseDictionaryResponse({ choices: [{ message: { content: "nope" } }] }), /格式/));
