# Netflix 实时中文字幕

一个可直接加载到 Microsoft Edge 的扩展。它读取 Netflix 当前显示的字幕，在本机
使用 Ollama + Hy-MT2 翻译，并把中文译文实时叠加在视频画面上。

默认方案：

```text
翻译服务：Ollama
翻译模型：maternion/hy-mt2:1.8b
源语言：auto
目标语言：zh
参考前文：1 条
```

**默认方案不需要 Docker。** Docker/LibreTranslate 和其他模型仅作为可选方案，
见[可选方案](#可选方案)。

## 目录

- [主要功能](#主要功能)
- [默认安装教程：Hy-MT2](#默认安装教程hy-mt2)
- [日常使用与退出后台](#日常使用与退出后台)
- [语言设置](#语言设置)
- [可选方案](#可选方案)
- [常见问题](#常见问题)
- [原理、隐私与许可](#原理隐私与许可)

## 主要功能

- 自动读取 Netflix 英语、日语等字幕并翻译为中文
- 默认自动识别源语言
- 保留 Netflix 原字幕，形成双语字幕
- 参考最近一条字幕改善对话语境
- 日语译文仍含假名或原样复述时自动严格重试
- 翻译结果缓存和字幕去重
- 支持调整字号、语言、模型和上下文数量
- 默认完全在本机处理字幕，不上传第三方翻译平台

---

## 默认安装教程：Hy-MT2

Hy-MT2 1.8B 是专用多语言翻译模型，支持中文、英语、日语、韩语等语言。当前默认的
Ollama 包约 1.1GB，适合 M1 16GB 以及多数 16GB Windows 电脑。

### 第一步：下载扩展

从 GitHub 下载项目 ZIP 并解压，或使用 Git：

```bash
git clone https://github.com/Minato-chen/netflix-edge-live-zh.git
```

建议把项目放到不会随手删除的位置，例如：

```text
macOS:   ~/Documents/EdgeExtensions/netflix-edge-live-zh
Windows: C:\Users\你的用户名\Documents\EdgeExtensions\netflix-edge-live-zh
```

### 第二步：加载到 Edge

1. 打开 `edge://extensions`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择包含 `manifest.json` 的项目文件夹。

#### 必须保留解压后的文件夹

开发人员模式下，Edge 会持续从这个文件夹读取扩展文件：

- 不能删除、移动或重命名已加载的文件夹，否则扩展会失效。
- 下载的 ZIP 压缩包可以删除。
- 如果移动了文件夹，需要删除 Edge 中的旧扩展条目，再从新位置重新加载。
- 只有将来通过 Microsoft Edge 加载项商店正式安装后，才不需要保留源码文件夹。

### 第三步：安装 Ollama

#### macOS

从 [Ollama 官方网站](https://ollama.com/download/mac) 下载并安装，或使用官方
安装脚本：

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

启动 Ollama：

```bash
open -a Ollama
```

允许 Edge 扩展访问本机 Ollama：

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
```

设置后，从菜单栏完全退出 Ollama，再重新打开：

```bash
open -a Ollama
```

验证：

```bash
launchctl getenv OLLAMA_ORIGINS
```

应输出：

```text
chrome-extension://*
```

#### Windows 10/11

1. 从 [Ollama Windows 官方页面](https://docs.ollama.com/windows) 下载
   `OllamaSetup.exe`。
2. 安装后从“开始”菜单启动 Ollama。
3. 打开 PowerShell，设置扩展来源：

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*", "User")
```

4. 从系统托盘完全退出 Ollama，再从“开始”菜单重新打开。
5. 新开 PowerShell 验证：

```powershell
[Environment]::GetEnvironmentVariable("OLLAMA_ORIGINS", "User")
```

应输出 `chrome-extension://*`。

> `chrome-extension://*` 允许所有 Chromium 扩展访问本机 Ollama。若要只允许本
> 扩展，可在 `edge://extensions` 复制扩展 ID，将变量值改为
> `chrome-extension://扩展ID`，然后重启 Ollama。

### 第四步：下载 Hy-MT2

macOS 终端或 Windows PowerShell：

```text
ollama pull maternion/hy-mt2:1.8b
```

确认模型存在：

```text
ollama list
```

`maternion/hy-mt2:1.8b` 是社区制作的 Ollama 包；底层模型与 GGUF 权重来自
[腾讯官方 Hy-MT2](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF)。

### 第五步：设置扩展

打开扩展的“翻译服务设置”，填写：

```text
翻译方式：Ollama 本地 AI
Ollama 接口：http://127.0.0.1:11434/api/chat
模型：maternion/hy-mt2:1.8b
参考前文条数：1
源语言：auto
目标语言：zh
```

保存后，打开 `edge://extensions` 点击扩展的“重新加载”，再刷新 Netflix 页面。

### 第六步：观看 Netflix

1. 打开 Netflix 并播放视频。
2. 在 Netflix 字幕菜单中选择英语、日语或其他可用字幕。
3. 扩展自动识别字幕语言并显示中文译文。

第一次翻译会加载模型，可能稍慢；模型加载完成后会明显加快。

---

## 日常使用与退出后台

### 开始观看

确保 Ollama 正在运行：

- macOS：从“应用程序”打开 Ollama，或运行 `open -a Ollama`。
- Windows：从“开始”菜单打开 Ollama。

不需要启动 Docker，也不需要运行 LibreTranslate。

### 看完后立即释放模型内存

关闭 Netflix 标签页会停止新请求，但模型最多可能继续驻留内存 30 分钟。立即卸载：

```text
ollama stop maternion/hy-mt2:1.8b
```

确认：

```text
ollama ps
```

列表为空表示没有模型占用内存。这个命令不会删除模型，下次翻译时会自动重新加载。

### 完全退出 Ollama

- macOS：菜单栏 Ollama 图标 → `Quit Ollama`。
- Windows：系统托盘 Ollama 图标 → `Quit`。
- 如果手动运行 `ollama serve`：回到该终端按 `Control + C`。

完全退出后，下次观看前需要重新打开 Ollama。

---

## 语言设置

默认源语言是 `auto`，目标语言是简体中文 `zh`。

| 语言 | 代码 |
| --- | --- |
| 自动识别 | `auto` |
| 英语 | `en` |
| 简体中文 | `zh` |
| 日语 | `ja` |
| 韩语 | `ko` |
| 法语 | `fr` |
| 德语 | `de` |
| 西班牙语 | `es` |

默认建议保持：

```text
源语言：auto
目标语言：zh
```

如果自动识别不稳定，可把源语言明确改成 `ja` 或 `en`。

---

## 可选方案

默认 Hy-MT2 已适合大多数用户。以下方案仅在有明确需求时选择。

### 模型对比

| 方案 | 优势 | 缺点 | 适合谁 |
| --- | --- | --- | --- |
| **Hy-MT2 1.8B（默认）** | 专用翻译模型、约1.1GB、自动识别语言、速度和质量平衡 | Ollama 包为社区打包 | 大多数用户 |
| Qwen3 1.7B | 约1.4GB、速度快、通用语言理解强 | 偶尔复述日语或不遵循翻译指令 | 更看重速度 |
| Qwen3 4B Instruct | 语境和通用理解更好 | 约2.5GB，在 M1 上可能跟不上快速字幕 | 更看重上下文质量 |
| LibreTranslate | 资源占用低、输出稳定、非生成式 | 日语口语和语境质量较弱，需要 Docker | 低配置或不想使用 LLM |

### 可选：Qwen3 1.7B

下载：

```text
ollama pull qwen3:1.7b
```

设置：

```text
模型：qwen3:1.7b
参考前文条数：1
源语言：auto 或明确语言代码
```

优点是快；缺点是小型通用模型有时会输出原文。扩展已设置 `think: false` 并对日语
残留进行重试，但稳定性通常仍不如 Hy-MT2。

### 可选：Qwen3 4B Instruct

下载：

```text
ollama pull qwen3:4b-instruct
```

设置：

```text
模型：qwen3:4b-instruct
参考前文条数：2 或 3
```

优点是通用语境理解较好；缺点是模型更大、延迟更高。M1 16GB 上可能出现字幕已经
切换、译文才返回的情况。

删除不再使用的模型：

```text
ollama list
ollama rm qwen3:1.7b
ollama rm qwen3:4b-instruct
```

### 可选：LibreTranslate

LibreTranslate 与 Ollama 完全独立：

- 使用 LibreTranslate 时需要 Docker。
- 不需要启动 Ollama。
- 使用 Ollama 时则不需要 Docker。

优势：

- 推理轻量，资源占用较低。
- 输出速度稳定，不会生成解释性内容。
- 本机自建没有公共 API 次数限制。

缺点：

- 日语省略主语、敬语、口语和上下文处理较弱。
- 必须保持 Docker Desktop 和翻译容器运行。
- 首次启动需要下载语言模型。

安装 [Docker Desktop](https://docs.docker.com/desktop/)，启动后创建容器：

macOS：

```bash
docker run -d \
  --name netflix-translator \
  --restart unless-stopped \
  -p 5001:5000 \
  -e LT_LOAD_ONLY=en,ja,zh \
  libretranslate/libretranslate
```

Windows PowerShell：

```powershell
docker run -d --name netflix-translator --restart unless-stopped -p 5001:5000 -e LT_LOAD_ONLY=en,ja,zh libretranslate/libretranslate
```

扩展设置：

```text
翻译方式：LibreTranslate
接口地址：http://127.0.0.1:5001/translate
API Key：留空
```

管理容器：

```text
docker start netflix-translator
docker stop netflix-translator
docker logs -f netflix-translator
```

停止容器不会删除容器或模型。如果没有其他容器需要运行，可以一并退出 Docker
Desktop。

---

## 常见问题

### HTTP 403

Ollama 默认会拒绝浏览器扩展来源。确认已设置：

macOS：

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
```

Windows PowerShell：

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*", "User")
```

设置后必须完全退出并重新启动 Ollama。

### HTTP 404

- Ollama 地址应为 `http://127.0.0.1:11434/api/chat`。
- 运行 `ollama list`，确认模型名称与扩展设置完全一致。
- 缺少默认模型时运行 `ollama pull maternion/hy-mt2:1.8b`。

### `Failed to fetch`

- 确认 Ollama 正在运行。
- 打开 `http://127.0.0.1:11434`，正常应显示 Ollama 正在运行。
- 确认扩展接口地址没有填成 LibreTranslate 的 `5001` 端口。

### 一直显示“翻译中…”

- 使用默认 `maternion/hy-mt2:1.8b`。
- 把“参考前文条数”设为 `1`。
- 运行 `ollama ps` 检查模型状态。
- 关闭其他占用大量内存的应用。

### Ollama 没有返回译文

- 确认使用最新版扩展，扩展会发送 `think: false`。
- 运行 `ollama list` 检查模型名称。
- 重新加载扩展并刷新 Netflix 页面。

### 字幕重复两遍

请升级到 `1.2.2` 或更高版本。旧版本可能同时读取 Netflix 嵌套字幕的父级和子级
节点。

### 没字幕时出现黑条

请升级到 `1.1.0` 或更高版本，并重新加载扩展。

### `Cannot read properties of undefined (reading 'sendMessage')`

扩展重新加载后，旧 Netflix 标签页仍在运行已经失效的内容脚本。刷新 Netflix 页面
即可。`1.2.1` 及以上版本会显示更明确的刷新提示。

### 更新扩展

如果使用 Git：

```bash
git pull
```

然后在 `edge://extensions` 点击“重新加载”，并刷新 Netflix 页面。

如果使用 ZIP，下载新版后覆盖原固定目录中的文件，再重新加载扩展。不要在 Edge
仍指向旧目录时删除该目录。

---

## 是否可以长期免费使用

本机 Ollama 或自建 LibreTranslate 默认没有按请求计费，也没有公共 API 调用次数
限制。实际成本是自己的 CPU/GPU、内存、电力和磁盘空间。

如果改用远程服务，可能收费、限流或要求 API Key。

## 原理、隐私与许可

### 实现原理

1. `content.js` 使用 `MutationObserver` 监测 Netflix 字幕节点。
2. 新字幕经过清理、去重和防抖。
3. 扩展保留最近字幕作为可选上下文。
4. `background.js` 调用本机 Ollama 或 LibreTranslate。
5. 日语→中文结果仍含假名或复述原文时，自动严格重试一次。
6. 译文显示在独立覆盖层中，并缓存于当前页面会话。

扩展只读取屏幕上已经显示的字幕，不破解 Netflix DRM，不下载视频，也不提取完整
字幕文件。

### 隐私

默认数据路径：

```text
Netflix 页面 → Edge 扩展后台 → 本机 Ollama
```

扩展不会主动保存观看历史或上传字幕。若自行填写远程接口，字幕会发送到对应服务器。

### 项目结构

```text
manifest.json      Edge 扩展清单
background.js      Ollama/LibreTranslate 请求、提示词和译文校验
content.js         字幕检测、上下文、缓存和译文叠加
content.css        视频字幕样式
popup.*            扩展开关
options.*          模型、接口、语言和字号设置
```

### 开源许可

扩展代码使用 [MIT License](LICENSE)。LibreTranslate、Argos Translate、Ollama
和模型分别遵循各自许可证。本项目不包含 Netflix 视频或字幕内容。
