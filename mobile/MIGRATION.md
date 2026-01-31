# Mobile App 适配新架构 - 更新日志

## 日期：2026-01-31

## 概述
将Mobile App的WebSocket客户端适配到新的三层架构（Mobile ↔ Server ↔ Desktop Client ↔ Claude CLI）。

## 主要变更

### 1. WebSocket服务更新 (`src/services/websocket.ts`)

#### 新增功能
- **设备管理**
  - 添加`deviceId`：唯一标识mobile设备
  - 添加`sessionId`：会话标识符
  - 添加`isRegistered`：设备注册状态跟踪

- **连接流程优化**
  ```
  旧流程: connect() → 直接发送init
  新流程: connect() → register → registered → init → ready → 可发送消息
  ```

#### 协议适配
- **注册阶段**：连接后立即发送`register`消息注册为mobile设备
- **初始化阶段**：注册成功后发送`init`消息初始化会话
- **消息发送**：所有用户消息必须包含`sessionId`

#### 新增消息类型处理
- `registered`: 设备注册成功
- `permissionRequest`: Claude请求工具权限
- `messageAck`: 消息送达确认

#### 新增方法
- `getSessionId()`: 获取当前会话ID
- `getDeviceId()`: 获取设备ID
- `handlePermissionRequest()`: 处理权限请求（默认自动批准）

### 2. 类型定义更新 (`src/types/index.ts`)

#### 新增消息类型
- `registered`: 设备注册成功响应
- `permissionRequest`: 权限请求

#### 扩展消息接口
```typescript
export interface WSMessage {
  // ... 原有字段
  requestId?: string;  // 权限请求ID
  toolName?: string;   // 工具名称
  input?: any;         // 工具输入参数
}
```

## 协议对比

### 旧协议流程
```
1. WebSocket连接
2. 发送 { type: 'init', projectPath: '...' }
3. 接收 { type: 'ready' }
4. 发送 { type: 'message', content: '...', id: '...' }
5. 接收 { type: 'responseChunk', content: '...' }
```

### 新协议流程
```
1. WebSocket连接
2. 发送 { type: 'register', deviceId: '...', deviceType: 'mobile' }
3. 接收 { type: 'registered' }
4. 发送 { type: 'init', sessionId: '...' }
5. 接收 { type: 'ready' }
6. 发送 { type: 'message', id: '...', sessionId: '...', content: '...' }
7. 接收 { type: 'messageAck' }
8. 接收 { type: 'responseChunk', content: '...' }
9. (可选) 接收 { type: 'permissionRequest', ... }
   → 发送 { type: 'permission-response', approved: true }
```

## 向后兼容性

- ⚠️ **不兼容旧Server**：新协议与旧Server完全不兼容
- ✅ **渐进式部署**：可与旧版App共存，通过Server URL区分

## 待实现功能

### 高优先级
- [ ] 持久化`deviceId`到AsyncStorage
- [ ] 权限请求UI（当前为自动批准）
- [ ] 会话恢复机制

### 中优先级
- [ ] 历史消息加载（需Server支持）
- [ ] 离线消息队列
- [ ] 连接质量监控

### 低优先级
- [ ] E2E加密（Server和Desktop已预留接口）
- [ ] 多设备同步
- [ ] 会话共享

## 测试计划

### 单元测试
- [ ] WebSocket连接流程
- [ ] 消息序列化/反序列化
- [ ] 会话ID生成

### 集成测试
- [x] Mobile模拟器 → Server → Desktop → Claude CLI（已验证）
- [ ] 真实Mobile App → Server → Desktop → Claude CLI
- [ ] 权限请求完整流程
- [ ] 错误恢复场景

### 性能测试
- [ ] 消息延迟测试
- [ ] 并发用户测试
- [ ] 长连接稳定性测试

## 部署步骤

1. **Server部署** (已完成)
   - 部署新的消息路由Server到47.99.75.219:3001

2. **Desktop Client部署** (已完成)
   - 在本地Mac运行Desktop Client
   - 配置连接到新Server

3. **Mobile App部署** (进行中)
   - 编译APK
   - 安装到测试设备
   - 配置Server URL
   - 验证完整流程

## 回滚计划

如需回滚到旧架构：
1. 停止Desktop Client
2. 重启旧版Server
3. Mobile App修改Server URL指向旧Server
4. 验证功能正常

## 已知问题

1. **权限请求自动批准**
   - 当前所有权限请求自动批准
   - 建议：添加用户确认UI

2. **历史消息功能缺失**
   - `loadMoreHistory`在新架构下未实现
   - 需要Desktop Client或Server提供历史查询API

3. **会话持久化**
   - 当前会话ID仅在内存中
   - App重启后会创建新会话

## 参考

- Server实现：`/server/src/index.ts`
- Desktop Client实现：`/desktop/src/index.ts`
- 协议定义：参见各组件的`types.ts`
- 测试模拟器：`/test-mobile-simulator.mjs`

## 更新人员
- linyining
- 辅助工具：Claude Code

---

**下一步**: 编译Mobile App APK并在真实设备上测试完整流程
