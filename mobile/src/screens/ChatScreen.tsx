import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import 'react-native-url-polyfill/auto';

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
  const [serverUrl, setServerUrl] = useState('http://47.99.75.219:3001');
  const [currentProjectPath, setCurrentProjectPath] = useState('');
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const messageIdCounter = useRef(0);
  const pendingMessages = useRef<Map<string, Message>>(new Map());
  const loadedMessagesCount = useRef(0);

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

      // 自动连接以获取项目列表和历史消息
      connect(settings.currentProjectPath || '');
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

  // 解析 Claude Code session 格式
  const parseSessionHistory = (sessionData: any[]): Message[] => {
    const messages: Message[] = [];

    sessionData.forEach((item, index) => {
      // Claude Code session 格式: { type: 'user'/'assistant', message: { role, content }, timestamp }
      if (item.type === 'user' && item.message) {
        // 用户消息
        let userText = '';
        const content = item.message.content;
        if (typeof content === 'string') {
          userText = content;
        } else if (Array.isArray(content)) {
          userText = content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
        }
        if (userText) {
          messages.push({
            id: `history-user-${index}`,
            type: 'user',
            content: userText,
            timestamp: new Date(item.timestamp || Date.now())
          });
        }
      } else if (item.type === 'assistant' && item.message) {
        // 助手消息
        let assistantText = '';
        const content = item.message.content;
        if (typeof content === 'string') {
          assistantText = content;
        } else if (Array.isArray(content)) {
          assistantText = content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
        }
        if (assistantText) {
          messages.push({
            id: `history-assistant-${index}`,
            type: 'assistant',
            content: assistantText,
            timestamp: new Date(item.timestamp || Date.now())
          });
        }
      }
    });

    return messages;
  };

  // 处理 WebSocket 消息
  const handleWSMessage = useCallback((wsMessage: WSMessage) => {
    console.log('[ChatScreen] 处理消息:', wsMessage.type, wsMessage.content?.substring(0, 50));
    switch (wsMessage.type) {
      case 'connected':
        addSystemMessage('已连接到服务器');
        break;

      case 'ready':
        addSystemMessage(`已就绪: ${wsMessage.projectPath || ''}`);
        // 加载历史消息
        if (wsMessage.history && Array.isArray(wsMessage.history)) {
          console.log('[ChatScreen] 收到历史消息:', wsMessage.history.length);
          loadedMessagesCount.current = wsMessage.history.length;
          setHasMoreHistory(wsMessage.hasMoreHistory || false);
          const historyMessages = parseSessionHistory(wsMessage.history);
          setMessages(historyMessages);
        }
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
        setCurrentProjectPath(wsMessage.projectPath || '');
        getStorageService().updateCurrentProject(wsMessage.projectPath || '');
        // 清空当前消息
        setMessages([]);
        // 加载新项目的历史消息
        if (wsMessage.history && Array.isArray(wsMessage.history)) {
          console.log('[ChatScreen] 切换项目，收到历史消息:', wsMessage.history.length);
          loadedMessagesCount.current = wsMessage.history.length;
          setHasMoreHistory(wsMessage.hasMoreHistory || false);
          const historyMessages = parseSessionHistory(wsMessage.history);
          setMessages([...historyMessages, {
            id: `sys-${Date.now()}`,
            type: 'system',
            content: wsMessage.message || '项目已切换',
            timestamp: new Date()
          }]);
        } else {
          addSystemMessage(wsMessage.message || '项目已切换');
        }
        break;

      case 'historyLoaded':
        // 加载更多历史消息
        setIsLoadingMore(false);
        if (wsMessage.history && Array.isArray(wsMessage.history)) {
          console.log('[ChatScreen] 加载更多历史:', wsMessage.history.length);
          const moreMessages = parseSessionHistory(wsMessage.history);
          // 在消息列表前面添加更早的消息
          setMessages(prev => [...moreMessages, ...prev]);
          loadedMessagesCount.current += wsMessage.history!.length;
          setHasMoreHistory(wsMessage.hasMore || false);
        }
        break;

      case 'messageAck':
        // 消息已确认，开始流式接收
        break;

      case 'responseChunk':
        // 流式接收内容片段
        console.log('[ChatScreen] 收到chunk:', wsMessage.content?.substring(0, 30));
        if (wsMessage.content) {
          appendAssistantMessage(wsMessage.content);
        }
        break;

      case 'responseDone':
        // 响应完成
        console.log('[ChatScreen] 收到responseDone，设置isLoading=false');
        setIsLoading(false);
        // 播放语音（使用完整的累积内容）
        if (enableTTS) {
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.type === 'assistant' && lastMsg.content) {
              getVoiceService().speak(lastMsg.content);
            }
            return prev;
          });
        }
        break;

      case 'response':
        // 兼容旧的非流式响应
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

  // 追加助手消息内容（流式）
  const appendAssistantMessage = (content: string) => {
    setMessages(prev => {
      // 检查最后一条消息是否是助手消息
      if (prev.length > 0 && prev[prev.length - 1].type === 'assistant') {
        // 追加到最后一条助手消息
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: updated[updated.length - 1].content + content
        };
        return updated;
      } else {
        // 创建新的助手消息
        const message: Message = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          content,
          timestamp: new Date(),
        };
        return [...prev, message];
      }
    });
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
    // 切换到新项目，服务端会返回该项目的 session 历史
    const ws = getWebSocketService(serverUrl);
    ws.changeProject(project.path);
  }, [serverUrl]);

  // 创建新项目
  const handleCreateProject = useCallback(async (name: string) => {
    try {
      const response = await fetch(`${serverUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (response.ok) {
        addSystemMessage(`项目 "${name}" 创建成功`);
        // 刷新项目列表
        const projectsResponse = await fetch(`${serverUrl}/api/projects`);
        const projectsData = await projectsResponse.json();
        if (projectsData.projects) {
          const projectConfigs: ProjectConfig[] = projectsData.projects.map((path: string) => ({
            name: path.split('/').filter(Boolean).pop() || path,
            path
          }));
          setProjects(projectConfigs);
          getStorageService().updateProjects(projectConfigs);

          // 自动切换到新项目
          const newProject = projectConfigs.find(p => p.name === name);
          if (newProject) {
            handleSelectProject(newProject);
          }
        }
      } else {
        addErrorMessage(data.error || '创建项目失败');
      }
    } catch (error) {
      console.error('创建项目失败:', error);
      addErrorMessage('创建项目失败');
    }
  }, [serverUrl, handleSelectProject]);

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

  // 加载更多历史消息
  const handleLoadMore = useCallback(() => {
    if (!hasMoreHistory || isLoadingMore || connectionStatus !== 'connected') {
      return;
    }
    console.log('[ChatScreen] 加载更多历史，offset:', loadedMessagesCount.current);
    setIsLoadingMore(true);
    const ws = getWebSocketService(serverUrl);
    ws.loadMoreHistory(loadedMessagesCount.current, 20);
  }, [hasMoreHistory, isLoadingMore, connectionStatus, serverUrl]);

  // 消息历史由服务端的 Claude Code session 管理，客户端不需要保存

  // 自动滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
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
          onCreateProject={handleCreateProject}
        />

        {/* 消息列表 */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatMessage message={item} />}
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          style={styles.chatList}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.1}
          inverted
          ListFooterComponent={
            isLoadingMore ? (
              <View style={{ padding: 10, alignItems: 'center' }}>
                <Text style={{ color: '#757575' }}>加载中...</Text>
              </View>
            ) : null
          }
        />

        {/* 输入框 */}
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          enableVoice={true}
        />

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
  },
  chatList: {
    flex: 1,
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: 8,
  },
});
