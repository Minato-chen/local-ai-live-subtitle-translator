const I18N = {
  zh: {
    "本地 AI 实时字幕翻译": "本地 AI 实时字幕翻译", "启用实时翻译": "启用实时翻译", "翻译服务设置": "翻译服务设置", "界面语言": "界面语言", "语言 / Language": "语言 / Language",
    "将 Netflix 或 YouTube 字幕发送到你选择的翻译服务；默认推荐本机 llama.cpp + Hy-MT2。": "将 Netflix 或 YouTube 字幕发送到你选择的翻译服务；默认推荐本机 llama.cpp + Hy-MT2。", "启动本地翻译服务": "启动本地翻译服务", "本地服务连接（可选）": "本地服务连接（可选）", "翻译与字幕设置": "翻译与字幕设置", "翻译语言": "翻译语言", "字幕显示": "字幕显示", "保存设置": "保存设置", "检查服务": "检查服务", "自动识别": "自动识别", "英语": "英语", "日语": "日语", "韩语": "韩语", "简体中文": "简体中文", "法语": "法语", "德语": "德语", "西班牙语": "西班牙语", "原字幕上方": "原字幕上方", "原字幕下方": "原字幕下方", "播放器底部（自动避让）": "播放器底部（自动避让）", "播放器顶部（自动避让）": "播放器顶部（自动避让）", "译文颜色": "译文颜色", "字号（px）": "字号（px）", "文字描边": "文字描边", "描边粗细（px）": "描边粗细（px）", "描边颜色": "描边颜色", "半透明背景": "半透明背景", "背景不透明度（%）": "背景不透明度（%）", "背景颜色": "背景颜色", "前文参考条数": "前文参考条数", "本地服务地址": "本地服务地址"
  },
  en: {
    "本地 AI 实时字幕翻译": "Local AI Live Subtitle Translator", "启用实时翻译": "Enable live translation", "翻译服务设置": "Translation service settings", "界面语言": "Interface language", "语言 / Language": "Language / 语言",
    "将 Netflix 或 YouTube 字幕发送到你选择的翻译服务；默认推荐本机 llama.cpp + Hy-MT2。": "Send Netflix or YouTube subtitles to your selected translator. llama.cpp + Hy-MT2 is recommended.", "启动本地翻译服务": "Start local translation service", "本地服务连接（可选）": "Local service connection (optional)", "翻译与字幕设置": "Translation and subtitle settings", "翻译语言": "Translation language", "字幕显示": "Subtitle display", "保存设置": "Save settings", "检查服务": "Check service", "自动识别": "Auto-detect", "英语": "English", "日语": "Japanese", "韩语": "Korean", "简体中文": "Simplified Chinese", "法语": "French", "德语": "German", "西班牙语": "Spanish", "原字幕上方": "Above original subtitles", "原字幕下方": "Below original subtitles", "播放器底部（自动避让）": "Player bottom (auto-avoid)", "播放器顶部（自动避让）": "Player top (auto-avoid)", "译文颜色": "Translation color", "字号（px）": "Font size (px)", "文字描边": "Text outline", "描边粗细（px）": "Outline width (px)", "描边颜色": "Outline color", "半透明背景": "Semi-transparent background", "背景不透明度（%）": "Background opacity (%)", "背景颜色": "Background color", "前文参考条数": "Context lines", "本地服务地址": "Local service URL",
    "推荐使用 Hy-MT2；首次运行会下载模型。使用其他模型时，请按模型文档启动兼容服务。": "Hy-MT2 is recommended; the first run downloads the model. For other models, follow their documentation.", "保持服务窗口开启，然后刷新 Netflix 或 YouTube 播放页面。": "Keep the service window open, then refresh the Netflix or YouTube page.", "默认地址为": "Default address:", "可修改端口，但服务必须运行在本机，并提供 OpenAI 兼容接口。": "You may change the port, but the service must run locally and provide an OpenAI-compatible API.", "语言选择只会写入每次请求的翻译提示，不会切换模型。明确源语言通常更稳定，但速度提升有限；“自动识别”适合混合语言字幕。": "Language selection only affects the translation prompt. Explicit source languages may improve stability; auto-detect suits mixed subtitles.", "默认采用原来的白字黑色半透明背景样式。描边和背景关闭后，对应颜色、粗细或透明度设置会暂时不可编辑；前文条数越多，代词和上下文可能更准确，但请求会略慢，实时优先建议设为 0。": "The default style uses white text with a translucent black background. More context may improve coherence but slightly slows requests; use 0 for real-time priority."
  }
};

Object.assign(I18N.en, {
  "源语言": "Source language",
  "目标语言": "Target language",
  "位置": "Position",
  "可修改端口，但服务必须运行在本机，并提供 OpenAI 兼容接口。": "You may change the port, but the service must run locally and provide an OpenAI-compatible API."
  ,"。可修改端口，但服务必须运行在本机，并提供 OpenAI 兼容接口。": ". You may change the port, but the service must run locally and provide an OpenAI-compatible API."
});

async function initI18n() {
  const { uiLanguage = "zh" } = await chrome.storage.sync.get({ uiLanguage: "zh" });
  const select = document.getElementById("uiLanguage");
  if (select) { select.value = uiLanguage; select.addEventListener("change", () => chrome.storage.sync.set({ uiLanguage: select.value }).then(() => location.reload())); }
  applyI18n(uiLanguage);
}
function applyI18n(language) {
  const dict = I18N[language] || I18N.zh;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) { const key = node.nodeValue.trim(); if (dict[key]) node.nodeValue = node.nodeValue.replace(key, dict[key]); }
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  if (document.title) document.title = language === "en" ? "Local AI Live Subtitle Translator Settings" : "本地 AI 实时字幕翻译设置";
}
