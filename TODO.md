# TODO List

## 🔥 紧急优先级

### 1. 编译APK v1.0.15
**状态**: 待执行
**原因**: EAS配额用完，包含关键bug修复
**方法**:
```bash
cd mobile

# 方法1: Android Studio本地编译
npx expo prebuild
cd android
./gradlew assembleRelease
# APK位置: android/app/build/outputs/apk/release/app-release.apk

# 方法2: 等待EAS配额恢复（5天后）
eas build --platform android --profile preview
```

**包含修复**:
- ✅ 消息解析bug修复 (关键)
- ✅ 键盘模式改为adjustResize
- ✅ 分页加载历史消息

---

### 2. 测试历史消息显示
**状态**: 待测试
**步骤**:
1. 安装v1.0.15 APK
2. 打开APP，选择有历史的项目（如claude-app）
3. 验证历史消息正确显示（用户消息 + 助手Markdown消息）
4. 上滑到顶部，测试加载更多

**预期结果**:
- 初始加载最近20条消息
- Markdown正确渲染
- 上滑加载更多历史

---

### 3. 修复键盘遮挡问题
**状态**: 已改为adjustResize，待测试
**当前方案**: `softwareKeyboardLayoutMode: "adjustResize"`

**如果失败，备选方案**:
```typescript
// 方案A: 调整KeyboardAvoidingView的offset
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
>

// 方案B: 使用第三方库
npm install react-native-keyboard-aware-scroll-view
```

---

## 📊 中优先级

### 4. 优化流式响应显示
**目标**: 打字机效果，实时显示assistant回复

**实现**:
- [ ] 添加打字机动画
- [ ] 优化chunk更新频率
- [ ] 添加"正在输入..."指示器

**文件**: `mobile/src/screens/ChatScreen.tsx` (line 203-209)

---

### 5. 添加错误处理
**当前问题**: 错误消息不够友好

**待实现**:
- [ ] Toast提示（react-native-toast-message）
- [ ] 消息发送失败重试按钮
- [ ] 网络断开自动重连
- [ ] 服务器错误友好提示

---

### 6. 优化加载状态
**目标**: 更好的用户反馈

**待实现**:
- [ ] 骨架屏（Skeleton）加载效果
- [ ] 消息发送中状态（loading icon）
- [ ] 历史加载进度条
- [ ] 项目切换loading遮罩

---

## 🎨 低优先级 (优化)

### 7. UI/UX优化
- [ ] 暗色模式支持
- [ ] 自定义主题色
- [ ] 优化Markdown样式（代码高亮）
- [ ] 添加消息时间戳显示
- [ ] 长按消息复制功能
- [ ] 消息滑动删除

---

### 8. 功能增强
- [ ] 语音输入实际测试（已集成但未测试）
- [ ] TTS语音播报实际测试
- [ ] 消息搜索功能
- [ ] 导出对话记录
- [ ] 多语言支持

---

### 9. 性能优化
- [ ] FlatList优化（getItemLayout）
- [ ] 图片懒加载
- [ ] WebSocket心跳优化
- [ ] 减少不必要的re-render

---

### 10. 测试
- [ ] 单元测试（Jest）
- [ ] E2E测试（Detox）
- [ ] 压力测试（大量历史消息）
- [ ] 网络异常测试

---

## 🐛 已知Bug

### Bug #1: 消息解析错误 ✅ 已修复
- **发现版本**: v1.0.13
- **问题**: 使用 `item.role` 而不是 `item.type`
- **修复版本**: v1.0.15 (待编译)
- **修复提交**: a0ea0ae

### Bug #2: 键盘遮挡输入框 ⏳ 待验证
- **发现版本**: v1.0.13
- **尝试方案**: adjustPan → adjustResize
- **待验证版本**: v1.0.15

---

## 📚 技术债务

### 1. 类型定义完善
- [ ] 补充WebSocket消息类型定义
- [ ] 补充API响应类型
- [ ] 移除any类型使用

### 2. 代码重构
- [ ] ChatScreen组件拆分（过大）
- [ ] 提取自定义hooks
- [ ] WebSocket服务单例优化

### 3. 文档完善
- [ ] API文档
- [ ] 组件使用文档
- [ ] 部署文档

---

## 🎯 Milestone

### M1: 核心功能完善 (本周)
- [x] 服务端session管理
- [x] 分页加载
- [x] 消息解析修复
- [ ] 编译v1.0.15测试
- [ ] 键盘问题解决

### M2: 稳定性提升 (下周)
- [ ] 错误处理完善
- [ ] 重连机制
- [ ] 性能优化
- [ ] 基础测试覆盖

### M3: 体验优化 (待定)
- [ ] UI/UX打磨
- [ ] 动画效果
- [ ] 暗色模式
- [ ] 功能增强

---

## 📝 注意事项

1. **编译前必读**:
   - 确保 `mobile/app.json` 版本号正确 (当前1.0.15)
   - 确保所有依赖已安装 `npm install`
   - 检查 `android/` 目录是否存在（没有则运行 `npx expo prebuild`）

2. **测试前准备**:
   - 服务器正常运行 (pm2 status)
   - 项目路径存在session文件
   - 网络连接正常

3. **提交代码规范**:
   - 使用语义化提交消息
   - 包含 Co-Authored-By: Claude
   - 重要修改更新PROGRESS.md

---

**最后更新**: 2026-01-26
**当前版本**: v1.0.15 (待编译)
**服务器**: 47.99.75.219:3001 (运行中)
