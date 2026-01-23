import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProjectConfig } from '../types';

interface ProjectSelectorProps {
  projects: ProjectConfig[];
  currentProjectPath: string;
  onSelectProject: (project: ProjectConfig) => void;
}

export function ProjectSelector({
  projects,
  currentProjectPath,
  onSelectProject,
}: ProjectSelectorProps) {
  const [visible, setVisible] = useState(false);

  const currentProject = projects.find(p => p.path === currentProjectPath);

  const handleSelect = (project: ProjectConfig) => {
    onSelectProject(project);
    setVisible(false);
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
            {currentProject?.name || currentProjectPath || '未选择项目'}
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
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择项目</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={24} color="#757575" />
              </TouchableOpacity>
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
                      name="folder"
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
                        {item.name}
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
        </TouchableOpacity>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
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
});
