/**
 * Session Sync
 * Handles session history synchronization with server database
 */

import { Pool, type PoolClient } from 'pg';
import type { SessionMessage, DesktopConfig } from './types.js';

export class SessionSync {
  private pool: Pool | null = null;
  private enabled: boolean = false;

  constructor(config: DesktopConfig) {
    if (config.database) {
      this.pool = new Pool({
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
        max: 5,
        idleTimeoutMillis: 30000
      });

      this.enabled = true;
      console.log('📊 Session sync enabled');
    } else {
      console.log('⚠️  Session sync disabled (no database configured)');
    }
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();

      // Create sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id VARCHAR(255) PRIMARY KEY,
          device_id VARCHAR(255) NOT NULL,
          project_path TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB
        )
      `);

      // Create messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id VARCHAR(255) PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          role VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          encrypted BOOLEAN DEFAULT FALSE,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      `);

      client.release();
      console.log('✅ Database schema initialized');
    } catch (e) {
      console.error('❌ Failed to initialize database:', e);
      throw e;
    }
  }

  /**
   * Store session metadata
   */
  async storeSession(
    sessionId: string,
    deviceId: string,
    projectPath: string
  ): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.query(
        `INSERT INTO sessions (id, device_id, project_path)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
         SET last_activity = CURRENT_TIMESTAMP`,
        [sessionId, deviceId, projectPath]
      );
    } catch (e) {
      console.error('❌ Failed to store session:', e);
    }
  }

  /**
   * Store message
   */
  async storeMessage(message: SessionMessage): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.query(
        `INSERT INTO messages (id, session_id, role, content, encrypted, timestamp)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision / 1000))
         ON CONFLICT (id) DO NOTHING`,
        [
          message.id,
          message.sessionId,
          message.role,
          message.content,
          message.encrypted,
          message.timestamp
        ]
      );

      // Update session last_activity
      await this.pool.query(
        `UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = $1`,
        [message.sessionId]
      );
    } catch (e) {
      console.error('❌ Failed to store message:', e);
    }
  }

  /**
   * Get session history
   */
  async getSessionHistory(sessionId: string, limit: number = 100): Promise<SessionMessage[]> {
    if (!this.pool) return [];

    try {
      const result = await this.pool.query(
        `SELECT id, session_id, role, content, encrypted,
                EXTRACT(EPOCH FROM timestamp) * 1000 as timestamp
         FROM messages
         WHERE session_id = $1
         ORDER BY timestamp ASC
         LIMIT $2`,
        [sessionId, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        encrypted: row.encrypted,
        timestamp: parseInt(row.timestamp)
      }));
    } catch (e) {
      console.error('❌ Failed to get session history:', e);
      return [];
    }
  }

  /**
   * Get all sessions for a device
   */
  async getDeviceSessions(deviceId: string, limit: number = 50): Promise<any[]> {
    if (!this.pool) return [];

    try {
      const result = await this.pool.query(
        `SELECT id, device_id, project_path,
                created_at, last_activity, metadata
         FROM sessions
         WHERE device_id = $1
         ORDER BY last_activity DESC
         LIMIT $2`,
        [deviceId, limit]
      );

      return result.rows;
    } catch (e) {
      console.error('❌ Failed to get device sessions:', e);
      return [];
    }
  }

  /**
   * Delete old sessions
   */
  async cleanupOldSessions(daysToKeep: number = 30): Promise<void> {
    if (!this.pool) return;

    try {
      const result = await this.pool.query(
        `DELETE FROM sessions
         WHERE last_activity < NOW() - INTERVAL '${daysToKeep} days'`
      );

      console.log(`🧹 Cleaned up ${result.rowCount} old sessions`);
    } catch (e) {
      console.error('❌ Failed to cleanup old sessions:', e);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('👋 Database connection closed');
    }
  }

  /**
   * Check if sync is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
