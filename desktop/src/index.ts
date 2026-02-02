/**
 * Desktop Client Main Entry
 * Coordinates Claude CLI, WebSocket communication, and session sync
 */

import { v4 as uuidv4 } from 'uuid';
import { loadConfig, validateConfig, printConfig } from './config.js';
import { ClaudeManager } from './claudeManager.js';
import { WSClient } from './wsClient.js';
import { SessionSync } from './sessionSync.js';
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
    keyPair ? Buffer.from(keyPair.publicKey).toString('base64') : undefined
  );

  // Create Claude manager
  const claudeManager = new ClaudeManager(
    config.claudePath!,
    // onOutput callback
    (sessionId, content) => {
      console.log(`📤 [${sessionId}] Output chunk (${content.length} chars)`);

      // Encrypt if enabled
      let encrypted = false;
      let encryptedContent = content;

      // Encryption temporarily disabled
      // if (keyPair && serverPublicKey) {
      //   try {
      //     const encryptedData = encrypt(content, serverPublicKey, keyPair.privateKey);
      //     encryptedContent = JSON.stringify(encryptedData);
      //     encrypted = true;
      //   } catch (e) {
      //     console.error('❌ Encryption failed:', e);
      //   }
      // }

      // Send to server
      wsClient.sendOutputChunk(sessionId, encryptedContent, encrypted);

      // Store in database
      if (sessionSync.isEnabled()) {
        const message: SessionMessage = {
          id: uuidv4(),
          sessionId,
          role: 'assistant',
          content: encryptedContent,
          encrypted,
          timestamp: Date.now()
        };
        sessionSync.storeMessage(message);
      }
    },
    // onPermissionRequest callback
    (request: PermissionRequest) => {
      console.log(`🔐 Permission request: ${request.toolName}`);
      wsClient.sendPermissionRequest(
        request.sessionId,
        request.id,
        request.toolName,
        request.input
      );
    },
    // onSessionEnd callback
    (sessionId, result) => {
      console.log(`✅ Session ended: ${sessionId}`, result);

      // 通知Server响应已完成
      wsClient.send({
        type: 'response-done',
        sessionId: sessionId
      });
    }
  );

  // Connect to server
  await wsClient.connect();

  // Start auto-updater after successful connection
  autoUpdater.start();

  // Handle user messages from server
  wsClient.on('user-message', async (data: UserMessageFromServer['data']) => {
    console.log(`📨 Received user message for session: ${data.sessionId}`);

    let content = data.content;

    // Decrypt if needed
    if (data.encrypted && keyPair) {
      try {
        // Parse encrypted data
        const encryptedData = JSON.parse(data.content);
        // Decrypt (would need sender's public key from data.publicKey)
        // For now, assume server forwards plaintext
        // content = decrypt(encryptedData, senderPublicKey, keyPair.privateKey);
      } catch (e) {
        console.error('❌ Decryption failed:', e);
      }
    }

    // Store in database
    if (sessionSync.isEnabled()) {
      await sessionSync.storeSession(
        data.sessionId,
        config.deviceId,
        data.projectPath || config.workDir!
      );

      const message: SessionMessage = {
        id: uuidv4(),
        sessionId: data.sessionId,
        role: 'user',
        content,
        encrypted: data.encrypted || false,
        timestamp: Date.now()
      };
      await sessionSync.storeMessage(message);
    }

    // Start or send to Claude session
    try {
      const projectPath = data.projectPath || config.workDir!;

      // Validate path is within root directory
      const validation = pathValidator.validate(projectPath);
      if (!validation.valid) {
        console.error(`❌ Path validation failed: ${validation.error}`);
        wsClient.send({
          type: 'error',
          sessionId: data.sessionId,
          error: validation.error
        });
        return;
      }

      console.log(`✅ Path validated: ${validation.resolved}`);

      await claudeManager.startSession(
        data.sessionId,
        validation.resolved!,
        content
      );
    } catch (e) {
      console.error('❌ Failed to start Claude session:', e);
    }
  });

  // Handle project change requests from server
  wsClient.on('change-project', async (data: any) => {
    console.log(`🔄 Change project request: ${data.projectPath}`);

    try {
      // Validate the project path
      const validation = pathValidator.validate(data.projectPath);
      if (!validation.valid) {
        console.error(`❌ Path validation failed: ${validation.error}`);
        wsClient.send({
          type: 'error',
          sessionId: data.sessionId,
          error: validation.error
        });
        return;
      }

      // Load history for this project
      const history = await historyLoader.loadHistory(data.projectPath, 50);
      console.log(`📜 Loaded ${history.length} history messages for ${data.projectPath}`);

      // Convert to Claude Code session format
      const formattedHistory = history.map(msg => ({
        type: msg.role === 'user' ? 'user' : 'assistant',
        message: {
          role: msg.role,
          content: msg.content
        },
        timestamp: msg.timestamp
      }));

      // Send projectChanged confirmation with history
      wsClient.send({
        type: 'project-changed',
        sessionId: data.sessionId,
        projectPath: data.projectPath,
        message: `切换到项目: ${data.projectPath}`,
        history: formattedHistory,
        hasMoreHistory: false
      });
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

  // Handle permission responses from server
  wsClient.on('permission-response', async (data: PermissionResponseFromServer['data']) => {
    console.log(`✅ Permission response: ${data.approved ? 'APPROVED' : 'DENIED'}`);

    const result = data.approved
      ? { behavior: 'allow' as const, updatedInput: {} }
      : { behavior: 'deny' as const, message: data.reason || 'User denied' };

    // Send response to Claude
    // Note: We need to track which session this belongs to
    // For now, find the session from active sessions
    const sessions = claudeManager.getActiveSessions();
    if (sessions.length > 0) {
      await claudeManager.respondToPermission(
        sessions[0].sessionId,
        data.id,
        result
      );
    }
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n👋 Shutting down...');

    autoUpdater.stop();
    claudeManager.cleanup();
    wsClient.disconnect();
    await sessionSync.close();

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
