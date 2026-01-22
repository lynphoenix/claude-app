import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import 'url-polyfill';

import { ConnectionStatus } from '../components/ConnectionStatus';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import { ProjectSelector } from '../components/ProjectSelector';
import { SettingsPanel } from '../components/SettingsPanel';

import { getWebSocketService, getVoiceService, getStorageService } from '../services';
import { Message, ConnectionStatus as ConnStatus, WSMessage, ProjectConfig } from '../types';

export function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnStatus>('disconnected');
  const [isLoading, setIsLoading] = useState(false);
  const [enableTTS, setEnableTTS] = useState(true);
  const [serverUrl, setServerUrl] = useState('http://your-server.com:3001');
  const [currentProjectPath, setCurrentProjectPath] = useState('');
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const messageIdCounter = useRef(0);
  const pendingMessages = useRef<Map<string, Message>>(new Map());

  // 初始化服务
  useEffect(() => {
    const init = async () => {
      const storage = getStorageService();
      const settings = await storage.getSettings();

      setServerUrl(settings.serverUrl);
      setEnableTTS(settings.enableTTS);
      setCurrentProjectPath(settings.currentProjectPath);
      setProjects(settings.projects);

      // 更新语音服务配置
      const voice = getVoiceService();
      voice.updateConfig({ enabled: settings.enableTTS });

      // 如果有当前项目路径，自动连接
      if (settings.currentProjectPath) {
        connect(settings.currentProjectPath);
      }
    };

    init();
  }, []);

  // 连接到服务器
  const connect = useCallback(async (projectPath: string) => {
    try {
      const ws = getWebSocketService(serverUrl);

      // 监听状态变化
      ws.onStatusChange((status) => {
        setConnectionStatus(status);
      });

      // 监听消息
      ws.onMessage(handleWSMessage);

      await ws.connect(projectPath);
    } catch (error) {
      console.error('连接失败:', error);
      setConnectionStatus('error');
    }
  }, [serverUrl]);

  // 处理 WebSocket 消息
  const handleWSMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'connected':
        addSystemMessage('已连接到服务器');
        break;

      case 'ready':
        addSystemMessage(`已就绪: ${wsMessage.projectPath || ''}`);
        break;

      case 'projects':
        if (wsMessage.projects) {
          const projectConfigs: ProjectConfig[] = wsMessage.projects.map(path => ({
            name: path.split('/').filter(Boolean).pop() || path,
            path
          }));
          setProjects(projectConfigs);
          getStorageService().updateProjects(projectConfigs);
        }
        break;

      case 'projectChanged':
        addSystemMessage(wsMessage.message || '项目已切换');
        setCurrentProjectPath(wsMessage.projectPath || '');
        getStorageService().updateCurrentProject(wsMessage.projectPath || '');
        break;

      case 'messageAck':
        // 消息已确认，发送中
        break;

      case 'response':
        setIsLoading(false);
        if (wsMessage.content) {
          addAssistantMessage(wsMessage.content);

          // 播放语音
          if (enableTTS) {
            getVoiceService().speak(wsMessage.content);
          }
        }
        break;

      case 'error':
        setIsLoading(false);
        addErrorMessage(wsMessage.message || '发生错误');
        break;
    }
  }, [enableTTS]);

  // 添加系统消息
  const addSystemMessage = (content: string) => {
    const message: Message = {
      id: `system-${Date.now()}`,
      type: 'system',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, message]);
  };

  // 添加用户消息
  const addUserMessage = (content: string): string => {
    const id = `user-${++messageIdCounter.current}`;
    const message: Message = {
      id,
      type: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, message]);
    pendingMessages.current.set(id, message);
    return id;
  };

  // 添加助手消息
  const addAssistantMessage = (content: string) => {
    const message: Message = {
      id: `assistant-${Date.now()}`,
      type: 'assistant',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, message]);
  };

  // 添加错误消息
  const addErrorMessage = (content: string) => {
    const message: Message = {
      id: `error-${Date.now()}`,
      type: 'error',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, message]);
  };

  // 发送消息
  const handleSend = useCallback((text: string) => {
    if (connectionStatus !== 'connected') {
      addSystemMessage('请先连接到服务器');
      return;
    }

    const messageId = addUserMessage(text);
    setIsLoading(true);

    const ws = getWebSocketService(serverUrl);
    ws.sendMessage(text, messageId);
  }, [connectionStatus, serverUrl]);

  // 重新连接
  const handleReconnect = useCallback(() => {
    if (currentProjectPath) {
      connect(currentProjectPath);
    } else {
      addSystemMessage('请先选择一个项目');
    }
  }, [currentProjectPath, connect]);

  // 切换项目
  const handleSelectProject = useCallback((project: ProjectConfig) => {
    const ws = getWebSocketService(serverUrl);
    ws.changeProject(project.path);
  }, [serverUrl]);

  // 保存服务器地址
  const handleSaveServerUrl = useCallback((url: string) => {
    setServerUrl(url);
    getStorageService().updateServerUrl(url);
    getWebSocketService(url).updateServerUrl(url);
  }, []);

  // 切换 TTS
  const handleToggleTTS = useCallback((enabled: boolean) => {
    setEnableTTS(enabled);
    getVoiceService().updateConfig({ enabled });
    getStorageService().updateTTSEnabled(enabled);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  return (
    <SafeAreaView style={styles.container}>
      {/* 头部 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Claude Code</Text>
        <TouchableOpacity onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={24} color="#757575" />
        </TouchableOpacity>
      </View>

      {/* 连接状态 */}
      <ConnectionStatus
        status={connectionStatus}
        onReconnect={handleReconnect}
      />

      {/* 项目选择器 */}
      <ProjectSelector
        projects={projects}
        currentProjectPath={currentProjectPath}
        onSelectProject={handleSelectProject}
      />

      {/* 消息列表 */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatMessage message={item} />}
        contentContainerStyle={styles.messagesList}
        keyboardShouldPersistTaps="handled"
      />

      {/* 输入框 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          enableVoice={true}
        />
      </KeyboardAvoidingView>

      {/* 设置面板 */}
      <SettingsPanel
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        serverUrl={serverUrl}
        enableTTS={enableTTS}
        onSaveServerUrl={handleSaveServerUrl}
        onToggleTTS={handleToggleTTS}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: #E0E0E0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: 8,
  },
});
