/**
 * Claude Process Pool Manager
 * Manages multiple Claude processes for different projects
 * - Smart reuse: Don't restart if already running
 * - History resume: Use --resume to continue conversations
 * - LRU cleanup: Limit max concurrent processes
 */

import { ClaudeProcess, OutputChunk } from './claudeProcess.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

interface ProcessInfo {
  process: ClaudeProcess;
  claudeSessionId: string;
  projectPath: string;
  lastActiveTime: number;
}

export class ClaudeProcessPool extends EventEmitter {
  private processes = new Map<string, ProcessInfo>();
  private maxProcesses: number;
  private currentProjectPath: string | null = null;

  constructor(maxProcesses: number = 3) {
    super();
    this.maxProcesses = maxProcesses;
  }

  /**
   * Get or create a Claude process for a project
   */
  async getOrCreateProcess(
    projectPath: string,
    config: { claudePath: string }
  ): Promise<ClaudeProcess> {
    // Check if we already have a running process for this project
    const existing = this.processes.get(projectPath);

    if (existing && existing.process.isRunning()) {
      console.log(`ℹ️  [ProcessPool] Reusing existing process for ${projectPath} (PID: ${existing.process.getPid()})`);
      existing.lastActiveTime = Date.now();
      this.currentProjectPath = projectPath;
      return existing.process;
    }

    // Need to create a new process
    console.log(`🚀 [ProcessPool] Creating new Claude process for ${projectPath}`);

    // Find the latest Claude session for this project
    const claudeSessionId = await this.findLatestClaudeSession(projectPath);

    if (claudeSessionId) {
      console.log(`📜 [ProcessPool] Found existing session: ${claudeSessionId}`);
    } else {
      console.log(`✨ [ProcessPool] Starting new session for ${projectPath}`);
    }

    // Create the process
    const process = new ClaudeProcess({
      claudePath: config.claudePath,
      workingDirectory: projectPath,
      sessionId: claudeSessionId || undefined  // Will use --resume if available
    });

    // Forward output events
    process.on('output', (chunk: OutputChunk) => {
      // Only emit if this is the currently active project
      if (this.currentProjectPath === projectPath) {
        this.emit('output', projectPath, chunk);
      }
    });

    // Handle session-not-found (need to restart without --resume)
    process.on('session-not-found', async () => {
      console.log(`🔄 [ProcessPool] Session not found, restarting without --resume for ${projectPath}`);

      // Stop the current process
      process.stop();
      this.processes.delete(projectPath);

      // Restart without session ID (create new session)
      const newProcess = new ClaudeProcess({
        claudePath: config.claudePath,
        workingDirectory: projectPath,
        sessionId: undefined  // No --resume, create new session
      });

      // Re-setup event handlers
      newProcess.on('output', (chunk: OutputChunk) => {
        if (this.currentProjectPath === projectPath) {
          this.emit('output', projectPath, chunk);
        }
      });

      newProcess.on('exit', ({ code, signal }) => {
        console.log(`⚠️  [ProcessPool] Process exited for ${projectPath} (code: ${code}, signal: ${signal})`);
        this.processes.delete(projectPath);
        if (this.currentProjectPath === projectPath) {
          this.emit('process-exit', projectPath, { code, signal });
        }
      });

      await newProcess.start();

      // Update pool
      this.processes.set(projectPath, {
        process: newProcess,
        claudeSessionId: 'new',
        projectPath,
        lastActiveTime: Date.now()
      });
    });

    // Handle process exit
    process.on('exit', ({ code, signal }) => {
      console.log(`⚠️  [ProcessPool] Process exited for ${projectPath} (code: ${code}, signal: ${signal})`);
      this.processes.delete(projectPath);

      if (this.currentProjectPath === projectPath) {
        this.emit('process-exit', projectPath, { code, signal });
      }
    });

    // Start the process
    await process.start();

    // Store in pool
    const info: ProcessInfo = {
      process,
      claudeSessionId: claudeSessionId || 'new',
      projectPath,
      lastActiveTime: Date.now()
    };

    this.processes.set(projectPath, info);
    this.currentProjectPath = projectPath;

    // Cleanup if we exceed max processes
    await this.cleanupIdleProcesses();

    return process;
  }

