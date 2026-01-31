# Mobile App 测试指南

## 版本信息
- **App版本**: 1.0.29
- **构建日期**: 2026-01-31
- **架构**: 新三层架构 (Mobile ↔ Server ↔ Desktop ↔ Claude)

## 测试环境

### 服务器配置
- **Server URL**: `ws://47.99.75.219:3001`
- **Server状态**: ✅ 运行中
- **端口**: 3001

### Desktop Client配置
- **运行位置**: 本地Mac (192.168.x.x)
- **状态**: ✅ 已连接到Server
- **Claude版本**: 2.1.27

## 安装步骤

### 1. 下载APK
```bash
# EAS Build完成后会提供下载链接
# 或从mobile目录获取构建产物
```

### 2. 安装到设备
```bash
# 方法1: 通过ADB安装
adb install claude-code-v29.apk

# 方法2: 通过浏览器下载并安装（需要允许未知来源）
```

### 3. 配置App
1. 打开App
2. 进入设置（Settings）
3. 配置Server URL: `ws://47.99.75.219:3001`
4. 保存设置

## 测试检查清单

### 基础连接测试
- [ ] App启动正常
- [ ] 连接状态显示"连接中"
- [ ] 连接状态变为"已连接"
- [ ] 无错误提示

### 消息发送测试
- [ ] 输入简单消息："Hello"
- [ ] 消息显示发送状态
- [ ] 收到"消息已送达"确认
- [ ] 收到Claude的响应
- [ ] 响应内容正确显示

### 完整对话测试
- [ ] 发送："What is 2+2?"
- [ ] 收到正确答案："4"
- [ ] 响应速度合理（<5秒）

### 工具使用测试（权限请求）
- [ ] 发送："List files in current directory"
- [ ] 收到权限请求提示（如果实现了UI）
- [ ] 或自动批准并执行（当前默认行为）
- [ ] 收到文件列表结果

### 会话持久性测试
- [ ] 发送多条消息
- [ ] 验证Claude记住上下文
- [ ] 例如："My name is John" → "What's my name?"

### 错误恢复测试
- [ ] 断开WiFi
- [ ] 观察重连机制
- [ ] 重新连接WiFi
- [ ] 验证自动重连

### 性能测试
- [ ] 响应延迟 < 5秒
- [ ] 无明显卡顿
- [ ] 内存占用正常
- [ ] 长时间运行稳定

## 预期行为

### 成功连接流程
```
1. 显示"连接中..."
2. 设备注册 (register)
3. 收到注册确认 (registered)
4. 会话初始化 (init)
5. 收到就绪确认 (ready)
6. 显示"已连接"
```

### 消息流程
```
1. 用户输入消息
2. 显示"发送中..."
3. 收到"消息已送达"
4. Claude处理中...
5. 收到响应chunks
6. 逐步显示响应内容
7. 响应完成
```

### 权限请求流程（如果触发）
```
1. Claude需要执行工具（如Bash）
2. 收到权限请求
3. 当前：自动批准
4. 未来：显示确认对话框
5. 继续执行并返回结果
```

## 调试信息

### 查看日志
在App中：
- 检查控制台输出（如果有开发者模式）
- 查看连接状态指示器

在Server端：
```bash
ssh root@47.99.75.219
pm2 logs claude-router
```

在Desktop Client端：
```bash
tail -f /tmp/desktop-client.log
```

### 常见问题

#### 1. 连接失败
**症状**: 一直显示"连接中..."
**排查**:
- 检查Server URL是否正确
- 检查网络连接
- 检查Server是否运行：`pm2 status`
- 检查防火墙设置

#### 2. 消息无响应
**症状**: 消息发送成功但无响应
**排查**:
- 检查Desktop Client是否运行：`ps aux | grep tsx`
- 查看Desktop Client日志：`tail /tmp/desktop-client.log`
- 检查Claude CLI是否可用：`claude --version`

#### 3. 响应延迟高
**症状**: 响应时间 > 10秒
**排查**:
- 检查网络延迟：`ping 47.99.75.219`
- 检查Desktop Client性能
- 查看Claude API调用时间

## 测试数据

### 示例对话
```
User: Hello!
Expected: "Hello! How can I help you today?"

User: What is TypeScript?
Expected: TypeScript的详细解释

User: Calculate 123 * 456
Expected: "56088"

User: Tell me a joke
Expected: 一个笑话
```

### 工具测试命令
```
User: List files in the current directory
Expected: 文件列表（需要权限批准）

User: What is my IP address?
Expected: IP地址信息

User: Create a file called test.txt with content "Hello World"
Expected: 文件创建成功（需要权限批准）
```

## 成功标准

### 必须通过
- [x] 连接成功
- [x] 发送消息
- [x] 接收响应
- [x] 基本对话功能

### 应该通过
- [ ] 权限请求处理
- [ ] 会话持久性
- [ ] 错误恢复
- [ ] 性能达标

### 可选测试
- [ ] 长对话测试（50+条消息）
- [ ] 并发消息测试
- [ ] 网络切换测试
- [ ] 后台运行测试

## 反馈

测试完成后，记录：
1. **通过的测试项**
2. **失败的测试项**
3. **遇到的问题**
4. **性能数据**（响应时间、内存占用等）
5. **建议改进**

---

**联系**: linyining
**文档版本**: 1.0
**最后更新**: 2026-01-31
