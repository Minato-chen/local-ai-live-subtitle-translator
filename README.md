# Netflix 实时中文字幕

Edge 扩展：读取 Netflix 当前字幕，通过本机 `llama.cpp + Hy-MT2 Q4_K_M` 显示中文字幕。

## 安装

1. 安装 [llama.cpp](https://github.com/ggml-org/llama.cpp)。

   **Windows（NVIDIA GPU）**：前往 [llama.cpp](https://github.com/ggml-org/llama.cpp)，安装带 CUDA 的 Windows 版。

   ```
   irm https://llama.app/install.ps1 | iex
   ```

   **macOS**：前往 [llama.cpp](https://github.com/ggml-org/llama.cpp)，安装Mac版。Apple Silicon Mac 会自动使用 Metal 加速。

   ```bash
   curl -LsSf https://llama.app/install.sh | sh
   ```

2. 打开浏览器扩展管理页面，启用开发人员模式，选择“加载解压缩的扩展”，并选择本项目所在目录

   Edge：`edge://extensions`

   Chrome：`chrome://extensions`

3. 启动本地翻译服务：

   **Windows（PowerShell）**：

   ```powershell
   llama serve -hf tencent/Hy-MT2-1.8B-GGUF:Q4_K_M -ngl all -c 2048 -np 1 -a hy-mt2-fast
   ```

   **macOS（终端）**：

   ```bash
   llama serve -hf tencent/Hy-MT2-1.8B-GGUF:Q4_K_M -ngl 99 -c 2048 -np 1 -a hy-mt2-fast
   ```

   只有第一次运行会下载模型。之后只需再次运行上述命令即可。服务窗口需要保持开启。

4. 打开 Netflix 播放页并选择原字幕；中文翻译会自动显示。

## 设置

扩展设置只提供字幕相关选项：源/目标语言、字号、是否显示原文和参考前文条数。实时速度优先时，建议“参考前文条数”设为 `0`。

字幕只发送到本机 `127.0.0.1:8080` 的 llama.cpp 服务。
