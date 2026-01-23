import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading?: boolean;
  enableVoice?: boolean;
}

export function ChatInput({ onSend, isLoading = false, enableVoice = true }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleVoiceInput = async () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      setIsListening(true);

      // 使用 Expo Speech 的语音识别功能
      // 注意：expo-speech 主要是 TTS，STT 需要使用 expo-speech-recognition
      // 这里我们先使用简单的实现，后续可以替换为完整的语音识别

      // 检查语音识别是否可用
      const isAvailable = await Speech.isSpeakingAsync();

      if (!isAvailable) {
        Alert.alert(
          '语音输入',
          '语音功能正在开发中。目前请使用文字输入。',
          [{ text: '确定' }]
        );
        setIsListening(false);
        return;
      }

      // 这里可以集成 expo-speech-recognition 或其他语音识别库
      // 暂时显示提示
      Alert.alert(
        '语音输入',
        '请说话...',
        [
          {
            text: '停止',
            onPress: () => setIsListening(false)
          }
        ]
      );

    } catch (error) {
      console.error('语音识别错误:', error);
      Alert.alert('错误', '语音识别暂时不可用');
      setIsListening(false);
    }
  };

  return (
    <View style={styles.container}>
      {enableVoice && (
        <TouchableOpacity
          style={[styles.iconButton, isListening && styles.listeningButton]}
          onPress={handleVoiceInput}
          disabled={isLoading}
        >
          <Ionicons
            name={isListening ? 'mic' : 'mic-outline'}
            size={24}
            color={isListening ? '#fff' : '#757575'}
          />
        </TouchableOpacity>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="输入消息..."
          placeholderTextColor="#9E9E9E"
          multiline
          maxLength={1000}
          editable={!isLoading}
          onSubmitEditing={handleSend}
        />
      </View>

      <TouchableOpacity
        style={[styles.sendButton, (!text.trim() || isLoading) && styles.disabledButton]}
        onPress={handleSend}
        disabled={!text.trim() || isLoading}
      >
        {isLoading ? (
          <Ionicons name="hourglass-outline" size={24} color="#9E9E9E" />
        ) : (
          <Ionicons name="send" size={24} color={text.trim() ? '#2196F3' : '#9E9E9E'} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  listeningButton: {
    backgroundColor: '#F44336',
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  input: {
    fontSize: 15,
    color: '#212121',
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
