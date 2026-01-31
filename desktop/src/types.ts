/**
 * Type definitions for Desktop Client
 * Handles messages between Mobile App, Server, and Claude CLI
 */

// ============================================================================
// Claude ACP Protocol Types
// ============================================================================

export interface ACPMessage {
  type: string;
  [key: string]: unknown;
}

export interface ACPUserMessage extends ACPMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | Array<{
      type: string;
      text?: string;
      tool_use_id?: string;
      content?: unknown;
      [key: string]: unknown;
    }>;
  };
}

export interface ACPAssistantMessage extends ACPMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      [key: string]: unknown;
    }>;
  };
}

export interface ACPControlRequest extends ACPMessage {
  type: 'control_request';
  request_id: string;
  request: {
    subtype: 'can_use_tool' | 'interrupt';
    tool_name?: string;
    input?: unknown;
  };
}

export interface ACPControlResponse extends ACPMessage {
  type: 'control_response';
  response: {
    request_id: string;
    subtype: 'success' | 'error';
    response?: PermissionResult;
    error?: string;
  };
}

export interface ACPResultMessage extends ACPMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  result?: string;
  num_turns: number;
  session_id: string;
}

// ============================================================================
// Permission Types
// ============================================================================

export type PermissionResult = {
  behavior: 'allow';
  updatedInput: Record<string, unknown>;
} | {
  behavior: 'deny';
  message: string;
};

export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  input: unknown;
  createdAt: number;
}

export interface PermissionResponse {
  id: string;
  approved: boolean;
  reason?: string;
  mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowTools?: string[];
}

// ============================================================================
// WebSocket Message Types (Desktop ↔ Server)
// ============================================================================

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

// Desktop → Server
export interface RegisterMessage extends WSMessage {
  type: 'register';
  deviceId: string;
  deviceType: 'desktop';
  publicKey?: string; // For E2E encryption
}

export interface OutputChunkMessage extends WSMessage {
  type: 'output-chunk';
  sessionId: string;
  data: {
    content: string;
    encrypted?: boolean;
  };
}

export interface PermissionRequestMessage extends WSMessage {
  type: 'permission-request';
  sessionId: string;
  data: {
    requestId: string;
    toolName: string;
    input: unknown;
  };
}

export interface StatusMessage extends WSMessage {
  type: 'status';
  sessionId: string;
  data: {
    status: 'idle' | 'running' | 'waiting-permission';
  };
}

// Server → Desktop
export interface UserMessageFromServer extends WSMessage {
  type: 'user-message';
  data: {
    sessionId: string;
    content: string;
    projectPath?: string;
    encrypted?: boolean;
  };
}

export interface PermissionResponseFromServer extends WSMessage {
  type: 'permission-response';
  data: PermissionResponse;
}

export interface SwitchModeMessage extends WSMessage {
  type: 'switch-mode';
  data: {
    mode: 'local' | 'remote';
  };
}

// ============================================================================
// Session Types
// ============================================================================

export interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  process: any; // ChildProcess
  status: 'idle' | 'running' | 'waiting-permission' | 'stopped';
  createdAt: number;
  lastActivity: number;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  encrypted: boolean;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface DesktopConfig {
  // Server connection
  serverUrl: string;
  deviceId: string;

  // Claude CLI
  claudePath?: string;
  workDir?: string;

  // Database
  database?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };

  // Encryption
  encryption?: {
    enabled: boolean;
    privateKey?: string;
    publicKey?: string;
  };
}

// ============================================================================
// Encryption Types
// ============================================================================

export interface EncryptedData {
  nonce: string; // Base64 encoded
  ciphertext: string; // Base64 encoded
  publicKey?: string; // Sender's public key (for key exchange)
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}
