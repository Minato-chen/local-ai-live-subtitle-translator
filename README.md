# Netflix 实时中文字幕（Edge 扩展）

一个无需构建、可直接加载到 Microsoft Edge 的 Manifest V3 扩展。它读取
Netflix 播放器当前显示的字幕，通过本机运行的开源
[LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) 翻译，并把译文实时叠加在视频画面上。

## 功能

- 实时读取 Netflix 当前字幕并显示中文翻译
- 默认保留 Netflix 原字幕，形成双语字幕
- 本机离线翻译，字幕不需要发送给第三方翻译平台
- 可选择 LibreTranslate 快速模式或 Ollama 高质量模式
- Ollama 模式可参考最近几条字幕，改善日语省略主语和对话语境
- 字幕去重和翻译结果缓存，减少重复计算
- 支持开关翻译、调整字号和切换源语言/目标语言
- 支持自建或远程 LibreTranslate 接口

## 工作原理

1. `content.js` 使用 `MutationObserver` 监测 Netflix 播放器字幕节点。
2. 检测到新字幕后，扩展进行文本清理、去重和短暂防抖。
3. 字幕通过扩展后台脚本发送至所选的本机翻译服务。
4. LibreTranslate 使用 Argos Translate 快速逐句翻译；Ollama 使用本地大语言模型并
   参考最近几条字幕。
5. 返回的译文由扩展叠加在播放器上，并缓存在浏览器内存中。

扩展只读取屏幕上已经显示的字幕，不破解 Netflix DRM，不下载视频，也不提取完整字幕文件。

## 环境要求

- Microsoft Edge
- Docker Desktop
- 建议至少 4 GB 内存