  /**
   * Get the currently active process
   */
  getCurrentProcess(): ClaudeProcess | null {
    if (!this.currentProjectPath) {
      return null;
    }

    const info = this.processes.get(this.currentProjectPath);
    return info?.process || null;
  }

  /**
   * Get the current project's Claude session ID
   */
  getCurrentClaudeSessionId(): string | null {
    if (!this.currentProjectPath) {
      return null;
    }

    const info = this.processes.get(this.currentProjectPath);
    return info?.claudeSessionId || null;
  }

  /**
   * Switch to a different project (without restarting)
   */
  switchToProject(projectPath: string): void {
    const info = this.processes.get(projectPath);

    if (info && info.process.isRunning()) {
      console.log(`🔄 [ProcessPool] Switching to project: ${projectPath}`);
      this.currentProjectPath = projectPath;
      info.lastActiveTime = Date.now();
    } else {
      console.log(`⚠️  [ProcessPool] No running process for ${projectPath}`);
    }
  }

  /**
   * Stop a specific project's process
   */
  stopProcess(projectPath: string): void {
    const info = this.processes.get(projectPath);

    if (info) {
      console.log(`🛑 [ProcessPool] Stopping process for ${projectPath}`);
      info.process.stop();
      this.processes.delete(projectPath);

      if (this.currentProjectPath === projectPath) {
        this.currentProjectPath = null;
      }
    }
  }

  /**
   * Stop all processes
   */
  stopAll(): void {
    console.log(`🛑 [ProcessPool] Stopping all processes (${this.processes.size} active)`);

    for (const [projectPath, info] of this.processes.entries()) {
      console.log(`   - Stopping: ${projectPath}`);
      info.process.stop();
    }

    this.processes.clear();
    this.currentProjectPath = null;
  }

  /**
   * Cleanup idle processes if we exceed max
   */
  private async cleanupIdleProcesses(): Promise<void> {
    if (this.processes.size <= this.maxProcesses) {
      return;
    }

    console.log(`🧹 [ProcessPool] Too many processes (${this.processes.size}/${this.maxProcesses}), cleaning up...`);

    // Sort by last active time, excluding current project
    const sorted = Array.from(this.processes.entries())
      .filter(([path]) => path !== this.currentProjectPath)
      .sort((a, b) => a[1].lastActiveTime - b[1].lastActiveTime);

    // Stop the oldest process
    if (sorted.length > 0) {
      const [oldestPath, oldestInfo] = sorted[0];
      console.log(`   - Stopping idle process: ${oldestPath} (last active: ${new Date(oldestInfo.lastActiveTime).toLocaleTimeString()})`);
      oldestInfo.process.stop();
      this.processes.delete(oldestPath);
    }
  }

  /**
   * Find the latest Claude session for a project
   */
  private async findLatestClaudeSession(projectPath: string): Promise<string | null> {
    try {
      // Convert project path to Claude's format
      const projectKey = projectPath.replace(/\//g, '-');
      const claudeProjectDir = join(homedir(), '.claude', 'projects', projectKey);

      if (!existsSync(claudeProjectDir)) {
        return null;
      }

      // Find all .jsonl files
      const files = readdirSync(claudeProjectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const fullPath = join(claudeProjectDir, f);
          return {
            name: f,
            path: fullPath,
            mtime: statSync(fullPath).mtime
          };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (files.length === 0) {
        return null;
      }

      // Session ID is the filename without .jsonl
      const sessionId = files[0].name.replace('.jsonl', '');
      return sessionId;
    } catch (error) {
      console.error(`[ProcessPool] Error finding latest session:`, error);
      return null;
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalProcesses: this.processes.size,
      maxProcesses: this.maxProcesses,
      currentProject: this.currentProjectPath,
      projects: Array.from(this.processes.entries()).map(([path, info]) => ({
        path,
        pid: info.process.getPid(),
        sessionId: info.claudeSessionId,
        lastActive: new Date(info.lastActiveTime).toLocaleTimeString()
      }))
    };
  }
}
