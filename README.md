# Netflix 实时中文字幕

一个无需构建、可直接加载到 Microsoft Edge 的 Manifest V3 扩展。它读取 Netflix
播放器当前显示的字幕，通过本机运行的 LibreTranslate 或 Ollama 翻译，并把中文
译文实时叠加在视频画面上。

## 目录

- [功能](#功能)
- [选择翻译方式](#选择翻译方式)
- [快速开始](#快速开始)
- [方案一：LibreTranslate 快速模式](#方案一libretranslate-快速模式)
- [方案二：Ollama 高质量模式](#方案二ollama-高质量模式)
- [结束观看后释放后台资源](#结束观看后释放后台资源)
- [语言切换](#语言切换)
- [常见问题](#常见问题)
- [隐私与实现原理](#隐私)

## 功能

- 支持 Netflix 英语、日语等字幕实时翻译为中文
- 保留 Netflix 原字幕，形成双语字幕
- 可在设置中选择两种本机翻译方式
- 新安装默认使用 Hy-MT2 1.8B、自动识别源语言和 1 条上下文
- Ollama 模式支持字幕上下文，适合日语影视对白
- 日语译文仍含假名或原样复述时自动重试一次
- 字幕去重和翻译缓存
- 支持调整字号、源语言、目标语言和上下文数量
- 默认情况下字幕只在本机处理

## 选择翻译方式

| 模式 | 需要 Ollama | 需要 Docker | 适合场景 | 局限 |
| --- | --- | --- | --- | --- |
| Ollama（默认） | 是 | **否** | Hy-MT2 自动识别语言，译文自然 | 占用模型内存 |
| LibreTranslate | 否 | 是 | 低配置电脑、追求低延迟 | 日语口语和语境质量一般 |

两种服务完全独立，不需要同时运行：

- 使用 Ollama 时不需要安装或启动 Docker。
- 使用 LibreTranslate 时不需要安装或启动 Ollama。
- 默认 Hy-MT2 配置只需要 Ollama；Docker Desktop 可以退出。

默认配置：

```text
翻译方式：Ollama 本地 AI
模型：maternion/hy-mt2:1.8b
源语言：auto
目标语言：zh
参考前文条数：1
```

首次使用前需要运行 `ollama pull maternion/hy-mt2:1.8b`。升级前已经保存过设置的
用户不会被自动覆盖，可在扩展设置中手动改为上述配置。

## 快速开始

1. 下载或克隆本项目。
2. 准备 LibreTranslate 或 Ollama。
3. 打开 Edge 的 `edge://extensions`。
4. 开启“开发人员模式”。
5. 点击“加载解压缩的扩展”。
6. 选择包含 `manifest.json` 的项目目录。
7. 打开扩展设置，选择翻译方式。
8. 在 Netflix 播放器中选择与“源语言”一致的字幕。

### 不要删除已加载的扩展文件夹

通过 Edge“加载解压缩的扩展”安装后，Edge 会持续从所选文件夹读取
`manifest.json`、JavaScript 和样式文件，因此：

- 不能删除、移动或重命名该文件夹，否则扩展会失效。
- 下载的 ZIP 压缩包可以删除，Edge 不会从 ZIP 文件运行扩展。
- 建议先把解压后的项目移动到长期保留的位置，再加载到 Edge，例如
  `Documents/EdgeExtensions/netflix-edge-live-zh`。
- 如果已经移动了文件夹，需要在 `edge://extensions` 删除旧扩展条目，再从新位置
  点击“加载解压缩的扩展”。

只有将扩展打包并发布到 Microsoft Edge 加载项商店，通过商店正式安装后，用户才
不需要保留解压后的源文件夹。

修改扩展代码或更新版本后，需要在 `edge://extensions` 点击“重新加载”，并刷新
Netflix 页面。

---

## 方案一：LibreTranslate 快速模式

LibreTranslate 通过 Docker 在本机运行。下面的配置默认加载英语、日语和中文模型，
覆盖英语→中文和日语→中文。

### macOS

1. 从 [Docker 官方页面](https://docs.docker.com/desktop/setup/install/mac-install/)
   下载 Docker Desktop。
2. Apple M 系列选择 Apple silicon，旧款 Mac 选择 Intel。
3. 将 Docker 拖入“应用程序”，启动并完成首次设置。
4. 在终端验证：

```bash
docker --version
docker run hello-world
```

5. 创建翻译容器：

```bash
docker run -d \
  --name netflix-translator \
  --restart unless-stopped \
  -p 5001:5000 \
  -e LT_LOAD_ONLY=en,ja,zh \
  libretranslate/libretranslate
```

### Windows 10/11

1. 根据 [Docker Desktop for Windows 官方说明](https://docs.docker.com/desktop/setup/install/windows-install/)
   安装 Docker Desktop。
2. 推荐选择 WSL 2 后端。如果系统尚未安装 WSL，以管理员身份打开 PowerShell：

```powershell
wsl --install
wsl --update
```

3. 按提示重启 Windows，启动 Docker Desktop。
4. 在 PowerShell 验证：

```powershell
docker --version
docker run hello-world
```

5. 在 PowerShell 创建翻译容器：

```powershell
docker run -d --name netflix-translator --restart unless-stopped -p 5001:5000 -e LT_LOAD_ONLY=en,ja,zh libretranslate/libretranslate
```

### 等待首次启动

首次运行会下载语言模型。macOS 终端和 Windows PowerShell 都可运行：

```text
docker logs -f netflix-translator
```

服务启动后按 `Control + C` 退出日志界面，容器仍会在后台运行。

检查状态：

```text
docker ps
```

日常管理：

```text
docker start netflix-translator
docker stop netflix-translator
```

Docker Desktop 必须保持运行，容器才能提供翻译。

### 测试 LibreTranslate

macOS：

```bash
curl -i http://127.0.0.1:5001/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"Hello world","source":"en","target":"zh","format":"text"}'
```

Windows PowerShell：

```powershell
$body = @{
  q = "Hello world"
  source = "en"
  target = "zh"
  format = "text"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:5001/translate" -Method Post -ContentType "application/json" -Body $body
```

正常会返回 `HTTP 200` 和中文译文。

扩展设置：

```text
翻译方式：LibreTranslate
接口地址：http://127.0.0.1:5001/translate
API Key：留空
```

### 端口被占用

如果出现 `bind: address already in use`，把 Mac/Windows 端口换成 `5002`：

```text
-p 5002:5000
```

扩展接口也要改为：

```text
http://127.0.0.1:5002/translate
```

---

## 方案二：Ollama 高质量模式

Ollama 在本机运行开源大语言模型。扩展会提供最近几条字幕作为语境，并关闭模型的
思考模式以降低延迟。

### 模型选择

| 模型 | 大小约 | 推荐用途 |
| --- | ---: | --- |
| `qwen3:1.7b` | 1.4 GB | 实时优先，M1 16GB 和普通 Windows 电脑推荐 |
| `maternion/hy-mt2:1.8b` | 1.1 GB | 专用翻译模型，支持自动识别源语言 |
| `qwen3:4b-instruct` | 2.5 GB | 质量优先，速度较慢 |

模型大小只是下载体积，运行时还会占用额外内存。新安装默认使用
`maternion/hy-mt2:1.8b`。

### 试用 Hy-MT2 1.8B

Hy-MT2 是专用多语言翻译模型。扩展会根据模型名自动使用它要求的提示格式，无需手工
修改提示词。

下载 Ollama 社区打包版本：

```text
ollama pull maternion/hy-mt2:1.8b
```

扩展设置：

```text
翻译方式：Ollama 本地 AI
接口地址：http://127.0.0.1:11434/api/chat
模型：maternion/hy-mt2:1.8b
参考前文条数：1
源语言：auto
目标语言：zh
```

`auto` 会让模型自动识别英语、日语等输入语言。日语输入仍会启用假名残留检查和严格
重试。该 Ollama 包由社区打包；底层模型和官方 GGUF 权重来自
[腾讯 Hy-MT2](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)。

### macOS

1. 从 [Ollama 官方页面](https://ollama.com/download/mac) 安装并启动 Ollama。
2. 下载实时模型：

```bash
ollama pull maternion/hy-mt2:1.8b
```

3. 允许 Edge 扩展访问本机 Ollama：

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
```

4. 从菜单栏完全退出 Ollama，然后重新打开：

```bash
open -a Ollama
```

确认设置：

```bash
launchctl getenv OLLAMA_ORIGINS
```

应输出 `chrome-extension://*`。

### Windows 10/11

1. 从 [Ollama Windows 官方页面](https://docs.ollama.com/windows) 下载并运行
   `OllamaSetup.exe`。普通安装不要求管理员权限。
2. 打开 PowerShell，下载实时模型：

```powershell
ollama pull maternion/hy-mt2:1.8b
```

3. 为当前 Windows 用户添加扩展来源环境变量：

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*", "User")
```

4. 从系统托盘完全退出 Ollama，再从“开始”菜单重新启动 Ollama。
5. 新开一个 PowerShell 窗口验证：

```powershell
[Environment]::GetEnvironmentVariable("OLLAMA_ORIGINS", "User")
```

应输出 `chrome-extension://*`。

`chrome-extension://*` 会允许所有 Chromium 扩展访问本机 Ollama。若希望限制为当前
扩展，可在 `edge://extensions` 复制扩展 ID，并将变量值改成
`chrome-extension://扩展ID`。Ollama 官方对浏览器扩展来源的说明见
[Ollama FAQ](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama)。

### 测试 Ollama

确认模型：

```text
ollama list
```

macOS：

```bash
curl http://127.0.0.1:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model":"maternion/hy-mt2:1.8b",
    "think":false,
    "stream":false,
    "messages":[{"role":"user","content":"把「お疲れ様でした」翻译成中文，只输出译文"}]
  }'
```

Windows PowerShell：

```powershell
$body = @{
  model = "maternion/hy-mt2:1.8b"
  think = $false
  stream = $false
  messages = @(@{
    role = "user"
    content = "把「お疲れ様でした」翻译成中文，只输出译文"
  })
} | ConvertTo-Json -Depth 4

Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/chat" -Method Post -ContentType "application/json" -Body $body
```

扩展设置：

```text
翻译方式：Ollama 本地 AI
接口地址：http://127.0.0.1:11434/api/chat
模型：maternion/hy-mt2:1.8b
参考前文条数：1
源语言：auto
目标语言：zh
```

使用 `qwen3:4b-instruct` 时可把前文条数设为 `3`，但实时性会下降。

删除不再使用的模型：

```text
ollama list
ollama rm qwen3:4b-instruct
```

Ollama 必须保持运行；选择 Ollama 模式时不需要启动 LibreTranslate Docker 容器。

---

## 结束观看后释放后台资源

关闭 Netflix 标签页只会停止新的翻译请求。扩展会要求 Ollama 将模型保留在内存中
最多 30 分钟，以便连续字幕快速响应；如果希望立即释放内存，需要手动停止模型。

### 使用 Ollama 时

只卸载默认 Hy-MT2 模型、立即释放模型占用的内存：

```text
ollama stop maternion/hy-mt2:1.8b
```

确认没有模型仍在运行：

```text
ollama ps
```

这种方式会保留轻量的 Ollama 后台服务，下次观看时无需重新启动应用，扩展会自动
重新加载模型。使用 Ollama 时不需要 Docker，LibreTranslate 容器和 Docker Desktop
都可以保持关闭。

如果希望完全退出 Ollama：

- macOS：点击菜单栏的 Ollama 图标，选择 `Quit Ollama`。
- Windows：右键系统托盘中的 Ollama 图标，选择 `Quit`。
- 如果是在终端运行 `ollama serve`，回到该终端按 `Control + C`。

下次使用时，从“应用程序”或 Windows“开始”菜单重新打开 Ollama。停止或退出不会
删除已下载模型。

### 使用 LibreTranslate 时

停止翻译容器：

```text
docker stop netflix-translator
```

下次使用：

```text
docker start netflix-translator
```

停止容器不会删除容器或语言模型。如果没有其他容器需要运行，还可以从菜单栏或系统
托盘退出 Docker Desktop，进一步释放内存。不要运行 `docker rm`，除非确定要删除
容器并重新创建。

### 最推荐的日常操作

默认 Hy-MT2 模式看完后只需运行：

```text
ollama stop maternion/hy-mt2:1.8b
```

这样能立即释放大部分相关内存，同时保留 Ollama 服务，下一次打开 Netflix 仍可直接
使用。

---

## 语言切换

扩展使用 ISO 639-1 语言代码：

| 语言 | 代码 |
| --- | --- |
| 英语 | `en` |
| 简体中文 | `zh` |
| 日语 | `ja` |
| 韩语 | `ko` |
| 法语 | `fr` |
| 德语 | `de` |
| 西班牙语 | `es` |

日语字幕翻译为中文：

```text
Netflix 字幕：日语
扩展源语言：ja
扩展目标语言：zh
```

英语字幕翻译为中文：

```text
Netflix 字幕：英语
扩展源语言：en
扩展目标语言：zh
```

Ollama 模式直接修改扩展语言即可。LibreTranslate 模式还要求容器中存在相应模型。
查看 LibreTranslate 已加载语言：

```text
curl http://127.0.0.1:5001/languages
```

例如增加韩语模型，需要重新创建容器：

```bash
docker stop netflix-translator
docker rm netflix-translator
docker run -d \
  --name netflix-translator \
  --restart unless-stopped \
  -p 5001:5000 \
  -e LT_LOAD_ONLY=en,ja,ko,zh \
  libretranslate/libretranslate
```

Windows PowerShell 可把最后一条 `docker run` 写成单行。

---

## 常见问题

### HTTP 403

LibreTranslate：

- 确认使用本机地址 `http://127.0.0.1:5001/translate`。
- 公共 `https://libretranslate.com/translate` 通常需要 API Key。

Ollama：

- 需要设置 `OLLAMA_ORIGINS` 允许 `chrome-extension://*`。
- 设置变量后必须完全退出并重新启动 Ollama。

### HTTP 404

- Ollama 接口必须是 `http://127.0.0.1:11434/api/chat`。
- 运行 `ollama list`，确认扩展中填写的模型名称确实存在。
- 缺少默认模型时运行 `ollama pull maternion/hy-mt2:1.8b`。

### `Failed to fetch`

- 确认对应翻译服务正在运行。
- Ollama：访问 `http://127.0.0.1:11434`，应显示 Ollama 正在运行。
- LibreTranslate：运行 `docker ps`，确认容器状态为 `Up`。
- 保存设置后重新加载扩展并刷新 Netflix。

### `Connection reset by peer`

LibreTranslate 可能仍在初始化或下载模型：

```text
docker ps -a --filter name=netflix-translator
docker logs -f netflix-translator
```

### Ollama 没有返回译文

- 使用支持 `think: false` 的新版扩展。
- 确认模型名称正确。
- 在终端或 PowerShell 用上面的测试请求检查模型。

### 一直显示“翻译中…”

模型速度赶不上字幕切换。建议：

- 使用默认的 `maternion/hy-mt2:1.8b`。
- 把“参考前文条数”设为 `1`。
- 运行 `ollama ps` 检查模型是否使用 GPU。
- 关闭其他占用大量内存的应用。

### 没有字幕时出现黑条

请使用 `1.1.0` 或更高版本，并在 `edge://extensions` 重新加载扩展。

### Netflix 有字幕但没有译文

- 确认扩展已启用。
- 确认 Netflix 字幕语言与扩展“源语言”一致。
- 确认翻译服务和模型正在运行。
- 在 `edge://extensions` 重新加载扩展，然后刷新 Netflix。
- Netflix 改版后字幕 DOM 可能变化，需要更新 `content.js` 中的选择器。

### 同一句字幕重复两遍

旧版本在部分 Netflix 字幕 DOM 中会同时读取嵌套的父级和子级 `span`，导致同一句话
被拼接两次。请升级到 `1.2.2` 或更高版本，重新加载扩展并刷新 Netflix 页面。

### `Cannot read properties of undefined (reading 'sendMessage')`

这通常发生在扩展刚刚重新加载，但 Netflix 标签页仍运行旧内容脚本时。刷新 Netflix
页面即可。`1.2.1` 及以上版本会把底层错误替换成明确的刷新提示。

---

## 是否可以长期免费使用

使用本机 LibreTranslate 或本机 Ollama 时：

- 默认没有按请求计费。
- 没有公共 API 的调用次数限制。
- 翻译使用自己的 CPU/GPU、内存、电力和磁盘空间。
- 实际速度受硬件、模型大小和字幕速度限制。

因此可以长期使用，但“无限”指没有服务端收费配额，并不代表没有硬件和性能限制。
如果改用远程服务，则可能收费、限制调用频率或要求 API Key。

## 隐私

默认数据路径：

```text
Netflix 页面 → Edge 扩展后台 → 本机 LibreTranslate 或 Ollama
```

扩展不会主动保存观看历史或上传字幕。若自行配置远程接口，字幕会发送至该服务器，
使用者需要自行确认其隐私政策。

## 实现原理

1. `content.js` 使用 `MutationObserver` 监测 Netflix 字幕节点。
2. 检测到新字幕后进行文本清理、去重和防抖。
3. Ollama 模式同时保留最近几条字幕作为上下文。
4. `background.js` 调用所选翻译服务。
5. 日语→中文结果仍含假名或原样复述时，Ollama 模式自动严格重试一次。
6. 译文通过独立覆盖层显示在播放器上，并缓存在当前页面会话中。

扩展只读取屏幕上已经显示的字幕，不破解 Netflix DRM，不下载视频，也不提取完整
字幕文件。

## 项目结构

```text
manifest.json      Edge 扩展清单
background.js      LibreTranslate/Ollama 请求、提示词和译文校验
content.js         字幕检测、上下文、缓存和译文叠加
content.css        视频字幕样式
popup.*            扩展开关
options.*          翻译方式、接口、语言和字号设置
```

## 开源许可

扩展代码使用 [MIT License](LICENSE)。LibreTranslate、Argos Translate、Ollama
和模型分别遵循其各自的许可证。本项目不包含 Netflix 视频或字幕内容。
