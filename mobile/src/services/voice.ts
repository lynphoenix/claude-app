import * as Speech from 'expo-speech';

export interface VoiceConfig {
  enabled: boolean;
  language: string;
  rate: number;
  pitch: number;
}

export class VoiceService {
  private config: VoiceConfig;

  constructor(config: Partial<VoiceConfig> = {}) {
    this.config = {
      enabled: true,
      language: 'zh-CN',
      rate: 1.0,
      pitch: 1.0,
      ...config
    };
  }

  // 播放语音
  speak(text: string): void {
    if (!this.config.enabled) {
      console.log('语音播报已禁用');
      return;
    }

    // 停止当前正在播放的语音
    Speech.stop();

    Speech.speak(text, {
      language: this.config.language,
      rate: this.config.rate,
      pitch: this.config.pitch,
    });
  }

  // 停止播放
  stop(): void {
    Speech.stop();
  }

  // 检查是否正在播放
  async isSpeaking(): Promise<boolean> {
    return await Speech.isSpeakingAsync();
  }

  // 更新配置
  updateConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // 获取配置
  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  // 切换启用状态
  toggle(): boolean {
    this.config.enabled = !this.config.enabled;
    return this.config.enabled;
  }

  // 是否启用
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

// 单例实例
let voiceInstance: VoiceService | null = null;

export function getVoiceService(): VoiceService {
  if (!voiceInstance) {
    voiceInstance = new VoiceService();
  }
  return voiceInstance;
}
