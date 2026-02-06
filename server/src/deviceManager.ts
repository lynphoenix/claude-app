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
  displayName?: string; // Friendly name like "H100", "Mac", "219"
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
    displayName?: string,
    publicKey?: string
  ): void {
    const device: Device = {
      id: deviceId,
      type,
      ws,
      sessionId: null,
      displayName,
      publicKey,
      lastActive: Date.now()
    };

    this.devices.set(deviceId, device);
    console.log(`📱 Device registered: ${deviceId} (${type})${displayName ? ` - ${displayName}` : ''}`);
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
      // If this is a desktop device, unbind other desktops from this session
      if (device.type === 'desktop') {
        // Find all other desktops in this session and unbind them
        Array.from(this.devices.values()).forEach(d => {
          if (d.type === 'desktop' && d.id !== deviceId && d.sessionId === sessionId) {
            console.log(`🔓 Unbinding desktop ${d.id} from session ${sessionId} (replaced by ${deviceId})`);
            d.sessionId = null;
          }
        });
      }

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
   * Get all desktop devices (for device list)
   */
  getAllDesktops(): Device[] {
    return Array.from(this.devices.values()).filter(d => d.type === 'desktop');
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
   * Get desktop client for a session (or any available desktop)
   */
  getDesktopForSession(sessionId: string): Device | undefined {
    // First try to find desktop already in this session
    const devices = this.getDevicesInSession(sessionId);
    const desktop = devices.find(device => device.type === 'desktop');

    if (desktop) {
      return desktop;
    }

    // If no desktop in session, find any available desktop and bind it
    const availableDesktop = Array.from(this.devices.values()).find(
      device => device.type === 'desktop' && !device.sessionId
    );

    if (availableDesktop) {
      console.log(`📎 Auto-binding desktop ${availableDesktop.id} to session ${sessionId}`);
      this.setDeviceSession(availableDesktop.id, sessionId);
      return availableDesktop;
    }

    return undefined;
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
