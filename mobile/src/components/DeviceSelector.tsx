import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface DeviceInfo {
  id: string;
  displayName: string;
  status: 'online' | 'offline';
  lastActive: number;
}

interface DeviceSelectorProps {
  devices: DeviceInfo[];
  currentDeviceId: string;
  onSelectDevice: (device: DeviceInfo) => void;
}

export function DeviceSelector({
  devices,
  currentDeviceId,
  onSelectDevice,
}: DeviceSelectorProps) {
  const [visible, setVisible] = useState(false);

  const currentDevice = devices.find(d => d.id === currentDeviceId);
  const displayName = currentDevice?.displayName || '未选择设备';

  const handleSelect = (device: DeviceInfo) => {
    if (device.status === 'online') {
      onSelectDevice(device);
      setVisible(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setVisible(true)}
      >
        <Ionicons name="hardware-chip-outline" size={20} color="#757575" />
        <View style={styles.textContainer}>
          <Text style={styles.label}>设备</Text>
          <Text style={styles.value} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={20} color="#757575" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackground}
            activeOpacity={1}
            onPress={() => setVisible(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择设备</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={24} color="#757575" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.deviceItem,
                    item.id === currentDeviceId && styles.selectedItem,
                    item.status === 'offline' && styles.offlineItem,
                  ]}
                  onPress={() => handleSelect(item)}
                  disabled={item.status === 'offline'}
                >
                  <View style={styles.deviceInfo}>
                    <Ionicons
                      name={item.status === 'online' ? 'checkmark-circle' : 'close-circle'}
                      size={24}
                      color={item.status === 'online' ? '#4CAF50' : '#9E9E9E'}
                    />
                    <View style={styles.deviceText}>
                      <Text
                        style={[
                          styles.deviceName,
                          item.id === currentDeviceId && styles.selectedText,
                          item.status === 'offline' && styles.offlineText,
                        ]}
                      >
                        {item.displayName}
                      </Text>
                      <Text style={styles.deviceStatus}>
                        {item.status === 'online' ? '在线' : '离线'}
                      </Text>
                    </View>
                  </View>
                  {item.id === currentDeviceId && (
                    <Ionicons name="checkmark" size={24} color="#2196F3" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>暂无可用设备</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  textContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  label: {
    fontSize: 11,
    color: '#757575',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    color: '#212121',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  selectedItem: {
    backgroundColor: '#E3F2FD',
  },
  offlineItem: {
    opacity: 0.5,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceText: {
    marginLeft: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
    marginBottom: 2,
  },
  selectedText: {
    color: '#2196F3',
  },
  offlineText: {
    color: '#9E9E9E',
  },
  deviceStatus: {
    fontSize: 12,
    color: '#757575',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#757575',
  },
});
