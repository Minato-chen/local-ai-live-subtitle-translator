const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("content script starts when a YouTube page navigates into a video", () => {
  let observer;
  let initializationCalls = 0;
  const context = {
    location: { hostname: "www.youtube.com", pathname: "/" },
    document: { documentElement: {} },
    chrome: { storage: { sync: { get: () => { initializationCalls++; return new Promise(() => {}); } } } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      disconnect() { this.disconnected = true; }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../content.js"), "utf8"), context);
  assert.equal(initializationCalls, 0);
  context.location.pathname = "/watch";
  observer.callback();
  assert.equal(initializationCalls, 1);
  assert.equal(observer.disconnected, true);
});

test("switching videos clears prior subtitle context before reading the new page", () => {
  const context = {
    location: { hostname: "www.youtube.com", pathname: "/watch", search: "?v=one" },
    chrome: { storage: { sync: { get: () => new Promise(() => {}) } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../content.js"), "utf8"), context);
  let cleared = false;
  context.clearSubtitle = () => { cleared = true; };
  vm.runInContext('overlay = {}; lastPageKey = "/watch?v=one"; lastSource = "old subtitle"; subtitleHistory.push("old subtitle"); cache.set("old", "translation");', context);
  context.location.search = "?v=two";
  context.scanSubtitles();
  assert.equal(cleared, true);
  assert.equal(vm.runInContext("subtitleHistory.length", context), 0);
  assert.equal(vm.runInContext("cache.size", context), 0);
});

test("playback translation does not fill the dictionary card's fragment translation", () => {
  const context = {
    location: { hostname: "www.youtube.com", pathname: "/watch" },
    chrome: { storage: { sync: { get: () => new Promise(() => {}) } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../content.js"), "utf8"), context);
  vm.runInContext(`
    lastSource = "that enduring presence on the lunar surface,";
    lastDictionaryEntry = { videoSentence: lastSource, videoSentenceTranslation: "" };
    translatedLine = { textContent: "" };
    statusLine = { textContent: "" };
    positionOverlay = () => {};
    showTranslation("启动机器人，开始建立持久存在。", requestVersion);
  `, context);
  assert.equal(vm.runInContext("translatedLine.textContent", context), "启动机器人，开始建立持久存在。");
  assert.equal(vm.runInContext("lastDictionaryEntry.videoSentenceTranslation", context), "");
});

test("zero context lines sends no prior subtitles", () => {
  const context = {
    location: { hostname: "www.youtube.com", pathname: "/watch" },
    chrome: { storage: { sync: { get: () => new Promise(() => {}) } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../content.js"), "utf8"), context);
  vm.runInContext('subtitleHistory.push("previous one", "previous two"); settings.contextLines = 0;', context);
  assert.deepEqual(Array.from(context.recentTranslationContext()), []);
  vm.runInContext("settings.contextLines = 1", context);
  assert.deepEqual(Array.from(context.recentTranslationContext()), ["previous two"]);
});

test("closing lookup cancels its in-flight fragment translation", () => {
  const sent = [];
  const context = {
    location: { hostname: "www.youtube.com", pathname: "/watch" },
    chrome: { storage: { sync: { get: () => new Promise(() => {}) } }, runtime: { sendMessage: (message) => { sent.push(message); return Promise.resolve({ ok: true }); } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../content.js"), "utf8"), context);
  vm.runInContext('activeFragmentRequestId = "fragment-test"; closeInteractivePanels();', context);
  assert.equal(sent[0].type, "CANCEL_FRAGMENT_TRANSLATION");
  assert.equal(sent[0].requestId, "fragment-test");
  assert.equal(vm.runInContext("activeFragmentRequestId", context), null);
});
