import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Load session history from Claude Code's .claude directory
 */
export class HistoryLoader {
  private claudeDir: string;

  constructor() {
    this.claudeDir = join(homedir(), '.claude');
  }

  /**
   * Get project key from path (same format as Claude Code uses)
   */
  private getProjectKey(projectPath: string): string {
    // Claude Code uses path with slashes replaced by dashes
    // e.g., /Users/name/project -> -Users-name-project
    return projectPath.replace(/\//g, '-');
  }

  /**
   * Find the most recent session file for a project
   */
  private findLatestSession(projectPath: string): string | null {
    const projectKey = this.getProjectKey(projectPath);
    const projectDir = join(this.claudeDir, 'projects', projectKey);

    if (!existsSync(projectDir)) {
      console.log(`[HistoryLoader] Project directory not found: ${projectDir}`);
      return null;
    }

    try {
      const files = readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => {
          const fullPath = join(projectDir, f);
          const stats = statSync(fullPath);
          return { path: fullPath, mtime: stats.mtime.getTime() };
        })
        .sort((a, b) => b.mtime - a.mtime); // Most recent first

      if (files.length === 0) {
        console.log(`[HistoryLoader] No session files found in ${projectDir}`);
        return null;
      }

      console.log(`[HistoryLoader] Found ${files.length} sessions, latest: ${files[0].path}`);
      return files[0].path;
    } catch (error) {
      console.error(`[HistoryLoader] Error finding sessions:`, error);
      return null;
    }
  }

  /**
   * Parse a session .jsonl file and extract messages
   */
  private parseSessionFile(filePath: string, limit: number = 50): HistoryMessage[] {
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      const messages: HistoryMessage[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const record = JSON.parse(line);

          // Claude Code session format:
          // { type: 'user' | 'assistant', message: { role, content }, timestamp }
          if (record.type === 'user' && record.message) {
            const content = this.extractContent(record.message.content);
            if (content) {
              messages.push({
                role: 'user',
                content,
                timestamp: record.timestamp || Date.now()
              });
            }
          } else if (record.type === 'assistant' && record.message) {
            const content = this.extractContent(record.message.content);
            if (content) {
              messages.push({
                role: 'assistant',
                content,
                timestamp: record.timestamp || Date.now()
              });
            }
          }
        } catch (e) {
          // Skip malformed lines
          continue;
        }
      }

      // Return last N messages
      return messages.slice(-limit);
    } catch (error) {
      console.error(`[HistoryLoader] Error parsing session file:`, error);
      return [];
    }
  }

  /**
   * Extract text content from various message content formats
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
   * Load history for a project
   */
  async loadHistory(projectPath: string, limit: number = 50): Promise<HistoryMessage[]> {
    console.log(`[HistoryLoader] Loading history for project: ${projectPath}`);

    const sessionFile = this.findLatestSession(projectPath);
    if (!sessionFile) {
      console.log(`[HistoryLoader] No history found for project`);
      return [];
    }

    const messages = this.parseSessionFile(sessionFile, limit);
    console.log(`[HistoryLoader] Loaded ${messages.length} messages from history`);
    return messages;
  }
}
