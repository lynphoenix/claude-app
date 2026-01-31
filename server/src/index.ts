/**
 * Claude Code Server - Message Router
 * Routes messages between Mobile App and Desktop Client
 * Does NOT execute Claude - that's done on Desktop Client
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { DeviceManager } from './deviceManager.js';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Device statistics endpoint
app.get('/api/stats', (req, res) => {
  const stats = deviceManager.getStats();
  res.json(stats);
});

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Create device manager
const deviceManager = new DeviceManager();

wss.on('connection', (ws: WebSocket) => {
  let deviceId: string | null = null;
  let deviceType: 'mobile' | 'desktop' | null = null;

  console.log('🔌 New WebSocket connection');

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Message from ${deviceId || 'unknown'}: ${message.type}`);

      // Update activity
      if (deviceId) {
        deviceManager.updateActivity(deviceId);
      }

      switch (message.type) {
        // ================================================================
        // Device Registration
        // ================================================================
        case 'register':
          if (!message.deviceId || !message.deviceType) {
            console.error('❌ Invalid registration: missing deviceId or deviceType');
            break;
          }

          deviceId = message.deviceId as string;
          deviceType = message.deviceType as 'mobile' | 'desktop';

          deviceManager.registerDevice(
            deviceId,
            deviceType,
            ws,
            message.publicKey
          );

          ws.send(JSON.stringify({
            type: 'registered',
            deviceId,
            message: 'Device registered successfully'
          }));
          break;

        // ================================================================
        // Session Initialization (from Mobile)
        // ================================================================
        case 'init':
          if (!deviceId) {
            console.error('❌ Device not registered');
            break;
          }

          const sessionId = message.sessionId;
          deviceManager.setDeviceSession(deviceId, sessionId);

          ws.send(JSON.stringify({
            type: 'ready',
            sessionId
          }));
          break;

        // ================================================================
        // User Message (Mobile → Desktop)
        // ================================================================
        case 'message':
          if (!deviceId) {
            console.error('❌ Device not registered');
            break;
          }

          console.log(`📤 Routing message to desktop (session: ${message.sessionId})`);

          const sent = deviceManager.sendToDesktop(message.sessionId, {
            type: 'user-message',
            data: {
              sessionId: message.sessionId,
              content: message.content,
              projectPath: message.projectPath,
              encrypted: message.encrypted || false
            }
          });

          if (sent) {
            // Acknowledge receipt
            ws.send(JSON.stringify({
              type: 'messageAck',
              id: message.id
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'No desktop client available'
            }));
          }
          break;

        // ================================================================
        // Output Chunk (Desktop → Mobile)
        // ================================================================
        case 'output-chunk':
          if (!deviceId) {
            console.error('❌ Device not registered');
            break;
          }

          console.log(`📤 Broadcasting output to mobiles (session: ${message.sessionId})`);

          deviceManager.broadcastToMobiles(message.sessionId, {
            type: 'responseChunk',
            content: message.data.content,
            encrypted: message.data.encrypted || false,
            messageId: message.messageId
          });
          break;

        // ================================================================
        // Permission Request (Desktop → Mobile)
        // ================================================================
        case 'permission-request':
          if (!deviceId) {
            console.error('❌ Device not registered');
            break;
          }

          console.log(`🔐 Forwarding permission request to mobiles (session: ${message.sessionId})`);

          deviceManager.broadcastToMobiles(message.sessionId, {
            type: 'permissionRequest',
            requestId: message.data.requestId,
            toolName: message.data.toolName,
            input: message.data.input
          });
          break;

        // ================================================================
        // Permission Response (Mobile → Desktop)
        // ================================================================
        case 'permission-response':
          if (!deviceId) {
            console.error('❌ Device not registered');
            break;
          }

          console.log(`✅ Forwarding permission response to desktop (session: ${message.sessionId})`);

          deviceManager.sendToDesktop(message.sessionId, {
            type: 'permission-response',
            data: {
              id: message.requestId,
              approved: message.approved,
              reason: message.reason,
              mode: message.mode,
              allowTools: message.allowTools
            }
          });
          break;

        // ================================================================
        // Status Update (Desktop → Mobile)
        // ================================================================
        case 'status':
          if (!deviceId) {
            console.error('❌ Device not registered');
            break;
          }

          console.log(`📊 Broadcasting status update (session: ${message.sessionId})`);

          deviceManager.broadcastToMobiles(message.sessionId, {
            type: 'status',
            status: message.data.status
          });
          break;

        // ================================================================
        // Device Switching
        // ================================================================
        case 'switch-mode':
          if (!deviceId) {
            console.error('❌ Device not registered');
            break;
          }

          console.log(`🔄 Mode switch request: ${message.mode}`);

          // Broadcast mode change to all devices in session
          const device = deviceManager.getDevice(deviceId);
          if (device && device.sessionId) {
            deviceManager.broadcastToSession(
              device.sessionId,
              {
                type: 'switch-mode',
                data: {
                  mode: message.mode,
                  deviceId: deviceId
                }
              },
              deviceId // Exclude sender
            );
          }
          break;

        // ================================================================
        // Heartbeat
        // ================================================================
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        // ================================================================
        // Unknown Message Type
        // ================================================================
        default:
          console.log(`⚠️  Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Internal server error'
      }));
    }
  });

  ws.on('close', () => {
    console.log(`🔌 Connection closed: ${deviceId || 'unknown'}`);
    if (deviceId) {
      deviceManager.removeDevice(deviceId);
    }
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error (${deviceId || 'unknown'}):`, error);
  });
});

// Periodic cleanup of inactive devices
setInterval(() => {
  deviceManager.cleanupInactive(300000); // 5 minutes
}, 60000); // Check every minute

// Start server
server.listen(PORT, () => {
  console.log(`\n🚀 Claude Code Server (Message Router)`);
  console.log(`   Port: ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Stats: http://localhost:${PORT}/api/stats`);
  console.log();
  console.log(`✅ Server is running and ready to route messages\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
