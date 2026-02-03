/**
 * Session Writer
 * Writes messages to Claude's local session files (.jsonl)
 * Ensures that Mobile messages are persisted to local CLI history
 *
 * Format matches Claude Code's native JSONL format for proper CLI compatibility
 */

import { appendFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';

export class SessionWriter {
  private claudeDir: string;
  private claudeVersion: string;

  constructor() {
    this.claudeDir = join(homedir(), '.claude');
    // Try to get Claude version
    try {
      const versionOutput = execSync('claude --version 2>/dev/null', { encoding: 'utf8' });
      // Parse "Claude Code 2.1.29" → "2.1.29"
      const match = versionOutput.match(/(\d+\.\d+\.\d+)/);
      this.claudeVersion = match ? match[1] : '2.1.29';
    } catch {
      this.claudeVersion = '2.1.29';
    }
  }

  /**
   * Write a user message in Claude's native format
   * Returns the generated UUID for linking next message
   */
  writeUserMessage(projectPath: string, sessionId: string, content: string, parentUuid?: string): string {
    try {
      const projectKey = this.getProjectKey(projectPath);
      const sessionFile = join(this.claudeDir, 'projects', projectKey, `${sessionId}.jsonl`);

      if (!existsSync(sessionFile)) {
        console.error(`[SessionWriter] Session file not found: ${sessionFile}`);
        return '';
      }

      // Get git branch
      let gitBranch = 'main';
      try {
        gitBranch = execSync('git branch --show-current', {
          cwd: projectPath,
          encoding: 'utf8'
        }).trim();
      } catch {
        // Ignore git errors
      }

      const messageUuid = uuidv4();

      // Build message in Claude's native format
      const message = {
        parentUuid: parentUuid || uuidv4(),
        isSidechain: false,
        userType: 'external',
        cwd: projectPath,
        sessionId: sessionId,  // Note: sessionId not session_id
        version: this.claudeVersion,
        gitBranch: gitBranch,
        slug: this.generateSlug(),
        type: 'user',
        message: {
          role: 'user',
          content: content
        },
        uuid: messageUuid,
        timestamp: new Date().toISOString(),
        permissionMode: 'default'
      };

      // Append message as JSONL (one line)
      const jsonLine = JSON.stringify(message) + '\n';
      appendFileSync(sessionFile, jsonLine, 'utf8');

      console.log(`[SessionWriter] ✅ Wrote user message to session file`);
      return messageUuid;
    } catch (error) {
      console.error(`[SessionWriter] Error writing user message:`, error);
      return '';
    }
  }

  /**
   * Write an assistant message in Claude's native format
   * Returns the generated UUID for linking next message
   */
  writeAssistantMessage(projectPath: string, sessionId: string, content: string, parentUuid?: string): string {
    try {
      const projectKey = this.getProjectKey(projectPath);
      const sessionFile = join(this.claudeDir, 'projects', projectKey, `${sessionId}.jsonl`);

      if (!existsSync(sessionFile)) {
        console.error(`[SessionWriter] Session file not found: ${sessionFile}`);
        return '';
      }

      // Get git branch
      let gitBranch = 'main';
      try {
        gitBranch = execSync('git branch --show-current', {
          cwd: projectPath,
          encoding: 'utf8'
        }).trim();
      } catch {
        // Ignore git errors
      }

      const messageUuid = uuidv4();

      // Build message in Claude's native format
      const message = {
        parentUuid: parentUuid || uuidv4(),
        isSidechain: false,
        cwd: projectPath,
        sessionId: sessionId,  // Note: sessionId not session_id
        version: this.claudeVersion,
        gitBranch: gitBranch,
        type: 'assistant',
        message: {
          id: uuidv4().replace(/-/g, ''),
          type: 'message',
          role: 'assistant',
          model: 'anthropic/claude-sonnet-4.5-20250929',
          content: [{
            type: 'text',
            text: content
          }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0
          }
        },
        parentToolUseId: null,
        uuid: messageUuid,
        timestamp: new Date().toISOString()
      };

      // Append message as JSONL (one line)
      const jsonLine = JSON.stringify(message) + '\n';
      appendFileSync(sessionFile, jsonLine, 'utf8');

      console.log(`[SessionWriter] ✅ Wrote assistant message to session file`);
      return messageUuid;
    } catch (error) {
      console.error(`[SessionWriter] Error writing assistant message:`, error);
      return '';
    }
  }

  /**
   * Generate a random slug for user messages
   */
  private generateSlug(): string {
    const adjectives = ['tranquil', 'serene', 'peaceful', 'gentle', 'calm', 'quiet'];
    const nouns = ['painting', 'drawing', 'sketch', 'portrait', 'landscape', 'scene'];
    const names = ['dahl', 'monet', 'picasso', 'rembrandt', 'vangogh', 'renoir'];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const name = names[Math.floor(Math.random() * names.length)];

    return `${adj}-${noun}-${name}`;
  }

  /**
   * Get project key from path (same format as Claude CLI)
   */
  private getProjectKey(projectPath: string): string {
    return projectPath.replace(/\//g, '-');
  }
}
