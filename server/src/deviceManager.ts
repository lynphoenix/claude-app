/**
 * Device Manager
 * Manages connected devices (mobile and desktop) and message routing
 */

import { WebSocket } from 'ws';

export interface Device {
  id: string;
  type: 'mobile' | 'desktop';
  ws: WebSocket;
  sessionId: string | null;
  publicKey?: string; // For E2E encryption
  lastActive: number;
  metadata?: {
    platform?: string;
    version?: string;
  };
}

export class DeviceManager {
  private devices = new Map<string, Device>();

  /**
   * Register a device
   */
  registerDevice(
    deviceId: string,
    type: 'mobile' | 'desktop',
    ws: WebSocket,
    publicKey?: string
  ): void {
    const device: Device = {
      id: deviceId,
      type,
      ws,
      sessionId: null,
      publicKey,
      lastActive: Date.now()
    };

    this.devices.set(deviceId, device);
    console.log(`📱 Device registered: ${deviceId} (${type})`);
  }

  /**
   * Update device last active time
   */
  updateActivity(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastActive = Date.now();
    }
  }

  /**
   * Set device session
   */
  setDeviceSession(deviceId: string, sessionId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.sessionId = sessionId;
      console.log(`🔗 Device ${deviceId} bound to session ${sessionId}`);
    }
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get all devices in a session
   */
  getDevicesInSession(sessionId: string): Device[] {
    return Array.from(this.devices.values()).filter(
      device => device.sessionId === sessionId
    );
  }

  /**
   * Get desktop client for a session
   */
  getDesktopForSession(sessionId: string): Device | undefined {
    const devices = this.getDevicesInSession(sessionId);
    return devices.find(device => device.type === 'desktop');
  }

  /**
   * Get mobile clients for a session
   */
  getMobilesForSession(sessionId: string): Device[] {
    const devices = this.getDevicesInSession(sessionId);
    return devices.filter(device => device.type === 'mobile');
  }

  /**
   * Send message to specific device
   */
  sendToDevice(deviceId: string, message: any): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      console.error(`❌ Device not found: ${deviceId}`);
      return false;
    }

    if (device.ws.readyState !== WebSocket.OPEN) {
      console.error(`❌ Device ${deviceId} not connected`);
      return false;
    }

    try {
      device.ws.send(JSON.stringify(message));
      this.updateActivity(deviceId);
      return true;
    } catch (e) {
      console.error(`❌ Failed to send to device ${deviceId}:`, e);
      return false;
    }
  }

  /**
   * Send message to desktop client in session
   */
  sendToDesktop(sessionId: string, message: any): boolean {
    const desktop = this.getDesktopForSession(sessionId);
    if (!desktop) {
      console.error(`❌ No desktop client for session ${sessionId}`);
      return false;
    }

    return this.sendToDevice(desktop.id, message);
  }

  /**
   * Broadcast to all devices in session (except sender)
   */
  broadcastToSession(
    sessionId: string,
    message: any,
    excludeDeviceId?: string
  ): number {
    const devices = this.getDevicesInSession(sessionId);
    let sent = 0;

    for (const device of devices) {
      if (device.id !== excludeDeviceId) {
        if (this.sendToDevice(device.id, message)) {
          sent++;
        }
      }
    }

    return sent;
  }

  /**
   * Broadcast to all mobile clients in session
   */
  broadcastToMobiles(sessionId: string, message: any): number {
    const mobiles = this.getMobilesForSession(sessionId);
    let sent = 0;

    for (const mobile of mobiles) {
      if (this.sendToDevice(mobile.id, message)) {
        sent++;
      }
    }

    return sent;
  }

  /**
   * Remove device
   */
  removeDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      console.log(`❌ Device disconnected: ${deviceId} (${device.type})`);
      this.devices.delete(deviceId);
    }
  }

  /**
   * Cleanup inactive devices
   */
  cleanupInactive(maxInactiveMs: number = 300000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [deviceId, device] of this.devices) {
      if (now - device.lastActive > maxInactiveMs) {
        this.removeDevice(deviceId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} inactive devices`);
    }

    return cleaned;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalDevices: number;
    mobileDevices: number;
    desktopDevices: number;
    activeSessions: number;
  } {
    const devices = Array.from(this.devices.values());
    const sessions = new Set(
      devices.map(d => d.sessionId).filter(Boolean)
    );

    return {
      totalDevices: devices.length,
      mobileDevices: devices.filter(d => d.type === 'mobile').length,
      desktopDevices: devices.filter(d => d.type === 'desktop').length,
      activeSessions: sessions.size
    };
  }

  /**
   * List all devices
   */
  listDevices(): Device[] {
    return Array.from(this.devices.values());
  }
}
