import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  SafeAreaView,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProjectConfig } from '../types';

interface ProjectSelectorProps {
  projects: ProjectConfig[];
  currentProjectPath: string;
  onSelectProject: (project: ProjectConfig) => void;
  onCreateProject: (name: string) => void;
}

export function ProjectSelector({
  projects,
  currentProjectPath,
  onSelectProject,
  onCreateProject,
}: ProjectSelectorProps) {
  const [visible, setVisible] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const currentProject = projects.find(p => p.path === currentProjectPath);

  // 获取项目显示名称：设备名:项目名
  const getProjectDisplayName = (project: ProjectConfig): string => {
    const devicePrefix = project.deviceName ? `${project.deviceName}:` : '';
    return `${devicePrefix}${project.name}`;
  };

  const handleSelect = (project: ProjectConfig) => {
    onSelectProject(project);
    setVisible(false);
  };

  const handleCreate = () => {
    if (!newProjectName.trim()) {
      Alert.alert('错误', '项目名称不能为空');
      return;
    }
    onCreateProject(newProjectName.trim());
    setNewProjectName('');
    setShowCreateModal(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setVisible(true)}
      >
        <Ionicons name="folder-outline" size={20} color="#757575" />
        <View style={styles.textContainer}>
          <Text style={styles.label}>当前项目</Text>
          <Text style={styles.value} numberOfLines={1}>
            {currentProject ? getProjectDisplayName(currentProject) : (currentProjectPath || '未选择项目')}
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
              <Text style={styles.modalTitle}>选择项目</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => {
                    setVisible(false);
                    setTimeout(() => setShowCreateModal(true), 300);
                  }}
                  style={styles.addButton}
                >
                  <Ionicons name="add-circle-outline" size={24} color="#2196F3" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setVisible(false)}>
                  <Ionicons name="close" size={24} color="#757575" />
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={projects}
              keyExtractor={(item) => item.path}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.projectItem,
                    item.path === currentProjectPath && styles.selectedItem,
                  ]}
                  onPress={() => handleSelect(item)}
                >
                  <View style={styles.projectInfo}>
                    <Ionicons
                      name={item.hasClaudeDir ? 'folder' : 'folder-outline'}
                      size={24}
                      color={item.path === currentProjectPath ? '#2196F3' : '#757575'}
                    />
                    <View style={styles.projectText}>
                      <Text
                        style={[
                          styles.projectName,
                          item.path === currentProjectPath && styles.selectedText,
                        ]}
                      >
                        {getProjectDisplayName(item)}
                      </Text>
                      <Text style={styles.projectPath} numberOfLines={1}>
                        {item.path}
                      </Text>
                    </View>
                  </View>
                  {item.path === currentProjectPath && (
                    <Ionicons name="checkmark" size={24} color="#2196F3" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>暂无可用项目</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* 新建项目 Modal */}
      <Modal
        visible={showCreateModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.createModalOverlay}>
          <View style={styles.createModalContent}>
            <Text style={styles.createModalTitle}>新建项目</Text>
            <TextInput
              style={styles.createInput}
              placeholder="请输入项目名称"
              value={newProjectName}
              onChangeText={setNewProjectName}
              autoFocus
              onSubmitEditing={handleCreate}
            />
            <View style={styles.createActions}>
              <TouchableOpacity
                style={[styles.createButton, styles.cancelButton]}
                onPress={() => {
                  setNewProjectName('');
                  setShowCreateModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, styles.confirmButton]}
                onPress={handleCreate}
              >
                <Text style={styles.confirmButtonText}>创建</Text>
              </TouchableOpacity>
            </View>
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
    maxHeight: '70%',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addButton: {
    padding: 4,
  },
  projectItem: {
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
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  projectText: {
    marginLeft: 12,
    flex: 1,
  },
  projectName: {
    fontSize: 15,
    color: '#212121',
    fontWeight: '500',
    marginBottom: 2,
  },
  selectedText: {
    color: '#2196F3',
  },
  projectPath: {
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
  createModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  createModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '80%',
  },
  createModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 16,
  },
  createInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 20,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  createButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  confirmButton: {
    backgroundColor: '#2196F3',
  },
  cancelButtonText: {
    color: '#757575',
    fontSize: 15,
    fontWeight: '500',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
});
