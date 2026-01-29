import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export class ClaudeHandler {
  private projectPath: string;
  private sessionId: string | null = null;
  private sessionFile: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.sessionFile = path.join(projectPath, '.claude-session-id');
    this.loadOrCreateSession();
  }

  /**
   * 加载或创建 session ID
   * 查找该项目路径最近使用的 session，如果没有则创建新的
   */
  private loadOrCreateSession(): void {
    try {
      // Claude Code 将 session 存储在 ~/.claude/projects/<项目路径编码>/ 目录下
      const projectDirName = this.projectPath.replace(/\//g, '-');
      const sessionDir = path.join(os.homedir(), '.claude', 'projects', projectDirName);

      console.log('查找 session 目录:', sessionDir);

      // 如果项目 session 目录不存在，创建新 session
      if (!fs.existsSync(sessionDir)) {
        this.sessionId = uuidv4();
        console.log('项目目录不存在，创建新 session:', this.sessionId);
        return;
      }

      // 读取该项目下的所有 session 文件
      const sessionFiles = fs.readdirSync(sessionDir)
        .filter(file => file.endsWith('.jsonl') && file !== 'sessions-index.json')
        .map(file => path.join(sessionDir, file));

      if (sessionFiles.length === 0) {
        this.sessionId = uuidv4();
        console.log('项目下无 session 文件，创建新 session:', this.sessionId);
        return;
      }

      // 找到最新修改的 session 文件
      let latestSession: { id: string, mtime: number } | null = null;

      for (const sessionFile of sessionFiles) {
        try {
          const stats = fs.statSync(sessionFile);
          const sessionId = path.basename(sessionFile, '.jsonl');

          if (!latestSession || stats.mtimeMs > latestSession.mtime) {
            latestSession = { id: sessionId, mtime: stats.mtimeMs };
          }
        } catch (error) {
          continue;
        }
      }

      // 使用找到的最新 session
      if (latestSession) {
        this.sessionId = latestSession.id;
        console.log('找到项目最新 session:', this.sessionId, '项目:', this.projectPath);
      } else {
        this.sessionId = uuidv4();
        console.log('未找到可用 session，创建新 session:', this.sessionId);
      }
    } catch (error) {
      console.error('Session 文件操作失败:', error);
      this.sessionId = uuidv4();
    }
  }

  /**
   * 发送消息给 Claude Code CLI（使用 -c 模式继续对话）
   */
  sendMessage(
    content: string,
    onStream: (chunk: string) => void,
    onDone: () => void,
    onError?: (error: string) => void
  ): void {
    const claudePath = path.join(os.homedir(), '.local/bin/claude');

    console.log('发送消息到 Claude (project:', this.projectPath, ', session:', this.sessionId, '):', content);

    // 检查用户消息中是否包含危险关键词
    const dangerousPatterns = [
      /\brm\s+-rf\b/i,
      /\bkill\s+-9/i,
      /\bpkill\b/i,
      /\bkillall\b/i,
      /\bshutdown\b/i,
      /\breboot\b/i,
      /\bdd\s+if=/i,
      /\bmkfs\b/i,
      /\bformat\b/i,
      /\b:(){:|:&};:\b/i, // fork bomb
    ];

    const containsDangerousPattern = dangerousPatterns.some(pattern => pattern.test(content));

    if (containsDangerousPattern) {
      console.warn('检测到潜在危险操作，使用 acceptEdits 模式');
    }

    // 根据消息内容选择权限模式
    // 如果检测到危险操作，使用 acceptEdits（只自动接受文件编辑）
    // 否则使用 dontAsk（自动执行所有操作）
    const permissionMode = containsDangerousPattern ? 'acceptEdits' : 'dontAsk';

    // 使用 --continue 让 Claude 自动管理 session
    const command = `source ~/glm.sh && echo "${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" | ${claudePath} --continue -p --permission-mode=${permissionMode}`;

    const claudeProcess = spawn('bash', ['-c', command], {
      cwd: this.projectPath,
      env: {
        ...process.env,
        PATH: process.env.PATH + ':' + path.join(os.homedir(), '.local/bin'),
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let fullResponse = '';

    // 监听标准输出
    claudeProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      console.log('Claude 输出:', chunk.substring(0, 150));
      fullResponse += chunk;
      onStream(chunk);
    });

    // 监听错误输出
    claudeProcess.stderr?.on('data', (data: Buffer) => {
      const errorText = data.toString();
      console.error('Claude stderr:', errorText);
    });

    // 监听进程退出
    claudeProcess.on('close', (code: number | null) => {
      console.log(`Claude CLI 进程退出，代码: ${code}`);

      if (code === 0) {
        onDone();
      } else {
        onError?.(`Claude 进程异常退出，代码: ${code}`);
      }
    });

    // 监听错误事件
    claudeProcess.on('error', (error: Error) => {
      console.error('Claude CLI 进程错误:', error);
      onError?.(`进程错误: ${error.message}`);
    });
  }

  /**
   * 获取 session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 获取 session 历史（从 Claude Code 的 session 文件读取）
   * @param limit 返回的消息数量，默认20
   * @param offset 跳过的消息数量，用于分页
   */
  async getSessionHistory(limit: number = 20, offset: number = 0): Promise<any> {
    try {
      const projectDirName = this.projectPath.replace(/\//g, '-');
      const sessionDir = path.join(os.homedir(), '.claude', 'projects', projectDirName);
      const sessionFilePath = path.join(sessionDir, `${this.sessionId}.jsonl`);

      if (fs.existsSync(sessionFilePath)) {
        const content = fs.readFileSync(sessionFilePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);
        const allMessages = lines.map(line => JSON.parse(line));

        console.log(`读取到 ${allMessages.length} 条原始记录`);

        // 反转数组，从最新到最旧
        allMessages.reverse();

        // 分页返回
        const start = offset;
        const end = offset + limit;
        const pagedMessages = allMessages.slice(start, end);

        // 再反转回来，保持时间顺序（旧到新）
        pagedMessages.reverse();

        console.log(`返回 ${pagedMessages.length} 条记录，hasMore: ${end < allMessages.length}`);

        return {
          messages: pagedMessages,
          total: allMessages.length,
          hasMore: end < allMessages.length
        };
      }
      console.log('Session 文件不存在:', sessionFilePath);
      return { messages: [], total: 0, hasMore: false };
    } catch (error) {
      console.error('读取 session 历史失败:', error);
      return { messages: [], total: 0, hasMore: false };
    }
  }

  /**
   * 中断当前正在进行的操作
   */
  interrupt(): void {
    console.log('中断操作');
  }

  /**
   * 清理资源（不清空 session）
   */
  dispose(): void {
    console.log('ClaudeHandler dispose (session 保留)');
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
    this.projectPath = newPath;
    this.sessionFile = path.join(newPath, '.claude-session-id');
    this.loadOrCreateSession();
  }
}
