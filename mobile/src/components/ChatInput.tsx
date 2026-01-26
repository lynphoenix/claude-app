import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@dev-amirzubair/react-native-voice';

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading?: boolean;
  enableVoice?: boolean;
}

export function ChatInput({ onSend, isLoading = false, enableVoice = true }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    // 设置语音识别监听器
    Voice.onSpeechStart = () => {
      console.log('语音识别开始');
      setIsListening(true);
    };

    Voice.onSpeechEnd = () => {
      console.log('语音识别结束');
      setIsListening(false);
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      console.log('识别结果:', e.value);
      if (e.value && e.value.length > 0) {
        const recognizedText = e.value[0];
        setText(recognizedText);
      }
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      console.error('语音识别错误:', e.error);
      setIsListening(false);

      // 只在非取消的情况下显示错误
      if (e.error?.code !== '7') {  // 7 是用户取消
        Alert.alert('语音识别错误', e.error?.message || '识别失败，请重试');
      }
    };

    // 清理
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleVoiceInput = async () => {
    if (isListening) {
      // 停止识别
      try {
        await Voice.stop();
        setIsListening(false);
      } catch (error) {
        console.error('停止语音识别失败:', error);
      }
      return;
    }

    try {
      // 检查语音识别是否可用
      const isAvailable = await Voice.isAvailable();
      if (!isAvailable) {
        Alert.alert('不支持', '您的设备不支持语音识别功能');
        return;
      }

      // 开始语音识别（中文）
      await Voice.start('zh-CN');
      setIsListening(true);
    } catch (error) {
      console.error('启动语音识别失败:', error);
      Alert.alert('错误', '启动语音识别失败，请检查麦克风权限');
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
