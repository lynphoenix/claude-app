/**
 * Claude Manager
 * Manages Claude CLI process lifecycle and ACP protocol communication
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import type {
  ClaudeSession,
  ACPMessage,
  ACPUserMessage,
  ACPAssistantMessage,
  ACPControlRequest,
  ACPControlResponse,
  PermissionResult,
  PermissionRequest
} from './types.js';

export class ClaudeManager {
  private sessions = new Map<string, ClaudeSession>();
  private pendingPermissionRequests = new Map<string, {
    resolve: (result: PermissionResult) => void;
    reject: (error: Error) => void;
  }>();

  constructor(
    private claudePath: string,
    private onOutput: (sessionId: string, content: string) => void,
    private onPermissionRequest: (request: PermissionRequest) => void,
    private onSessionEnd: (sessionId: string, result: any) => void
  ) {}

  /**
   * Start a new Claude session
   */
  async startSession(
    sessionId: string,
    projectPath: string,
    initialMessage?: string
  ): Promise<void> {
    if (this.sessions.has(sessionId)) {
      console.log(`⚠️  Session ${sessionId} already exists, reusing`);
      const session = this.sessions.get(sessionId)!;
      if (initialMessage) {
        this.sendMessage(sessionId, initialMessage);
      }
      return;
    }

    console.log(`🚀 Starting Claude session: ${sessionId}`);
    console.log(`   Project path: ${projectPath}`);

    const args = [
      '--print',
      '--verbose',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',
      '--replay-user-messages'
    ];

    const claudeProcess = spawn(this.claudePath, args, {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const session: ClaudeSession = {
      sessionId,
      projectPath,
      process: claudeProcess,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.sessions.set(sessionId, session);

    // Set up stdio handlers
    this.setupProcessHandlers(session, claudeProcess);

    // Send initial message if provided
    if (initialMessage) {
      await this.sendMessage(sessionId, initialMessage);
    }
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(
    session: ClaudeSession,
    process: ChildProcessWithoutNullStreams
  ): void {
    const rl = createInterface({ input: process.stdout });
    let buffer = '';

    // Handle stdout (JSONL messages)
    rl.on('line', (line) => {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as ACPMessage;
          this.handleClaudeMessage(session.sessionId, message);
        } catch (e) {
          console.error('❌ Failed to parse Claude output:', e);
          console.error('   Line:', line);
        }
      }
    });

    // Handle stderr
    process.stderr.on('data', (data: Buffer) => {
      console.error(`Claude stderr [${session.sessionId}]:`, data.toString());
    });

    // Handle process exit
    process.on('exit', (code, signal) => {
      console.log(`Claude process exited [${session.sessionId}]: code=${code}, signal=${signal}`);
      this.sessions.delete(session.sessionId);
      this.onSessionEnd(session.sessionId, { code, signal });
    });

    // Handle process errors
    process.on('error', (error) => {
      console.error(`Claude process error [${session.sessionId}]:`, error);
      this.sessions.delete(session.sessionId);
      this.onSessionEnd(session.sessionId, { error });
    });
  }

  /**
   * Handle messages from Claude CLI
   */
  private async handleClaudeMessage(sessionId: string, message: ACPMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`❌ Session ${sessionId} not found for message:`, message.type);
      return;
    }

    session.lastActivity = Date.now();

    switch (message.type) {
      case 'assistant':
        await this.handleAssistantMessage(sessionId, message as ACPAssistantMessage);
        break;

      case 'control_request':
        await this.handleControlRequest(sessionId, message as ACPControlRequest);
        break;

      case 'result':
        console.log(`✅ Session completed [${sessionId}]:`, message);
        this.onSessionEnd(sessionId, message);
        break;

      case 'log':
        // Debug logs from Claude
        break;

      default:
        console.log(`Unhandled Claude message type: ${message.type}`);
    }
  }

  /**
   * Handle assistant messages (output chunks)
   */
  private async handleAssistantMessage(
    sessionId: string,
    message: ACPAssistantMessage
  ): Promise<void> {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      if (block.type === 'text' && block.text) {
        this.onOutput(sessionId, block.text);
      } else if (block.type === 'tool_use') {
        // Tool use will trigger permission request separately
        console.log(`🔧 Tool use: ${block.name}`, block.input);
      }
    }
  }

  /**
   * Handle control requests (permission prompts)
   */
  private async handleControlRequest(
    sessionId: string,
    message: ACPControlRequest
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'waiting-permission';

    if (message.request.subtype === 'can_use_tool') {
      const requestId = message.request_id;
      const toolName = message.request.tool_name || 'Unknown';
      const input = message.request.input || {};

      console.log(`🔐 Permission request [${sessionId}]: ${toolName}`);

      // Create permission request
      const permissionRequest: PermissionRequest = {
        id: requestId,
        sessionId,
        toolName,
        input,
        createdAt: Date.now()
      };

      // Notify callback (will forward to mobile)
      this.onPermissionRequest(permissionRequest);

      // Wait for response (will be provided via respondToPermission)
    } else if (message.request.subtype === 'interrupt') {
      // Handle interrupt request
      console.log(`⚠️  Interrupt request [${sessionId}]`);
      this.sendControlResponse(sessionId, message.request_id, {
        subtype: 'success',
        request_id: message.request_id
      });
    }
  }

  /**
   * Respond to a permission request (called when mobile responds)
   */
  async respondToPermission(
    sessionId: string,
    requestId: string,
    result: PermissionResult
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process) {
      console.error(`❌ Session ${sessionId} not found for permission response`);
      return;
    }

    console.log(`✅ Permission response [${sessionId}]: ${result.behavior}`);

    const response: ACPControlResponse = {
      type: 'control_response',
      response: {
        request_id: requestId,
        subtype: 'success',
        response: result
      }
    };

    this.writeToProcess(session, response);
    session.status = 'running';
  }

  /**
   * Send control response to Claude
   */
  private sendControlResponse(
    sessionId: string,
    requestId: string,
    response: any
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const controlResponse: ACPControlResponse = {
      type: 'control_response',
      response
    };

    this.writeToProcess(session, controlResponse);
  }

  /**
   * Send user message to Claude
   */
  async sendMessage(sessionId: string, content: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process) {
      throw new Error(`Session ${sessionId} not found or not started`);
    }

    console.log(`📤 Sending message to Claude [${sessionId}]`);

    const userMessage: ACPUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: content
      }
    };

    this.writeToProcess(session, userMessage);
    session.status = 'running';
  }

  /**
   * Write JSON message to Claude stdin
   */
  private writeToProcess(session: ClaudeSession, message: ACPMessage): void {
    if (!session.process || !session.process.stdin) {
      console.error(`❌ Cannot write to session ${session.sessionId}: stdin not available`);
      return;
    }

    const json = JSON.stringify(message);
    session.process.stdin.write(json + '\n');
  }

  /**
   * Stop a session
   */
  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.log(`🛑 Stopping session: ${sessionId}`);

    if (session.process) {
      session.process.kill('SIGTERM');
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ClaudeSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Cleanup all sessions
   */
  cleanup(): void {
    console.log('🧹 Cleaning up all Claude sessions');
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId);
    }
  }
}
