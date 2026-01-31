/**
 * Configuration Management
 * Loads config from environment variables and .env file
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, hostname } from 'os';
import type { DesktopConfig } from './types.js';

// Load .env file
dotenvConfig();

/**
 * Get default Claude Code path
 */
function getDefaultClaudePath(): string {
  // Try common locations
  const commonPaths = [
    join(homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Fall back to 'claude' in PATH
  return 'claude';
}

/**
 * Get default device ID
 */
function getDefaultDeviceId(): string {
  return `desktop-${hostname()}`;
}

/**
 * Load configuration from environment
 */
export function loadConfig(): DesktopConfig {
  const config: DesktopConfig = {
    // Server connection
    serverUrl: process.env.SERVER_URL || 'ws://47.99.75.219:3001/ws',
    deviceId: process.env.DEVICE_ID || getDefaultDeviceId(),

    // Claude CLI
    claudePath: process.env.CLAUDE_PATH || getDefaultClaudePath(),
    workDir: process.env.WORK_DIR || process.cwd(),

    // Database (optional)
    database: process.env.DB_HOST ? {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'claude_mobile',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    } : undefined,

    // Encryption (optional)
    encryption: {
      enabled: process.env.ENCRYPTION_ENABLED !== 'false',
      privateKey: process.env.ENCRYPTION_PRIVATE_KEY,
      publicKey: process.env.ENCRYPTION_PUBLIC_KEY
    }
  };

  return config;
}

/**
 * Validate configuration
 */
export function validateConfig(config: DesktopConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.serverUrl) {
    errors.push('SERVER_URL is required');
  }

  if (!config.deviceId) {
    errors.push('DEVICE_ID is required');
  }

  if (config.claudePath && !existsSync(config.claudePath) && config.claudePath !== 'claude') {
    errors.push(`Claude CLI not found at: ${config.claudePath}`);
  }

  if (config.database) {
    if (!config.database.host) {
      errors.push('DB_HOST is required when database is configured');
    }
    if (!config.database.password) {
      errors.push('DB_PASSWORD is required when database is configured');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Print configuration (safe - hides sensitive data)
 */
export function printConfig(config: DesktopConfig): void {
  console.log('📋 Desktop Client Configuration:');
  console.log(`   Server URL: ${config.serverUrl}`);
  console.log(`   Device ID: ${config.deviceId}`);
  console.log(`   Claude Path: ${config.claudePath}`);
  console.log(`   Work Directory: ${config.workDir}`);
  console.log(`   Database: ${config.database ? 'Enabled' : 'Disabled'}`);
  console.log(`   Encryption: ${config.encryption?.enabled ? 'Enabled' : 'Disabled'}`);
}
