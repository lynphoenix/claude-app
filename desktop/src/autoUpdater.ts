import { exec } from 'child_process';
import { promisify } from 'util';
import { COMPILED_VERSION, getDiskVersion, isVersionMismatch } from './version.js';

const execAsync = promisify(exec);

export interface UpdaterConfig {
  checkInterval: number;  // ms between checks
  gitRemote: string;
  gitBranch: string;
  autoRestart: boolean;
}

export class AutoUpdater {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private config: UpdaterConfig;
  private isUpdating = false;

  constructor(config: Partial<UpdaterConfig> = {}) {
    this.config = {
      checkInterval: 60 * 1000, // 60 seconds
      gitRemote: 'origin',
      gitBranch: 'main',
      autoRestart: true,
      ...config
    };
  }

  start() {
    console.log(`🔄 AutoUpdater started (check interval: ${this.config.checkInterval}ms)`);
    console.log(`📦 Compiled version: ${COMPILED_VERSION}`);

    // Check immediately on start
    this.checkForUpdates();

    // Then check periodically
    this.heartbeatTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.config.checkInterval);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('🔄 AutoUpdater stopped');
    }
  }

  private async checkForUpdates() {
    if (this.isUpdating) {
      console.log('⏳ Update already in progress, skipping check');
      return;
    }

    try {
      // Check if git repo has remote changes
      const hasRemoteChanges = await this.hasRemoteChanges();

      if (hasRemoteChanges) {
        console.log('🆕 Remote changes detected, pulling updates...');
        await this.performUpdate();
      }

      // Also check for version mismatch (manual edit)
      if (isVersionMismatch()) {
        const diskVersion = getDiskVersion();
        console.log(`🔄 Version mismatch detected: ${COMPILED_VERSION} → ${diskVersion}`);
        console.log('📦 Rebuilding and restarting...');
        await this.rebuild();
      }
    } catch (error) {
      console.error('❌ Update check failed:', error);
    }
  }

  private async hasRemoteChanges(): Promise<boolean> {
    try {
      // Fetch latest from remote
      await execAsync(`git fetch ${this.config.gitRemote} ${this.config.gitBranch}`);

      // Check if local is behind remote
      const { stdout } = await execAsync(
        `git rev-list HEAD..${this.config.gitRemote}/${this.config.gitBranch} --count`
      );

      const behindCount = parseInt(stdout.trim(), 10);
      return behindCount > 0;
    } catch (error) {
      console.error('Failed to check remote changes:', error);
      return false;
    }
  }

  private async performUpdate() {
    this.isUpdating = true;

    try {
      console.log('📥 Pulling latest code...');
      const { stdout: pullOutput } = await execAsync(
        `git pull ${this.config.gitRemote} ${this.config.gitBranch}`
      );
      console.log(pullOutput);

      console.log('📦 Rebuilding...');
      await this.rebuild();
    } catch (error) {
      console.error('❌ Update failed:', error);
      this.isUpdating = false;
    }
  }

  private async rebuild() {
    try {
      console.log('🔨 Installing dependencies...');
      const { stdout: installOutput } = await execAsync('npm install');
      console.log(installOutput);

      console.log('🔨 Building...');
      const { stdout: buildOutput } = await execAsync('npm run build');
      console.log(buildOutput);

      if (this.config.autoRestart) {
        console.log('🔄 Restarting via PM2...');
        // Use pm2 restart to reload the new code
        await execAsync('pm2 restart claude-desktop-h100');
        // Note: This process will be killed by PM2 restart, so code below won't run
      } else {
        console.log('✅ Update complete. Please restart manually.');
      }
    } catch (error) {
      console.error('❌ Rebuild failed:', error);
      throw error;
    }
  }
}
