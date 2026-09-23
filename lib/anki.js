(function (root, factory) {
  const shared = typeof module === "object" && module.exports ? require("./shared.js") : root.SubtitleShared;
  const api = factory(shared);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AnkiLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (shared) {
  function requestBody(action, params = {}) { return { action, version: 6, params }; }
  function parseResponse(value) {
    if (!value || !("result" in value) || !("error" in value)) throw new Error("AnkiConnect 返回格式无效");
    if (value.error) throw new Error(String(value.error));
    return value.result;
  }
  function composeBackHtml(values) {
    const esc = shared.toAnkiHtml;
    if (!String(values.meaning || "").trim()) throw new Error("请填写释义后再添加卡片");
    const meaning = [values.partOfSpeech, values.meaning].map((value) => String(value || "").trim()).filter(Boolean).join("；");
    const sections = [`<div>${esc(meaning)}</div>`];
    function example(label, sentence, translation) {
      if (!String(sentence || "").trim()) return;
      const lines = [`<div><strong>${label}</strong><br>${esc(sentence)}`];
      if (String(translation || "").trim()) lines.push(`<br>译文：${esc(translation)}`);
      lines.push("</div>");
      sections.push(lines.join(""));
    }
    example("视频原句", values.videoSentence, values.videoTranslation);
    example("新例句", values.generatedExample, values.exampleTranslation);
    return sections.join("<br>");
  }
  function buildNote({ deckName, modelName, fieldMap, values, tags = [] }) {
    if (!deckName || !modelName) throw new Error("请选择牌组和笔记类型");
    if (modelName !== "Basic") throw new Error("目前只支持 Basic 笔记类型");
    const front = fieldMap?.term;
    const back = fieldMap?.cardBack || fieldMap?.meaning;
    if (front !== "Front" || back !== "Back") throw new Error("Basic 仅支持 Front 和 Back 字段");
    if (!String(values?.term || "").trim()) throw new Error("请填写单词");
    const fields = { [front]: shared.toAnkiHtml(values.term), [back]: composeBackHtml(values) };
    return { deckName, modelName, fields, tags: [...new Set(tags.map((x) => String(x).trim()).filter(Boolean))], options: { allowDuplicate: false, duplicateScope: "deck" } };
  }
  function templateSupportsFields(templates, frontField, backField) {
    return Object.values(templates || {}).some((sides) => Array.isArray(sides) &&
      Array.isArray(sides[0]) && sides[0].includes(frontField) &&
      Array.isArray(sides[1]) && sides[1].includes(backField));
  }
  function validateNoteAgainstMetadata(note, { decks, models, fields, templates }) {
    if (!note || typeof note !== "object") throw new Error("卡片数据无效");
    if (!Array.isArray(decks) || !decks.includes(note.deckName)) throw new Error("目标牌组不存在，请刷新设置");
    if (!Array.isArray(models) || !models.includes(note.modelName)) throw new Error("笔记类型不存在，请刷新设置");
    if (note.modelName !== "Basic") throw new Error("目前只支持 Basic 笔记类型");
    if (!note.fields || typeof note.fields !== "object" || Object.keys(note.fields).length < 2) throw new Error("卡片字段不足");
    if (Object.keys(note.fields).length !== 2 || !Object.hasOwn(note.fields, "Front") || !Object.hasOwn(note.fields, "Back")) throw new Error("Basic 仅支持 Front 和 Back 字段");
    const allowed = new Set(fields || []);
    if (Object.keys(note.fields).some((name) => !allowed.has(name))) throw new Error("字段映射已失效，请刷新设置");
    if (Object.values(note.fields).some((value) => typeof value !== "string")) throw new Error("卡片字段格式无效");
    if (templates && !templateSupportsFields(templates, ...Object.keys(note.fields))) throw new Error("所选笔记类型的卡片模板未在正反面显示对应字段");
    return note;
  }
  return { requestBody, parseResponse, composeBackHtml, buildNote, templateSupportsFields, validateNoteAgainstMetadata };
});
