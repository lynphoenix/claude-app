import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

interface ConnectionStatusProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  onReconnect?: () => void;
}

export function ConnectionStatus({ status, onReconnect }: ConnectionStatusProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return { color: '#4CAF50', text: '已连接', showIndicator: false };
      case 'connecting':
        return { color: '#FF9800', text: '连接中...', showIndicator: true };
      case 'error':
        return { color: '#F44336', text: '连接错误', showIndicator: false };
      default:
        return { color: '#9E9E9E', text: '未连接', showIndicator: false };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <View style={[styles.container, { borderColor: statusInfo.color }]}>
      <View style={styles.content}>
        <View style={[styles.dot, { backgroundColor: statusInfo.color }]} />
        <Text style={[styles.text, { color: statusInfo.color }]}>
          {statusInfo.text}
        </Text>
        {statusInfo.showIndicator && <ActivityIndicator size="small" color={statusInfo.color} />}
      </View>
      {(status === 'disconnected' || status === 'error') && onReconnect && (
        <TouchableOpacity onPress={onReconnect} style={styles.reconnectButton}>
          <Text style={styles.reconnectText}>重新连接</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  reconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  reconnectText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
