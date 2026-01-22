import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export class ClaudeHandler {
  private process: ChildProcess | null = null;
  private projectPath: string;
  private messageBuffer: string = '';

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * 发送消息给 Claude Code CLI
   * @param content 用户消息内容
   * @param onResponse 响应回调
   * @param onError 错误回调
   */
  sendMessage(content: string, onResponse: (response: string) => void, onError?: (error: string) => void): void {
    // 如果有正在运行的进程，先终止它
    if (this.process) {
      this.process.kill();
    }

    try {
      // 启动 Claude Code CLI 进程
      // 假设 claude 命令在 PATH 中，并且通过 stdin/stdout 交互
      this.process = spawn('claude', ['--no-prompt', '--json'], {
        cwd: this.projectPath,
        env: {
          ...process.env,
          // 设置 Claude Code 相关的环境变量
        }
      });

      let responseBuffer = '';

      // 处理标准输出
      this.process.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();

        try {
          // 尝试解析 JSON 输出
          const jsonMatch = chunk.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.content || parsed.message) {
              onResponse(parsed.content || parsed.message);
            }
          }
        } catch {
          // 如果不是 JSON，直接发送文本
          responseBuffer += chunk;
          // 如果检测到完整的响应（根据 Claude Code CLI 的输出格式调整）
          if (chunk.includes('\n') || chunk.includes('�')) {
            onResponse(responseBuffer.trim());
            responseBuffer = '';
          }
        }
      });

      // 处理错误输出
      this.process.stderr?.on('data', (data: Buffer) => {
        const errorText = data.toString();
        console.error('Claude CLI 错误:', errorText);

        // 某些错误信息可能需要发送给客户端
        if (errorText.includes('error') || errorText.includes('Error')) {
          onError?.(errorText);
        }
      });

      // 处理进程退出
      this.process.on('close', (code) => {
        console.log(`Claude CLI 进程退出，代码: ${code}`);
        if (responseBuffer.trim()) {
          onResponse(responseBuffer.trim());
        }
        this.process = null;
      });

      // 发送用户消息
      this.process.stdin?.write(content + '\n');

      // 如果需要在单次调用模式下，关闭 stdin
      // this.process.stdin?.end();

    } catch (error) {
      onError?.(`启动 Claude Code CLI 失败: ${error}`);
    }
  }

  /**
   * 中断当前正在进行的操作
   */
  interrupt(): void {
    if (this.process) {
      this.process.kill('SIGINT');
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * 获取当前项目路径
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * 设置新的项目路径
   */
  setProjectPath(newPath: string): void {
    this.dispose();
    this.projectPath = newPath;
  }
}
