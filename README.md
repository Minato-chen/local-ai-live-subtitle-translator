# 本地 AI 实时字幕翻译

Edge/Chrome 扩展：读取 Netflix 或 YouTube 播放器中的原字幕，通过本机兼容 OpenAI API 的翻译服务实时显示中文字幕。默认推荐 `llama.cpp + Hy-MT2 Q4_K_M`。

## 安装

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

2. 打开浏览器扩展管理页面，启用开发人员模式，选择“加载解压缩的扩展”，并选择本项目所在目录。

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

## 声明与隐私

- 本扩展是独立开发项目，与 Netflix、YouTube、Google、Microsoft 均无关联，也未获得其官方认可或授权。
- 本扩展只读取用户当前播放页面中已经显示的字幕，不下载或分发视频内容，不绕过 DRM。
- 字幕仅发送到用户在设置页指定的本地翻译服务（默认 `127.0.0.1:8080`），不会发送到本项目开发者的服务器；扩展不会保存字幕、账号信息、Cookie 或观看记录。
- Hy-MT2、llama.cpp 及其他用户自行选择的模型或服务分别受其各自许可证和使用条款约束。Hy-MT2 模型请以其[发布页](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)的许可证和条款为准。
- 图标、截图和宣传素材均为自制或已获授权的画面，不包含受版权保护的影视片段、完整字幕或第三方 Logo。
