/**
 * Desktop Client Main Entry
 * Coordinates Claude CLI, WebSocket communication, and session sync
 */

import { v4 as uuidv4 } from 'uuid';
import { loadConfig, validateConfig, printConfig } from './config.js';
import { ClaudeProcessPool } from './claudeProcessPool.js';
import { WSClient } from './wsClient.js';
import { SessionSync } from './sessionSync.js';
import { SessionWriter } from './sessionWriter.js';
import { PathValidator } from './pathValidator.js';
import { AutoUpdater } from './autoUpdater.js';
import { COMPILED_VERSION } from './version.js';
import { HistoryLoader } from './historyLoader.js';
// Temporarily disabled for testing
// import {
//   generateKeyPair,
//   keyPairToStrings,
//   keyPairFromStrings,
//   encrypt,
//   decrypt
// } from './encryption.js';
import type {
  UserMessageFromServer,
  PermissionResponseFromServer,
  PermissionRequest,
  SessionMessage,
  KeyPair
} from './types.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

async function main() {
  console.log('🚀 Claude Code Desktop Client Starting...\n');
  console.log(`📦 Version: ${COMPILED_VERSION}\n`);

  // Load configuration
  const config = loadConfig();
  const validation = validateConfig(config);

  if (!validation.valid) {
    console.error('❌ Configuration errors:');
    validation.errors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }

  printConfig(config);
  console.log();

  // Initialize encryption keys
  let keyPair: any | undefined; // KeyPair | undefined;
  let serverPublicKey: Uint8Array | undefined;

  if (config.encryption?.enabled) {
    console.log('⚠️  Encryption temporarily disabled for testing');
    // Encryption code disabled
  }

  // Initialize session sync
  const sessionSync = new SessionSync(config);
  if (sessionSync.isEnabled()) {
    await sessionSync.initialize();
  }

  // Create path validator
  const pathValidator = new PathValidator(config.workDir!);
  console.log(`📂 Root directory: ${pathValidator.getRootDir()}`);

  // Create history loader
  const historyLoader = new HistoryLoader();

  // Create session writer (for persisting messages to local .jsonl files)
  const sessionWriter = new SessionWriter();

  // Initialize auto-updater
  const autoUpdater = new AutoUpdater({
    checkInterval: 60 * 1000, // Check every 60 seconds
    gitRemote: 'origin',
    gitBranch: 'main',
    autoRestart: true
  });

  // Create WebSocket client
  const wsClient = new WSClient(
    config.serverUrl,
    config.deviceId,
    config.displayName,
    keyPair ? Buffer.from(keyPair.publicKey).toString('base64') : undefined
  );

  // Claude Process Pool (manages multiple Claude processes)
  const processPool = new ClaudeProcessPool(3); // Max 3 concurrent processes
  let currentSessionId: string | null = null;
  let currentProjectPath: string | null = null;
  let currentClaudeSessionId: string | null = null; // Claude's internal session ID
  let lastMessageUuid: string | null = null; // Track last message UUID for linking

  // ⭐ Store pending permission requests (maps our requestId to Claude's control_request_id)
  const pendingPermissions = new Map<string, {
    controlRequestId: string;  // Claude CLI's request_id
    toolName: string;
    input: any;
  }>();

  // Handle output from Claude processes
  processPool.on('output', (projectPath, chunk) => {
    if (!currentSessionId) {
      console.log(`⚠️  No active session, skipping output`);
      return;
    }

    console.log(`📤 [Output] ${chunk.content.substring(0, 60)}...`);

    // Note: Permission detection is now handled by control_request event
    // Old text-based detection is kept as fallback (commented out)
    // const content = chunk.content.toLowerCase();
    // const looksLikePermission = content.includes('proceed?') || ...

    // Send as normal output
    wsClient.sendOutputChunk(currentSessionId, chunk.content, false);

    // Store in database
    if (sessionSync.isEnabled()) {
      const dbMessage: SessionMessage = {
        id: uuidv4(),
        sessionId: currentSessionId,
        role: 'assistant',
        content: chunk.content,
        encrypted: false,
        timestamp: chunk.timestamp
      };
      sessionSync.storeMessage(dbMessage);
    }

    // Write to local session file
    if (currentProjectPath && currentClaudeSessionId) {
      const assistantUuid = sessionWriter.writeAssistantMessage(currentProjectPath, currentClaudeSessionId, chunk.content, lastMessageUuid || undefined);
      lastMessageUuid = assistantUuid; // Save for next message to link to
    }
  });

  // ⭐ Handle control_request from Claude CLI (standard permission protocol)
  processPool.on('control_request', (projectPath, controlRequest) => {
    if (!currentSessionId) {
      console.log(`⚠️  [ControlRequest] No active session, denying by default`);
      const currentProcess = processPool.getCurrentProcess();
      if (currentProcess) {
        currentProcess.sendControlResponse(controlRequest.request_id, false);
      }
      return;
    }

    console.log(`🔐 [ControlRequest] Tool: ${controlRequest.request.tool_name}`);
    console.log(`🔐 [ControlRequest] Claude Request ID: ${controlRequest.request_id}`);
    console.log(`🔐 [ControlRequest] Input:`, JSON.stringify(controlRequest.request.input || {}).substring(0, 200));

    const requestId = uuidv4();  // Our request ID for Mobile communication

    // Store the mapping between our requestId and Claude's control_request_id
    pendingPermissions.set(requestId, {
      controlRequestId: controlRequest.request_id,
      toolName: controlRequest.request.tool_name,
      input: controlRequest.request.input
    });

    // Send permission request to Mobile via Server
    wsClient.send({
      type: 'permission-request',
      sessionId: currentSessionId,
      data: {
        requestId,
        toolName: controlRequest.request.tool_name,  // ⭐ Real tool name (e.g., "Bash", "Edit")
        input: controlRequest.request.input          // ⭐ Structured input (e.g., {command: "ls"})
      }
    });

    // Timeout handling (30 seconds)
    setTimeout(() => {
      if (pendingPermissions.has(requestId)) {
        console.log(`⏱️ [ControlRequest] Timeout for request ${requestId}, auto-denying`);
        const currentProcess = processPool.getCurrentProcess();
        if (currentProcess) {
          const pending = pendingPermissions.get(requestId);
          if (pending) {
            currentProcess.sendControlResponse(pending.controlRequestId, false);
          }
        }
        pendingPermissions.delete(requestId);
      }
    }, 30000);
  });

  // Connect to server
  await wsClient.connect();

  // Start auto-updater after successful connection (disabled in dev mode)
  // autoUpdater.start();

  // Handle user messages from mobile (write to Claude's stdin)
  wsClient.on('user-message', async (data: UserMessageFromServer['data']) => {
    console.log(`📥 [UserMessage] From mobile: ${data.content?.substring(0, 50)}...`);

    const currentProcess = processPool.getCurrentProcess();

    if (!currentProcess || !currentProcess.isRunning()) {
      console.error('❌ [UserMessage] No active Claude process');
      return;
    }

    // Write to Claude's stdin
    currentProcess.writeInput(data.content);

    // Store in database
    if (sessionSync.isEnabled() && currentSessionId) {
      const dbMessage: SessionMessage = {
        id: uuidv4(),
        sessionId: currentSessionId,
        role: 'user',
        content: data.content,
        encrypted: false,
        timestamp: Date.now()
      };
      sessionSync.storeMessage(dbMessage);
    }

    // Write to local session file
    if (currentProjectPath && currentClaudeSessionId) {
      const userUuid = sessionWriter.writeUserMessage(currentProjectPath, currentClaudeSessionId, data.content, lastMessageUuid || undefined);
      lastMessageUuid = userUuid; // Save for next message to link to
    }
  });

  // Handle project change requests from server
  wsClient.on('change-project', async (data: any) => {
    console.log(`🔄 [ChangeProject] Request: ${data.projectPath}`);

    try {
      // Validate the project path
      const validation = pathValidator.validate(data.projectPath);
      if (!validation.valid) {
        console.error(`❌ [ChangeProject] Path validation failed: ${validation.error}`);
        wsClient.send({
          type: 'error',
          sessionId: data.sessionId,
          error: validation.error
        });
        return;
      }

      console.log(`✅ [ChangeProject] Path validated: ${validation.resolved}`);

      const projectPath = validation.resolved!;
      currentSessionId = data.sessionId;
      currentProjectPath = projectPath; // Track current project path

      // Load history for this project (use resolved path, not original path)
      console.log(`📜 [ChangeProject] Loading history from path: ${projectPath}`);
      const history = await historyLoader.loadHistory(projectPath, 200);
      console.log(`📜 [ChangeProject] Loaded ${history.length} history messages`);

      // Only send the last 20 messages to mobile (for initial load)
      const recentHistory = history.slice(-20);
      console.log(`📱 [ChangeProject] Sending last ${recentHistory.length} messages to mobile`);

      // Convert to Claude Code session format
      const formattedHistory = recentHistory.map(msg => ({
        type: msg.role === 'user' ? 'user' : 'assistant',
        message: {
          role: msg.role,
          content: msg.content
        },
        timestamp: msg.timestamp
      }));

      // Get or create Claude process for this project
      // ProcessPool will automatically reuse if already running
      await processPool.getOrCreateProcess(projectPath, {
        claudePath: config.claudePath!,
        apiConfig: {
          baseUrl: 'https://api.302.ai',
          authToken: 'sk-wHTe9eEipcthzG6Zv184GeKUbSr7HWDoBKAQuVc2foF9kJGh',
          model: 'glm-4.7-coding-preview'
        }
      });

      // Get the Claude session ID for writing messages
      currentClaudeSessionId = processPool.getCurrentClaudeSessionId();
      console.log(`📝 [ChangeProject] Using Claude session: ${currentClaudeSessionId}`);

      // Log pool stats
      const stats = processPool.getStats();
      console.log(`📊 [ProcessPool] Stats:`, JSON.stringify(stats, null, 2));

      // Send projectChanged confirmation with history
      console.log(`✅ [ChangeProject] Sending confirmation to mobile...`);
      const hasHistory = formattedHistory.length > 0;
      wsClient.send({
        type: 'project-changed',
        sessionId: data.sessionId,
        projectPath: data.projectPath,
        message: hasHistory ? `切换到项目: ${data.projectPath}` : `切换到项目: ${data.projectPath}（无历史记录）`,
        history: formattedHistory,
        hasMoreHistory: history.length > 20  // If we loaded more than 20, there might be more
      });
      console.log(`📱 Project-changed message sent!`);
    } catch (error) {
      console.error('❌ Failed to change project:', error);
      wsClient.send({
        type: 'error',
        sessionId: data.sessionId,
        error: 'Failed to change project'
      });
    }
  });

  // Handle list projects requests from server
  wsClient.on('list-projects', async (data: any) => {
    console.log(`📋 List projects request`);

    try {
      const projects = await pathValidator.listProjects();
      console.log(`Found ${projects.length} projects`);

      // Send back to server
      wsClient.send({
        type: 'projects-list',
        sessionId: data.sessionId,
        projects: projects.map(p => ({
          name: p.name,
          path: p.path,
          hasClaudeDir: p.hasClaudeDir
        }))
      });
    } catch (error) {
      console.error('❌ Failed to list projects:', error);
      wsClient.send({
        type: 'error',
        sessionId: data.sessionId,
        error: 'Failed to list projects'
      });
    }
  });

  // Handle permission responses from server (mobile user answered permission request)
  wsClient.on('permission-response', async (data: PermissionResponseFromServer['data']) => {
    console.log(`✅ [PermissionResponse] Response: ${data.approved ? 'APPROVED' : 'DENIED'}`);
    console.log(`✅ [PermissionResponse] Request ID: ${data.id}`);

    // Look up the pending permission request
    const pending = pendingPermissions.get(data.id);
    if (!pending) {
      console.error(`❌ [PermissionResponse] Unknown requestId: ${data.id}`);
      return;
    }

    console.log(`✅ [PermissionResponse] Found pending request for tool: ${pending.toolName}`);
    console.log(`✅ [PermissionResponse] Claude Control Request ID: ${pending.controlRequestId}`);

    const currentProcess = processPool.getCurrentProcess();

    if (!currentProcess || !currentProcess.isRunning()) {
      console.error('❌ [PermissionResponse] No active Claude process');
      pendingPermissions.delete(data.id);
      return;
    }

    // ⭐ Send control_response to Claude CLI (using standard protocol)
    currentProcess.sendControlResponse(pending.controlRequestId, data.approved);

    // Clean up
    pendingPermissions.delete(data.id);
  });

  // Handle user input from mobile (for permission/confirmation prompts)
  wsClient.on('user-input', async (data: any) => {
    console.log(`⌨️  [User Input] Received from mobile: ${data.input}`);

    const currentProcess = processPool.getCurrentProcess();

    if (!currentProcess || !currentProcess.isRunning()) {
      console.error('❌ [User Input] No active Claude process');
      return;
    }

    // Write input to Claude's stdin
    currentProcess.writeInput(data.input);
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n👋 Desktop daemon shutting down...');

    autoUpdater.stop();

    // Stop all Claude processes
    processPool.stopAll();

    wsClient.disconnect();
    await sessionSync.close();

    console.log('✅ Cleanup complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('\n✅ Desktop client ready!');
  console.log('   Waiting for messages from mobile app...\n');
}

// Run main
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
