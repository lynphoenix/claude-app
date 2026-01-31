/**
 * Desktop Client Main Entry
 * Coordinates Claude CLI, WebSocket communication, and session sync
 */

import { v4 as uuidv4 } from 'uuid';
import { loadConfig, validateConfig, printConfig } from './config.js';
import { ClaudeManager } from './claudeManager.js';
import { WSClient } from './wsClient.js';
import { SessionSync } from './sessionSync.js';
import {
  generateKeyPair,
  keyPairToStrings,
  keyPairFromStrings,
  encrypt,
  decrypt
} from './encryption.js';
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
  let keyPair: KeyPair | undefined;
  let serverPublicKey: Uint8Array | undefined;

  if (config.encryption?.enabled) {
    console.log('🔐 Initializing encryption...');

    const keyPath = join(homedir(), '.claude-desktop-keys.json');

    if (existsSync(keyPath)) {
      console.log('   Loading existing keys from:', keyPath);
      const keysJson = JSON.parse(readFileSync(keyPath, 'utf-8'));
      keyPair = keyPairFromStrings(keysJson);
    } else if (config.encryption.privateKey && config.encryption.publicKey) {
      console.log('   Loading keys from config');
      keyPair = keyPairFromStrings({
        privateKey: config.encryption.privateKey,
        publicKey: config.encryption.publicKey
      });
    } else {
      console.log('   Generating new key pair...');
      keyPair = generateKeyPair();
      const keysString = keyPairToStrings(keyPair);
      writeFileSync(keyPath, JSON.stringify(keysString, null, 2));
      console.log('   Keys saved to:', keyPath);
      console.log('   Public key:', keysString.publicKey);
    }
  }

  // Initialize session sync
  const sessionSync = new SessionSync(config);
  if (sessionSync.isEnabled()) {
    await sessionSync.initialize();
  }

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

      if (keyPair && serverPublicKey) {
        try {
          const encryptedData = encrypt(content, serverPublicKey, keyPair.privateKey);
          encryptedContent = JSON.stringify(encryptedData);
          encrypted = true;
        } catch (e) {
          console.error('❌ Encryption failed:', e);
        }
      }

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
    }
  );

  // Connect to server
  await wsClient.connect();

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
      await claudeManager.startSession(
        data.sessionId,
        data.projectPath || config.workDir!,
        content
      );
    } catch (e) {
      console.error('❌ Failed to start Claude session:', e);
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
