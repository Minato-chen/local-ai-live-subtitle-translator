const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../lib/shared.js");
test("normalizes multilingual selections", () => { assert.equal(s.normalizeSelection("  “hello-world!” "), "hello-world"); assert.equal(s.normalizeSelection("「日本語」"), "日本語"); });
test("rejects invalid selection", () => { assert.equal(s.normalizeSelection(""), ""); assert.equal(s.normalizeSelection("x".repeat(81)), ""); });
test("accepts loopback only", () => { assert.equal(s.validateLoopbackHttpUrl("http://127.0.0.1:8765"), "http://127.0.0.1:8765"); assert.throws(() => s.validateLoopbackHttpUrl("https://example.com")); });
test("escapes Anki HTML", () => assert.equal(s.toAnkiHtml("<b>x</b>\ny"), "&lt;b&gt;x&lt;/b&gt;<br>y"));
test("builds privacy-preserving source tags", () => assert.deepEqual(s.sourceTags("My Movie!", "www.youtube.com"), ["source-youtube", "title-my-movie"]));
