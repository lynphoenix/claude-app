/**
 * Session Watcher
 * Watches local Claude Code session files and syncs changes in real-time
 * Similar to Happy's design - monitors ~/.claude/projects/*.jsonl files
 */

import { watch, readFileSync, existsSync, statSync, readdirSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

export interface SessionMessage {
  type: 'user' | 'assistant';
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  lineNumber: number;
}

export class SessionWatcher extends EventEmitter {
  private watchers = new Map<string, any>();
  private lastPositions = new Map<string, number>(); // Track last read position
  private claudeDir: string;

  constructor() {
    super();
    this.claudeDir = join(homedir(), '.claude');
  }

  /**
   * Start watching a project's session file
   */
  startWatching(projectPath: string): void {
    const projectKey = this.getProjectKey(projectPath);
    const sessionFile = this.findLatestSession(projectKey);

    if (!sessionFile) {
      console.log(`[SessionWatcher] No session file found for ${projectPath}`);
      return;
    }

    // Stop existing watcher if any
    this.stopWatching(projectPath);

    console.log(`[SessionWatcher] 👀 Watching: ${sessionFile}`);

    // Initialize last position to current file size
    const stats = statSync(sessionFile);
    this.lastPositions.set(projectPath, stats.size);

    // Watch for changes
    const watcher = watch(sessionFile, (eventType) => {
      if (eventType === 'change') {
        this.handleFileChange(projectPath, sessionFile);
      }
    });

    this.watchers.set(projectPath, watcher);
  }

  /**
   * Stop watching a project
   */
  stopWatching(projectPath: string): void {
    const watcher = this.watchers.get(projectPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(projectPath);
      this.lastPositions.delete(projectPath);
      console.log(`[SessionWatcher] 🛑 Stopped watching: ${projectPath}`);
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const [projectPath] of this.watchers) {
      this.stopWatching(projectPath);
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(projectPath: string, filePath: string): void {
    console.log(`[SessionWatcher] 📝 File changed: ${filePath}`);

    try {
      const stats = statSync(filePath);
      const lastPosition = this.lastPositions.get(projectPath) || 0;

      console.log(`[SessionWatcher] Size: ${stats.size}, Last: ${lastPosition}`);

      // File was appended
      if (stats.size > lastPosition) {
        const newContent = this.readFromPosition(filePath, lastPosition);
        console.log(`[SessionWatcher] New content length: ${newContent.length}`);

        const newMessages = this.parseNewLines(newContent, lastPosition);
        console.log(`[SessionWatcher] Parsed ${newMessages.length} new messages`);

        // Update position
        this.lastPositions.set(projectPath, stats.size);

        // Emit new messages
        for (const message of newMessages) {
          console.log(`[SessionWatcher] 📤 Emitting: ${message.role}: ${message.content.substring(0, 60)}...`);
          this.emit('message', projectPath, message);
        }
      } else {
        console.log(`[SessionWatcher] No new content (size <= lastPosition)`);
      }
    } catch (error) {
      console.error(`[SessionWatcher] Error handling file change:`, error);
    }
  }

  /**
   * Read file content from a specific position
   */
  private readFromPosition(filePath: string, position: number): string {
    const fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(1024 * 1024); // 1MB buffer
    const bytesRead = readSync(fd, buffer, 0, buffer.length, position);
    closeSync(fd);
    return buffer.toString('utf8', 0, bytesRead);
  }

  /**
   * Parse new lines from content
   */
  private parseNewLines(content: string, startPosition: number): SessionMessage[] {
    const messages: SessionMessage[] = [];
    const lines = content.split('\n');
    let currentPosition = startPosition;

    for (const line of lines) {
      if (!line.trim()) {
        currentPosition += line.length + 1;
        continue;
      }

      try {
        const record = JSON.parse(line);

        // Parse user messages
        if (record.type === 'user' && record.message) {
          const content = this.extractContent(record.message.content);
          if (content) {
            messages.push({
              type: 'user',
              role: 'user',
              content,
              timestamp: new Date(record.timestamp || Date.now()).getTime(),
              lineNumber: currentPosition
            });
          }
        }
        // Parse assistant messages
        else if (record.type === 'assistant' && record.message) {
          const content = this.extractContent(record.message.content);
          if (content) {
            messages.push({
              type: 'assistant',
              role: 'assistant',
              content,
              timestamp: new Date(record.timestamp || Date.now()).getTime(),
              lineNumber: currentPosition
            });
          }
        }
      } catch (e) {
        // Skip malformed lines
      }

      currentPosition += line.length + 1;
    }

    return messages;
  }

  /**
   * Extract text content from message content
   */
  private extractContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
    }

    return '';
  }

  /**
   * Get project key from path
   */
  private getProjectKey(projectPath: string): string {
    return projectPath.replace(/\//g, '-');
  }

  /**
   * Find the most recent session file for a project
   */
  private findLatestSession(projectKey: string): string | null {
    const projectDir = join(this.claudeDir, 'projects', projectKey);

    if (!existsSync(projectDir)) {
      return null;
    }

    try {
      const files = readdirSync(projectDir)
        .filter((f: string) => f.endsWith('.jsonl'))
        .map((f: string) => {
          const fullPath = join(projectDir, f);
          const stats = statSync(fullPath);
          return { path: fullPath, mtime: stats.mtime.getTime() };
        })
        .sort((a: {path: string; mtime: number}, b: {path: string; mtime: number}) => b.mtime - a.mtime);

      if (files.length === 0) {
        return null;
      }

      return files[0].path;
    } catch (error) {
      console.error(`[SessionWatcher] Error finding session:`, error);
      return null;
    }
  }
}
