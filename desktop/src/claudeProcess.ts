/**
 * Claude Process Manager
 * Manages Claude Code as a subprocess with script command for PTY emulation
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';

export interface ClaudeProcessOptions {
  claudePath: string;
  workingDirectory: string;
  sessionId?: string;
  apiConfig?: {
    baseUrl?: string;
    authToken?: string;
    model?: string;
  };
}

export interface OutputChunk {
  content: string;
  isPermissionRequest: boolean;
  timestamp: number;
}

// Permission request patterns
const PERMISSION_PATTERNS = [
  /Do you want to proceed\?/i,
  /\(yes\/no\)/i,
  /Continue\?/i,
  /Approve this action\?/i,
  /Allow.*\?/i
];

/**
 * Strip ANSI escape codes from text
 */
function stripAnsi(text: string): string {
  // Remove all ANSI escape sequences
  return text
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')           // CSI sequences
    .replace(/\x1b\][0-9;]*;?[^\x07\x1b]*(\x07|\x1b\\)/g, '')  // OSC sequences
    .replace(/\x1b[=>PX^_]/g, '')                     // Other escape sequences
    .replace(/\x1b[()][AB0-9]/g, '')                  // Character set selection
    .replace(/\[\?[0-9;]*[a-zA-Z]/g, '')              // Leftover CSI-like sequences
    .replace(/\][0-9];[^\x07]*\x07/g, '')             // Leftover OSC-like sequences
    .replace(/\[[@<>][a-z]/g, '')                     // Special sequences like [>1u, [<u
    .replace(/\r/g, '');                              // Remove carriage returns
}

