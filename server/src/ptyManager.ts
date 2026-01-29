import * as pty from 'node-pty';
import { IPty } from 'node-pty';
import os from 'os';
import path from 'path';

/**
 * PTY管理器 - 管理伪终端的生命周期
 */
export class PTYManager {
  private pty: IPty | null = null;
  private sessionId: string;
  private projectPath: string;

  constructor(sessionId: string, projectPath: string) {
    this.sessionId = sessionId;
    this.projectPath = projectPath;
  }

  /**
   * 创建PTY进程
   */
  createPTY(): IPty {
    if (this.pty) {
      return this.pty;
    }

    // 创建伪终端
    this.pty = pty.spawn('bash', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: this.projectPath,
      env: {
        ...process.env,
        PATH: process.env.PATH + ':' + path.join(os.homedir(), '.local/bin'),
      }
    });

    console.log('[PTY] 创建终端:', this.sessionId, 'pid:', this.pty.pid);

    return this.pty;
  }

  /**
   * 在PTY中执行命令
   */
  executeCommand(command: string): void {
    if (!this.pty) {
      throw new Error('PTY未初始化');
    }

    console.log('[PTY] 执行命令:', command);
    this.pty.write(command + '\n');
  }

  /**
   * 向PTY发送输入（如密码、确认等）
   */
  sendInput(input: string): void {
    if (!this.pty) {
      throw new Error('PTY未初始化');
    }

    this.pty.write(input);
  }

  /**
   * 监听PTY输出
   */
  onData(callback: (data: string) => void): void {
    if (!this.pty) {
      throw new Error('PTY未初始化');
    }

    this.pty.onData(callback);
  }

  /**
   * 监听PTY退出
   */
  onExit(callback: (exitCode: number) => void): void {
    if (!this.pty) {
      throw new Error('PTY未初始化');
    }

    this.pty.onExit(({ exitCode }) => {
      console.log('[PTY] 进程退出:', exitCode);
      callback(exitCode);
    });
  }

  /**
   * 调整终端大小
   */
  resize(cols: number, rows: number): void {
    if (this.pty) {
      this.pty.resize(cols, rows);
    }
  }

  /**
   * 销毁PTY
   */
  destroy(): void {
    if (this.pty) {
      console.log('[PTY] 销毁终端:', this.sessionId);
      this.pty.kill();
      this.pty = null;
    }
  }

  /**
   * 获取PTY是否存活
   */
  isAlive(): boolean {
    return this.pty !== null;
  }
}
