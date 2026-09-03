# Netflix 实时中文字幕

Edge 扩展：读取 Netflix 当前字幕，通过本机 `llama.cpp + Hy-MT2 Q4_K_M` 显示中文字幕。

## 安装

1. 安装带 CUDA 的 [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) Windows 版本。
2. 在 PowerShell 启动翻译服务：

   ```powershell
   llama.exe serve -hf tencent/Hy-MT2-1.8B-GGUF:Q4_K_M -ngl all -c 2048 -np 1 -a hy-mt2-fast
   ```

   第一次运行会下载模型。服务窗口需要保持开启。

3. 打开 `edge://extensions`，启用开发人员模式，选择“加载解压缩的扩展”，并选择本项目目录。
4. 打开 Netflix 播放页并选择原字幕；中文翻译会自动显示。

## 设置

扩展设置只提供字幕相关选项：源/目标语言、字号、是否显示原文和参考前文条数。实时速度优先时，建议“参考前文条数”设为 `0`。

字幕只发送到本机 `127.0.0.1:8080` 的 llama.cpp 服务。
