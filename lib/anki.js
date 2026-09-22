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
  function buildNote({ deckName, modelName, fieldMap, values, tags = [] }) {
    if (!deckName || !modelName) throw new Error("请选择牌组和笔记类型");
    const fields = {};
    for (const [key, fieldName] of Object.entries(fieldMap || {})) {
      if (fieldName && values[key] != null) fields[fieldName] = shared.toAnkiHtml(values[key]);
    }
    if (Object.keys(fields).length < 2) throw new Error("至少需要映射词语和释义字段");
    return { deckName, modelName, fields, tags: [...new Set(tags.map((x) => String(x).trim()).filter(Boolean))], options: { allowDuplicate: false, duplicateScope: "deck" } };
  }
  function validateNoteAgainstMetadata(note, { decks, models, fields }) {
    if (!note || typeof note !== "object") throw new Error("卡片数据无效");
    if (!Array.isArray(decks) || !decks.includes(note.deckName)) throw new Error("目标牌组不存在，请刷新设置");
    if (!Array.isArray(models) || !models.includes(note.modelName)) throw new Error("笔记类型不存在，请刷新设置");
    if (!note.fields || typeof note.fields !== "object" || Object.keys(note.fields).length < 2) throw new Error("卡片字段不足");
    const allowed = new Set(fields || []);
    if (Object.keys(note.fields).some((name) => !allowed.has(name))) throw new Error("字段映射已失效，请刷新设置");
    if (Object.values(note.fields).some((value) => typeof value !== "string")) throw new Error("卡片字段格式无效");
    return note;
  }
  return { requestBody, parseResponse, buildNote, validateNoteAgainstMetadata };
});
