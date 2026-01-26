import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isSystem = message.type === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : isError ? styles.errorBubble : styles.assistantBubble]}>
        {isUser ? (
          <Text style={[styles.text, styles.userText]}>
            {message.content}
          </Text>
        ) : (
          <Markdown style={markdownStyles}>
            {message.content}
          </Markdown>
        )}
        <Text style={[styles.timestamp, isUser && styles.userTimestamp]}>
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  userBubble: {
    backgroundColor: '#2196F3',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#ECEFF1',
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: '#FFEBEE',
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#212121',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.7,
    color: '#212121',
  },
  userTimestamp: {
    color: '#fff',
  },
  systemContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: '#757575',
    backgroundColor: '#ECEFF1',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
});

const markdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#212121',
  },
  code_inline: {
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontFamily: 'monospace',
  },
  code_block: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  fence: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  heading1: {
    fontSize: 20,
    fontWeight: '700',
    marginVertical: 8,
    color: '#212121',
  },
  heading2: {
    fontSize: 18,
    fontWeight: '600',
    marginVertical: 6,
    color: '#212121',
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    marginVertical: 4,
    color: '#212121',
  },
  link: {
    color: '#2196F3',
    textDecorationLine: 'underline' as const,
  },
  blockquote: {
    backgroundColor: '#F5F5F5',
    borderLeftWidth: 4,
    borderLeftColor: '#BDBDBD',
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
};
