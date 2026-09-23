# 本地 AI 实时字幕翻译

[English README](README.en.md)

Edge/Chrome 扩展：读取 Netflix 或 YouTube 播放器中的原字幕，通过本机兼容 OpenAI API 的翻译服务实时显示中文字幕。默认推荐 `llama.cpp + Hy-MT2 Q4_K_M`。

## 版本

- 稳定版：从 [Microsoft Edge 扩展商店](https://microsoftedge.microsoft.com/addons/detail/odmlonebpcbphjogbopioojopjecioge)安装，当前为 `v2.0.4`。
- 开发预览版：从 [GitHub Releases](https://github.com/Minato-chen/local-ai-live-subtitle-translator/releases) 下载标为 Pre-release 的 ZIP，按下文步骤手动安装和更新。建议使用单独的浏览器配置文件，避免与商店版同时运行。

## 安装

参考这个视频[video](https://youtu.be/2KG4V-mdfIE)。

1. 安装 llama.cpp。

   推荐使用官方安装方式 [llama.app](https://llama.app/)。

   **Windows（PowerShell）**：

   ```
   irm https://llama.app/install.ps1 | iex
   ```

   **macOS（终端）**：Apple Silicon Mac 会自动使用 Metal 加速。

   ```bash
   curl -LsSf https://llama.app/install.sh | sh
   ```

2. 从 Edge 扩展商店安装稳定版；若使用开发预览版，解压 Release 中的 ZIP，在扩展管理页面开启开发人员模式，选择“加载解压缩的扩展”，并选中包含 `manifest.json` 的目录。

   Edge：`edge://extensions`

   Chrome：`chrome://extensions`

3. 启动本地翻译服务：`llama.cpp + Hy-MT2 Q4_K_M`

   （Windows 和 macOS 命令相同）

   ```powershell
   llama serve -hf tencent/Hy-MT2-1.8B-GGUF:Q4_K_M -ngl all -c 2048 -np 1 -a hy-mt2-fast
   ```

   第一次运行会下载模型；之后只需再次运行上述命令。服务窗口需要保持开启。

4. 打开 Netflix 或 YouTube 播放页，开启任意原字幕轨道；中文翻译会自动显示。YouTube 自动生成字幕的断句和识别质量取决于 YouTube 本身。

## 设置

设置页包含三部分：

- 启动本地服务：显示 Hy-MT2 推荐命令。使用其他模型时，请按该模型文档启动服务。
- 本地服务连接：默认地址为 `http://127.0.0.1:8080`，可按实际端口修改，并使用“检查服务”确认连接和试译结果。服务需要提供 OpenAI 兼容的 `/v1/chat/completions` 接口。
- 翻译与字幕设置：源/目标语言、字号、译文颜色、文字描边、背景颜色与不透明度、显示位置、前文参考条数。语言设置只会写入翻译提示，不会切换模型；明确源语言对稳定性略有帮助，但速度提升有限。前文参考条数越多，上下文可能更准确，但请求会略慢。（默认语言为“自动识别 → 简体中文”，默认字号为 `26 px`，前文参考条数为 `1`，背景不透明度为 `40%`。）

## 暂停查词

在设置中启用“暂停查词”。暂停视频后，点击英文字幕中的单词或拖选短语；日语、中文等字幕可直接划选。卡片显示简短释义、当前字幕片段及其译文。继续播放、按 Esc 或切换字幕会关闭卡片；播放时不会触发查词。

释义由本地 AI 生成，仅供学习参考，加入 Anki 前请核对。纯汉字字幕可能无法自动区分日语和中文，此时可在设置中指定源语言。卡片中的片段译文独立生成，不会直接复用播放时参考前文的译文。

## Anki 集成

1. 安装 Anki Desktop 和 [AnkiConnect](https://ankiweb.net/shared/info/2055492159)，重启并保持 Anki 运行。
2. 在扩展设置中启用 Anki，点击“连接并刷新”，然后选择默认牌组。连接地址默认为 `http://127.0.0.1:8765`。
3. 查词后点击“添加到 Anki”，检查或修改卡片内容，选择牌组并确认添加。也可在此新建牌组。

目前只支持 Basic 笔记类型：正面是选中内容，背面是释义、视频原句和译文。卡片不会自动添加，需由用户确认。

## 声明与隐私

- 本扩展是独立开发项目，与 Netflix、YouTube、Google、Microsoft 均无关联，也未获得其官方认可或授权。
- 本扩展只读取用户当前播放页面中已经显示的字幕，不下载或分发视频内容，不绕过 DRM。
- 字幕仅发送到用户在设置页指定的本地翻译服务（默认 `127.0.0.1:8080`），不会发送到本项目开发者的服务器；扩展不会保存字幕、账号信息、Cookie 或观看记录。
- 启用 Anki 后，只有用户确认添加的卡片字段会发送到本机 AnkiConnect（默认 `127.0.0.1:8765`）；扩展不会自动创建影片牌组或保存制卡历史。
- Hy-MT2、llama.cpp 及其他用户自行选择的模型或服务分别受其各自许可证和使用条款约束。Hy-MT2 模型请以其[发布页](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)的许可证和条款为准。