export class ClaudeProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private options: ClaudeProcessOptions;
  private outputBuffer: string = '';
  private lastPermissionRequestTime: number = 0;

  constructor(options: ClaudeProcessOptions) {
    super();
    this.options = options;
  }

  /**
   * Start Claude Code as a subprocess with expect wrapper for PTY
   */
  async start(): Promise<void> {
    if (this.process) {
      console.log('[ClaudeProcess] Process already running');
      return;
    }

    const claudeBin = this.options.claudePath;

    console.log(`[ClaudeProcess] Starting Claude Code in stream mode...`);
    console.log(`[ClaudeProcess] Claude path: ${claudeBin}`);
    console.log(`[ClaudeProcess] Working directory: ${this.options.workingDirectory}`);

    // Build arguments for stream-json mode
    const args = [
      '--print',
      '--verbose',  // Required for stream-json output
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',  // ⭐ Enable standard permission protocol
      '--replay-user-messages',
      '--no-session-persistence'  // Disable Claude's auto-save, let SessionWriter handle it
    ];

    // Add session ID if resuming
    if (this.options.sessionId) {
      args.push('--resume', this.options.sessionId);
    }

    // Spawn Claude directly in stream mode (no need for expect/PTY)
    this.process = spawn(claudeBin, args, {
      cwd: this.options.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        // Add API configuration if provided
        ...(this.options.apiConfig?.baseUrl && { ANTHROPIC_BASE_URL: this.options.apiConfig.baseUrl }),
        ...(this.options.apiConfig?.authToken && { ANTHROPIC_AUTH_TOKEN: this.options.apiConfig.authToken }),
        ...(this.options.apiConfig?.model && {
          ANTHROPIC_MODEL: this.options.apiConfig.model,
          ANTHROPIC_DEFAULT_SONNET_MODEL: this.options.apiConfig.model,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: this.options.apiConfig.model,
          ANTHROPIC_DEFAULT_OPUS_MODEL: this.options.apiConfig.model
        })
      }
    });

    // Handle stdout (JSON stream)
    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      console.log(`[ClaudeProcess] 📥 Received stdout: ${text.length} bytes`);
      if (text.length < 500) {
        console.log(`[ClaudeProcess] Preview: ${text.substring(0, 200)}`);
      } else {
        // For large output, show first and last part
        console.log(`[ClaudeProcess] Preview (first 200): ${text.substring(0, 200)}`);
        console.log(`[ClaudeProcess] Preview (last 200): ${text.substring(text.length - 200)}`);
      }
      this.handleOutput(text);
    });

    // Handle stderr
    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      console.error(`[ClaudeProcess] stderr: ${error}`);
      this.emit('error-output', error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[ClaudeProcess] Process exited with code ${code}, signal ${signal}`);
      this.process = null;
      this.emit('exit', { code, signal });
    });

    // Handle process errors
    this.process.on('error', (error) => {
      console.error(`[ClaudeProcess] Process error:`, error);
      this.emit('process-error', error);
    });

    console.log(`[ClaudeProcess] ✅ Process started (PID: ${this.process.pid})`);
  }

  /**
   * Handle output from Claude Code (JSON stream format)
   */
  private handleOutput(data: string): void {
    // In stream-json mode, each line is a JSON object
    const lines = data.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line);

        // ⭐ Handle control_request (permission requests)
        if (json.type === 'control_request') {
          console.log(`[ClaudeProcess] 🔐 control_request detected: ${json.request?.tool_name}`);
          console.log(`[ClaudeProcess] 🔐 Request ID: ${json.request_id}`);
          console.log(`[ClaudeProcess] 🔐 Input:`, JSON.stringify(json.request?.input || {}).substring(0, 200));

          // Emit control_request event (not as regular output)
          this.emit('control_request', json);
          continue;  // Don't process as regular output
        }

        // Handle different message types
        if (json.type === 'assistant') {
          // Assistant message - extract content
          const content = json.message?.content;
          if (content && Array.isArray(content)) {
            // Content is an array of blocks (text, tool_use, etc.)
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                console.log(`[ClaudeProcess] 📤 Assistant content: ${block.text.length} bytes`);
                if (block.text.length < 200) {
                  console.log(`[ClaudeProcess] Content: ${block.text.substring(0, 100)}`);
                }

                // Emit output chunk
                const chunk: OutputChunk = {
                  content: block.text,
                  isPermissionRequest: false,
                  timestamp: Date.now()
                };

                this.emit('output', chunk);
              }
            }
          }
        } else if (json.type === 'result' && json.result) {
          // Result message - contains full response text
          console.log(`[ClaudeProcess] 📤 Result: ${json.result.length} bytes`);

          const chunk: OutputChunk = {
            content: json.result,
            isPermissionRequest: false,
            timestamp: Date.now()
          };

          this.emit('output', chunk);
        } else if (json.type === 'permission_request') {
          // Claude is asking for permission
          console.log(`[ClaudeProcess] 🔔 Permission request: ${JSON.stringify(json)}`);

          const prompt = json.prompt || json.message || 'Permission required';

          // Emit as permission request
          const chunk: OutputChunk = {
            content: prompt,
            isPermissionRequest: true,
            timestamp: Date.now()
          };

          this.emit('output', chunk);
        } else if (json.type === 'error') {
          console.error(`[ClaudeProcess] Error from Claude: ${json.error}`);

          // Check if session was not found
          if (json.error && json.error.includes('No conversation found')) {
            console.log(`[ClaudeProcess] ⚠️  Session not found, will restart without --resume`);
            this.emit('session-not-found');
          }
        }
        // Ignore other types (system, user, etc.)
      } catch (error) {
        // Not valid JSON, might be partial line or non-JSON output
        if (line.length > 10) {
          console.log(`[ClaudeProcess] Non-JSON output: ${line.substring(0, 100)}`);
        }
      }
    }
  }

  /**
   * Detect if output contains a permission request
   */
  private detectPermissionRequest(text: string): boolean {
    // Don't detect same permission request within 2 seconds
    const now = Date.now();
    if (now - this.lastPermissionRequestTime < 2000) {
      return false;
    }

    // Check against known patterns
    for (const pattern of PERMISSION_PATTERNS) {
      if (pattern.test(text)) {
        console.log(`[ClaudeProcess] 🔔 Permission request detected: ${pattern}`);
        this.lastPermissionRequestTime = now;
        return true;
      }
    }

    return false;
  }

  /**
   * Write input to Claude's stdin (JSON stream format)
   */
  writeInput(input: string): boolean {
    if (!this.process || !this.process.stdin) {
      console.error('[ClaudeProcess] Cannot write input: process not running');
      return false;
    }

    try {
      let message: any;

      // Check if this is a permission response (yes/no)
      const lowerInput = input.toLowerCase().trim();
      if (lowerInput === 'yes' || lowerInput === 'no') {
        // Send as permission response (control message)
        message = {
          type: 'control',
          control: 'permission_response',
          approved: lowerInput === 'yes'
        };
        console.log(`[ClaudeProcess] 📥 Writing permission response: ${lowerInput}`);
      } else {
        // Send as user message with proper structure
        message = {
          type: 'user',
          message: {
            role: 'user',
            content: input
          }
        };
        console.log(`[ClaudeProcess] 📥 Writing user message: ${input.substring(0, 50)}...`);
      }

      const jsonLine = JSON.stringify(message) + '\n';
      this.process.stdin.write(jsonLine);
      return true;
    } catch (error) {
      console.error('[ClaudeProcess] Error writing input:', error);
      return false;
    }
  }

  /**
   * ⭐ Send control_response to Claude CLI (for permission requests)
   * This uses the standard Claude CLI permission protocol
   */
  sendControlResponse(requestId: string, approved: boolean): boolean {
    if (!this.process || !this.process.stdin) {
      console.error('[ClaudeProcess] Cannot send control_response: process not running');
      return false;
    }

    try {
      const response = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: requestId,
          response: {
            behavior: approved ? 'allow' : 'deny'
          }
        }
      };

      console.log(`[ClaudeProcess] 📤 Sending control_response: ${approved ? 'ALLOW' : 'DENY'}`);
      console.log(`[ClaudeProcess] 📤 Request ID: ${requestId}`);

      const jsonLine = JSON.stringify(response) + '\n';
      this.process.stdin.write(jsonLine);
      return true;
    } catch (error) {
      console.error('[ClaudeProcess] Error sending control_response:', error);
      return false;
    }
  }

  /**
   * Stop the Claude process
   */
  stop(): void {
    if (!this.process) {
      return;
    }

    console.log('[ClaudeProcess] 🛑 Stopping process...');

    // Try graceful shutdown first
    this.process.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (this.process) {
        console.log('[ClaudeProcess] Force killing process...');
        this.process.kill('SIGKILL');
      }
    }, 5000);
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * Get process PID
   */
  getPid(): number | undefined {
    return this.process?.pid;
  }
}
