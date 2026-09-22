const test = require("node:test"); const assert = require("node:assert/strict"); const a = require("../lib/anki.js");
test("builds API envelope", () => assert.deepEqual(a.requestBody("version"), { action: "version", version: 6, params: {} }));
test("parses Anki response", () => { assert.equal(a.parseResponse({ result: 6, error: null }), 6); assert.throws(() => a.parseResponse({ result: null, error: "bad" }), /bad/); });
test("builds escaped note", () => { const n = a.buildNote({ deckName: "D", modelName: "Basic", fieldMap: { term: "Front", meaning: "Back" }, values: { term: "<x>", meaning: "m" }, tags: ["one", "one"] }); assert.equal(n.fields.Front, "&lt;x&gt;"); assert.deepEqual(n.tags, ["one"]); });
test("rejects incomplete note configuration", () => { assert.throws(() => a.buildNote({ deckName: "", modelName: "Basic" }), /牌组/); assert.throws(() => a.buildNote({ deckName: "D", modelName: "Basic", fieldMap: { term: "Front", meaning: "Front" }, values: { term: "x", meaning: "m" } }), /映射/); });
test("rejects malformed Anki envelope", () => assert.throws(() => a.parseResponse({ result: 1 }), /格式/));
