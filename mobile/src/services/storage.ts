import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings, ProjectConfig, Message } from '../types';

const SETTINGS_KEY = '@claude_app_settings';
const MESSAGES_KEY = '@claude_app_messages';

const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: 'http://61.175.246.236:3002',
  enableTTS: true,
  currentProjectPath: '',
  projects: []
};

export class StorageService {
  // 保存设置
  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('保存设置失败:', error);
      throw error;
    }
  }

  // 获取设置
  async getSettings(): Promise<AppSettings> {
    try {
      const value = await AsyncStorage.getItem(SETTINGS_KEY);
      if (value !== null) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(value) };
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('获取设置失败:', error);
      return DEFAULT_SETTINGS;
    }
  }

  // 更新服务器 URL
  async updateServerUrl(url: string): Promise<void> {
    const settings = await this.getSettings();
    settings.serverUrl = url;
    await this.saveSettings(settings);
  }

  // 更新 TTS 设置
  async updateTTSEnabled(enabled: boolean): Promise<void> {
    const settings = await this.getSettings();
    settings.enableTTS = enabled;
    await this.saveSettings(settings);
  }

  // 更新当前项目路径
  async updateCurrentProject(path: string): Promise<void> {
    const settings = await this.getSettings();
    settings.currentProjectPath = path;
    await this.saveSettings(settings);
  }

  // 更新项目列表
  async updateProjects(projects: ProjectConfig[]): Promise<void> {
    const settings = await this.getSettings();
    settings.projects = projects;
    await this.saveSettings(settings);
  }

  // 保存项目消息历史
  async saveProjectMessages(projectPath: string, messages: Message[]): Promise<void> {
    try {
      const allMessages = await this.getAllProjectMessages();
      allMessages[projectPath] = messages;
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    } catch (error) {
      console.error('保存消息历史失败:', error);
    }
  }

  // 获取项目消息历史
  async getProjectMessages(projectPath: string): Promise<Message[]> {
    try {
      const allMessages = await this.getAllProjectMessages();
      return allMessages[projectPath] || [];
    } catch (error) {
      console.error('获取消息历史失败:', error);
      return [];
    }
  }

  // 获取所有项目的消息历史
  async getAllProjectMessages(): Promise<Record<string, Message[]>> {
    try {
      const value = await AsyncStorage.getItem(MESSAGES_KEY);
      return value ? JSON.parse(value) : {};
    } catch (error) {
      console.error('获取所有消息历史失败:', error);
      return {};
    }
  }

  // 清除所有数据
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SETTINGS_KEY);
      await AsyncStorage.removeItem(MESSAGES_KEY);
    } catch (error) {
      console.error('清除数据失败:', error);
      throw error;
    }
  }
}

// 单例实例
let storageInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageInstance) {
    storageInstance = new StorageService();
  }
  return storageInstance;
}