macOS 可从 [Docker 官方页面](https://docs.docker.com/desktop/setup/install/mac-install/)
下载与芯片匹配的 Docker Desktop。Apple M 系列选择 Apple silicon，旧款 Mac
选择 Intel。

安装后可在终端验证：

```bash
docker --version
docker run hello-world
```

## 启动翻译服务器

默认加载英语、日语和中文模型，覆盖常用的英语→中文和日语→中文翻译，并使用
Mac 的 `5001` 端口：

```bash
docker run -d \
  --name netflix-translator \
  --restart unless-stopped \
  -p 5001:5000 \
  -e LT_LOAD_ONLY=en,ja,zh \
  libretranslate/libretranslate
```

如果之前创建的是只含 `en,zh` 的旧容器，需要重新创建一次，日语模型才会下载：

```bash
docker stop netflix-translator
docker rm netflix-translator
docker run -d \
  --name netflix-translator \
  --restart unless-stopped \
  -p 5001:5000 \
  -e LT_LOAD_ONLY=en,ja,zh \
  libretranslate/libretranslate
```

首次启动需要下载语言模型。查看启动进度：

```bash
docker logs -f netflix-translator
```

出现服务器开始监听的信息后，按 `Control + C` 退出日志界面；容器仍会在后台运行。

检查状态：

```bash
docker ps
```

测试服务：

```bash
curl -i http://127.0.0.1:5001/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"Hello world","source":"en","target":"zh","format":"text"}'
```

正常情况下会返回 `HTTP/1.1 200 OK` 和中文译文。

日常管理：

```bash
docker start netflix-translator
docker stop netflix-translator
```

Docker Desktop 必须处于运行状态，LibreTranslate 容器才能提供翻译。

### 端口被占用

如果出现 `bind: address already in use`，说明左侧的 Mac 端口已被其他程序占用。
可以换成另一个端口，例如：

```bash
-p 5002:5000
```

此时扩展接口地址也要相应改为：

```text
http://127.0.0.1:5002/translate
```

## 安装 Edge 扩展

1. 下载或克隆本项目。
2. 打开 `edge://extensions`。
3. 开启“开发人员模式”。
4. 点击“加载解压缩的扩展”。
5. 选择包含 `manifest.json` 的项目目录。
6. 点击扩展图标，打开“翻译服务设置”。
7. 将接口地址设置为：

```text
http://127.0.0.1:5001/translate
```

API Key 留空，然后保存。

## Ollama 高质量翻译

LibreTranslate 速度快、资源占用低，但日语口语、敬语和省略主语的翻译质量有限。
Ollama 模式会把最近几条字幕作为语境发送给本机模型，更适合影视日语。

### M1 16GB 推荐配置

安装 [Ollama](https://ollama.com/download/mac)，启动应用，然后在终端下载约
2.5 GB 的模型：

```bash
ollama pull qwen3:4b-instruct
```

在扩展设置中选择：

```text
翻译方式：Ollama 本地 AI
接口地址：http://127.0.0.1:11434/api/chat
模型：qwen3:4b-instruct
参考前文条数：3
```

Ollama 应用必须保持运行，但 Ollama 模式不需要启动 LibreTranslate Docker 容器。
第一次翻译可能因为模型加载而稍慢，之后会明显加快。模型在本机运行，不按调用次数
收费。`qwen3:4b-instruct` 是非思考版，更适合低延迟字幕翻译。

如需测试 Ollama：

```bash
curl http://127.0.0.1:11434/api/chat \
  -d '{
    "model": "qwen3:4b-instruct",
    "stream": false,
    "messages": [{"role": "user", "content": "把「お疲れ様でした」翻译成中文，只输出译文"}]
  }'
```

### 两种模式对比

| 模式 | 优点 | 局限 |
| --- | --- | --- |
| LibreTranslate | 启动快、延迟低、资源占用少 | 逐句翻译，日语语境和口语质量一般 |
| Ollama | 翻译自然，可利用前文语境 | 首次加载较慢，占用更多内存 |

## 使用

1. 打开 Netflix 并播放视频。
2. 在 Netflix 自带字幕菜单中选择英文字幕。
3. 等待片刻，中文译文会显示在原字幕上方。

扩展弹窗可以临时关闭翻译；设置页面可以调整翻译方式、字号和语言。

## 切换语言

扩展设置中的语言使用 ISO 639-1 代码：

| 语言 | 代码 |
| --- | --- |
| 英语 | `en` |
| 简体中文 | `zh` |
| 日语 | `ja` |
| 韩语 | `ko` |
| 法语 | `fr` |
| 德语 | `de` |
| 西班牙语 | `es` |

例如把日语字幕翻译为中文：

1. 在 Netflix 中选择日语字幕。
2. 在扩展设置中把“源语言”改为 `ja`，“目标语言”保持 `zh`。
3. 保存设置并刷新 Netflix 页面。

README 中的默认容器已经加载 `en,ja,zh`，因此英语和日语之间切换时无需重新创建
容器。如果还需要韩语等其他语言，则要把对应代码加入 `LT_LOAD_ONLY`。例如增加韩语：

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

查看服务器实际支持的语言：

```bash
curl http://127.0.0.1:5001/languages
```

并非每一对语言都有直接模型；LibreTranslate 可能通过中间语言翻译，速度和质量也会因语言对而异。

## 是否可以无限使用

使用本机自建 LibreTranslate 时：

- 默认没有按请求计费，也没有公共 API 的调用次数限制。
- 不需要 LibreTranslate API Key。
- 翻译计算使用自己的 CPU、内存和电力。
- 实际吞吐量受电脑性能、模型大小和字幕速度限制。
- 扩展缓存只在当前页面会话内有效，刷新后会重新计算。

因此它可以长期免费使用，但“无限”指没有服务端收费配额，并不代表没有硬件、
性能或软件许可方面的约束。LibreTranslate 使用 AGPL-3.0 许可证；如果修改并通过
网络向他人提供服务，应自行了解对应的源码开放义务。

如果改用 `https://libretranslate.com/translate` 等公共服务，则可能要求 API Key、
收费或限制调用频率，字幕也会被发送到远程服务器。

使用本机 Ollama 时同样没有按请求计费或公共 API 配额，但会持续使用本机内存和
计算资源。

## 隐私

默认配置下，字幕只在以下位置之间传递：

```text
Netflix 页面 → Edge 扩展后台 → 本机 LibreTranslate 或 Ollama
```

扩展不会主动保存观看历史或上传字幕。若自行配置远程接口，字幕内容会发送至该接口，
其隐私政策和数据保留规则需要由使用者确认。

## 常见问题

### 返回 HTTP 403

确认接口地址是本机地址：

```text
http://127.0.0.1:5001/translate
```

公共的 `https://libretranslate.com/translate` 通常需要 API Key。

### `Connection reset by peer`

容器可能还在初始化或下载模型。运行：

```bash
docker ps -a --filter name=netflix-translator
docker logs -f netflix-translator
```

等待服务启动完成后重试。

### Netflix 有字幕但没有译文

- 确认扩展已启用。
- 确认 Netflix 选择的字幕语言与扩展“源语言”一致。
- 访问 `/languages` 确认模型已经加载。
- 在 `edge://extensions` 重新加载扩展，然后刷新 Netflix 页面。
- Netflix 改版后字幕 DOM 可能变化，需要更新 `content.js` 中的选择器。

### Ollama 返回连接失败

- 确认 Ollama 应用正在运行。
- 运行 `ollama list`，确认存在 `qwen3:4b-instruct`。
- 打开 `http://127.0.0.1:11434`，正常应显示 Ollama 正在运行。
- 确认扩展设置中的接口是 `http://127.0.0.1:11434/api/chat`。

### 使用自定义远程服务器

需要把远程域名加入 `manifest.json` 的 `host_permissions`，然后在
`edge://extensions` 重新加载扩展。远程字幕传输建议使用 HTTPS。

## 项目文件

```text
manifest.json      Edge 扩展清单
background.js      LibreTranslate/Ollama API 请求与提示词
content.js         字幕检测、上下文、缓存和译文叠加
content.css        视频字幕样式
popup.*            扩展开关
options.*          接口、语言和字号设置
```

## 许可说明

本项目扩展代码使用 [MIT License](LICENSE)。LibreTranslate 和 Argos Translate
分别遵循其各自的开源许可证，本项目不包含 Netflix 视频或字幕内容。
