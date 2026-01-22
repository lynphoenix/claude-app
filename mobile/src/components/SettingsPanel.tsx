import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  serverUrl: string;
  enableTTS: boolean;
  onSaveServerUrl: (url: string) => void;
  onToggleTTS: (enabled: boolean) => void;
}

export function SettingsPanel({
  visible,
  onClose,
  serverUrl,
  enableTTS,
  onSaveServerUrl,
  onToggleTTS,
}: SettingsPanelProps) {
  const [tempServerUrl, setTempServerUrl] = React.useState(serverUrl);

  const handleSaveServerUrl = () => {
    if (!tempServerUrl.trim()) {
      Alert.alert('错误', '服务器地址不能为空');
      return;
    }
    onSaveServerUrl(tempServerUrl.trim());
    Alert.alert('成功', '服务器地址已更新，请重新连接');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.modalContent}
          activeOpacity={1}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>设置</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#757575" />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsContainer}>
            {/* 服务器地址设置 */}
            <View style={styles.settingSection}>
              <Text style={styles.sectionTitle}>服务器配置</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>服务器地址</Text>
                <TextInput
                  style={styles.input}
                  value={tempServerUrl}
                  onChangeText={setTempServerUrl}
                  placeholder="http://your-server.com:3001"
                  placeholderTextColor="#9E9E9E"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveServerUrl}>
                  <Text style={styles.saveButtonText}>保存</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color="#2196F3" />
                <Text style={styles.infoText}>
                  修改服务器地址后需要重新连接
                </Text>
              </View>
            </View>

            {/* TTS 设置 */}
            <View style={styles.settingSection}>
              <Text style={styles.sectionTitle}>语音设置</Text>

              <View style={styles.switchGroup}>
                <View style={styles.switchInfo}>
                  <Text style={styles.switchLabel}>语音播报</Text>
                  <Text style={styles.switchDescription}>
                    开启后，Claude 的回复将使用语音朗读
                  </Text>
                </View>
                <Switch
                  value={enableTTS}
                  onValueChange={onToggleTTS}
                  trackColor={{ false: '#E0E0E0', true: '#B3E5FC' }}
                  thumbColor={enableTTS ? '#2196F3' : '#9E9E9E'}
                />
              </View>
            </View>

            {/* 关于信息 */}
            <View style={styles.settingSection}>
              <Text style={styles.sectionTitle}>关于</Text>

              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>版本</Text>
                <Text style={styles.aboutValue}>1.0.0</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: #E0E0E0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  settingsContainer: {
    padding: 20,
  },
  settingSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#212121',
    borderWidth: 1,
    borderColor: #E0E0E0,
  },
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#1976D2',
    marginLeft: 8,
    flex: 1,
  },
  switchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  switchInfo: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 12,
    color: '#757575',
  },
  aboutInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  aboutLabel: {
    fontSize: 14,
    color: '#424242',
  },
  aboutValue: {
    fontSize: 14,
    color: '#757575',
  },
});
