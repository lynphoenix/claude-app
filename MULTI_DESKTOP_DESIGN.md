# 多设备管理系统 - 设计文档

## 🎯 目标

在现有80%完成的三层架构基础上，新增多设备管理功能：
- 支持多个Desktop Client（219服务器、Mac本机、H100、Windows等）
- 每个Desktop有独立的根目录限制
- 智能Session检测和恢复
- 自动同步Claude CLI的session

## 📊 架构设计

### 整体架构（保持不变）
```
Mobile App → Server (消息路由) → Desktop Client → Claude CLI
```

### 扩展点

#### 1. Server端
- 管理多个Desktop Client注册
- 根据Mobile选择路由到对应Desktop
- 设备列表API

#### 2. Desktop Client端
- 根目录配置和权限检查
- Session检测和历史加载
- 项目路径验证

#### 3. Mobile App端
- Desktop选择器UI
- 项目路径输入（带根目录限制）
- Session历史显示

---

## 🏗️ 模块设计

### Module 1: Desktop注册增强 (Server)

**文件**: `server/src/deviceManager.ts`

**新增字段**:
```typescript
interface Desktop {
  deviceId: string;         // 'desktop-219', 'desktop-mac'
  type: 'desktop';
  name: string;             // '219服务器', 'Mac本机'
  rootDir: string;          // '~/code', '~/Documents'
  status: 'online' | 'offline';
  lastSeen: Date;
  ws: WebSocket;
}
```

**新增方法**:
```typescript
- listAllDesktops(): Desktop[]
- getDesktopById(id): Desktop | null
- getDesktopInfo(id): { name, rootDir, status }
```

**API端点**:
```
GET /api/desktops
→ { desktops: [{ id, name, rootDir, status }] }
```

---

### Module 2: Desktop配置 (Desktop Client)

**文件**: `desktop/src/config.ts`

**新增配置**:
```typescript
export const config = {
  // 现有配置...
  serverUrl: process.env.SERVER_URL,
  deviceId: process.env.DEVICE_ID,
  claudePath: process.env.CLAUDE_PATH,

  // 新增
  name: process.env.DESKTOP_NAME || hostname(),
  rootDir: process.env.ROOT_DIR || process.cwd(),
  description: process.env.DESCRIPTION || ''
};
```

**环境变量示例**:
```env
# 219服务器
DEVICE_ID=desktop-219
DESKTOP_NAME=219服务器
ROOT_DIR=/home/ecs-user/code
DESCRIPTION=阿里云服务器，用于Android构建

# Mac本机
DEVICE_ID=desktop-mac
DESKTOP_NAME=Mac本机
ROOT_DIR=/Users/linyining/Documents/code
DESCRIPTION=本地开发环境
```

---

### Module 3: 路径权限检查 (Desktop Client)

**文件**: `desktop/src/pathValidator.ts` (新建)

**功能**:
```typescript
export class PathValidator {
  constructor(private rootDir: string) {}

  /**
   * 验证路径是否在根目录下
   */
  validate(requestedPath: string): {
    valid: boolean;
    error?: string;
    resolved?: string;
  } {
    const resolved = path.resolve(requestedPath);
    const root = path.resolve(this.rootDir);

    if (!resolved.startsWith(root)) {
      return {
        valid: false,
        error: `Access denied: ${requestedPath} is outside root directory ${this.rootDir}`
      };
    }

    return { valid: true, resolved };
  }

  /**
   * 列出根目录下的项目
   */
  async listProjects(): Promise<string[]> {
    // 扫描rootDir下所有包含.claude目录的文件夹
    const projects = [];
    // 递归查找...
    return projects;
  }
}
```

**集成点**: 在收到user-message时验证projectPath

---

### Module 4: Session检测 (Desktop Client)

**文件**: `desktop/src/sessionDetector.ts` (新建)

**功能**:
```typescript
export class SessionDetector {
  /**
   * 检测项目目录是否有现有session
   */
  async detectSession(projectPath: string): Promise<{
    hasSession: boolean;
    sessionId?: string;
    lastActivity?: Date;
    messageCount?: number;
  }> {
    const claudeDir = path.join(projectPath, '.claude');

    if (!fs.existsSync(claudeDir)) {
      return { hasSession: false };
    }

    // 查找session文件
    const sessionFiles = fs.readdirSync(claudeDir)
      .filter(f => f.match(/^[a-f0-9-]+$/))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(claudeDir, a));
        const statB = fs.statSync(path.join(claudeDir, b));
        return statB.mtimeMs - statA.mtimeMs;
      });

    if (sessionFiles.length === 0) {
      return { hasSession: false };
    }

    const latestSessionId = sessionFiles[0];
    const sessionPath = path.join(claudeDir, latestSessionId);

    // 读取session信息
    const messages = await this.parseSessionHistory(sessionPath);

    return {
      hasSession: true,
      sessionId: latestSessionId,
      lastActivity: new Date(fs.statSync(sessionPath).mtime),
      messageCount: messages.length
    };
  }

  /**
   * 解析session历史
   */
  async parseSessionHistory(sessionPath: string): Promise<Message[]> {
    const messages: Message[] = [];
    const files = fs.readdirSync(sessionPath);

    for (const file of files.sort()) {
      const content = fs.readFileSync(
        path.join(sessionPath, file),
        'utf-8'
      );

      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'user' || msg.type === 'assistant') {
            messages.push({
              role: msg.type,
              content: this.extractContent(msg.message.content),
              timestamp: msg.timestamp
            });
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    return messages;
  }

  private extractContent(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    }
    return '';
  }
}
```

---

### Module 5: Server智能路由

**文件**: `server/src/index.ts`

**修改**: 更新message处理逻辑

```typescript
case 'message':
  // 获取消息中指定的Desktop ID
  const targetDesktopId = message.desktopId;

  if (!targetDesktopId) {
    // 没有指定Desktop，返回选择列表
    ws.send(JSON.stringify({
      type: 'select-desktop-required',
      desktops: deviceManager.listAllDesktops()
    }));
    break;
  }

  // 验证Desktop是否在线
  const desktop = deviceManager.getDesktopById(targetDesktopId);
  if (!desktop || desktop.status === 'offline') {
    ws.send(JSON.stringify({
      type: 'error',
      error: `Desktop ${targetDesktopId} is not available`
    }));
    break;
  }

  // 路由到指定Desktop
  const sent = deviceManager.sendToDevice(targetDesktopId, {
    type: 'user-message',
    data: {
      sessionId: message.sessionId,
      content: message.content,
      projectPath: message.projectPath
    }
  });

  if (sent) {
    ws.send(JSON.stringify({
      type: 'messageAck',
      id: message.id
    }));
  }
  break;
```

**新增消息类型**:
```typescript
// Mobile → Server
{
  type: 'get-desktops'
}

// Server → Mobile
{
  type: 'desktops-list',
  desktops: [
    { id: 'desktop-219', name: '219服务器', rootDir: '~/code', status: 'online' },
    { id: 'desktop-mac', name: 'Mac本机', rootDir: '~/Documents', status: 'online' }
  ]
}

// Mobile → Server (发送消息时)
{
  type: 'message',
  desktopId: 'desktop-219',  // 新增字段
  sessionId: '...',
  content: '...',
  projectPath: '...'
}
```

---

### Module 6: Mobile App Desktop选择器

**文件**: `mobile/src/components/DesktopSelector.tsx` (新建)

**UI设计**:
```tsx
export function DesktopSelector({
  desktops,
  selectedId,
  onSelect
}: DesktopSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>选择服务器</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {desktops.map(desktop => (
          <TouchableOpacity
            key={desktop.id}
            style={[
              styles.desktopCard,
              selectedId === desktop.id && styles.selected
            ]}
            onPress={() => onSelect(desktop)}
          >
            <View style={styles.statusDot}>
              {desktop.status === 'online' ? '🟢' : '⚫'}
            </View>

            <Text style={styles.name}>{desktop.name}</Text>

            <Text style={styles.rootDir}>
              📁 {desktop.rootDir}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
```

**集成到ChatScreen**:
```tsx
const [selectedDesktop, setSelectedDesktop] = useState<Desktop | null>(null);
const [desktops, setDesktops] = useState<Desktop[]>([]);

// 获取Desktop列表
useEffect(() => {
  ws.send({ type: 'get-desktops' });
}, []);

// 发送消息时带上desktopId
const handleSend = (text: string) => {
  if (!selectedDesktop) {
    Alert.alert('请先选择服务器');
    return;
  }

  ws.sendMessage({
    content: text,
    desktopId: selectedDesktop.id,
    projectPath: currentProjectPath
  });
};
```

---

### Module 7: Project路径选择增强

**文件**: `mobile/src/components/ProjectSelector.tsx`

**新增功能**:
- 显示当前Desktop的根目录
- 路径输入验证（必须在根目录下）
- 显示项目列表（从Desktop获取）

```tsx
<View>
  <Text>当前服务器: {selectedDesktop.name}</Text>
  <Text>根目录: {selectedDesktop.rootDir}</Text>

  <TextInput
    placeholder={`项目路径（相对于 ${selectedDesktop.rootDir}）`}
    value={projectPath}
    onChangeText={setProjectPath}
  />

  {/* 或者选择已有项目 */}
  <FlatList
    data={availableProjects}
    renderItem={({ item }) => (
      <TouchableOpacity onPress={() => selectProject(item)}>
        <Text>{item.name}</Text>
        <Text>{item.path}</Text>
      </TouchableOpacity>
    )}
  />
</View>
```

---

### Module 8: Session历史显示

**文件**: `mobile/src/screens/ChatScreen.tsx`

**新增逻辑**:
```typescript
// 当选择project后，检查session
const handleSelectProject = async (projectPath: string) => {
  setCurrentProjectPath(projectPath);

  // 请求Desktop检测session
  ws.send({
    type: 'detect-session',
    desktopId: selectedDesktop.id,
    projectPath: projectPath
  });
};

// 收到session信息
ws.onMessage((msg) => {
  if (msg.type === 'session-detected') {
    if (msg.hasSession) {
      // 显示提示：发现已有session
      Alert.alert(
        '发现已有对话',
        `上次活动: ${msg.lastActivity}\n消息数: ${msg.messageCount}`,
        [
          { text: '新建对话', onPress: () => createNewSession() },
          { text: '继续对话', onPress: () => loadSession(msg.sessionId) }
        ]
      );
    } else {
      // 新建session
      createNewSession();
    }
  }

  if (msg.type === 'session-history') {
    // 显示历史消息
    setMessages(msg.history);
  }
});
```

---

## 📋 实施步骤

### Phase 1: Server + Desktop基础（2天）

**Day 1: Server端**
- [ ] Module 1: Desktop注册增强
- [ ] Module 5: Server智能路由
- [ ] 添加 /api/desktops 端点
- [ ] 更新消息协议文档

**Day 2: Desktop Client端**
- [ ] Module 2: Desktop配置增强
- [ ] Module 3: 路径权限检查
- [ ] 更新ecosystem.config.cjs模板
- [ ] 测试多Desktop注册

### Phase 2: Session管理（2天）

**Day 3: Session检测**
- [ ] Module 4: Session检测实现
- [ ] Session历史解析
- [ ] 测试session检测逻辑

**Day 4: 集成和测试**
- [ ] Desktop Client集成PathValidator和SessionDetector
- [ ] 测试路径权限检查
- [ ] 测试session检测

### Phase 3: Mobile App UI（2-3天）

**Day 5: Desktop选择**
- [ ] Module 6: DesktopSelector组件
- [ ] 集成到ChatScreen
- [ ] WebSocket消息协议更新

**Day 6: Project选择增强**
- [ ] Module 7: ProjectSelector增强
- [ ] 路径验证UI
- [ ] 项目列表显示

**Day 7: Session历史**
- [ ] Module 8: Session历史显示
- [ ] 新建/继续对话选择
- [ ] 端到端测试

### Phase 4: 优化和文档（1天）

**Day 8: 收尾**
- [ ] 错误处理完善
- [ ] 用户提示优化
- [ ] 更新DEPLOYMENT.md
- [ ] 更新README.md
- [ ] 录制演示视频

---

## 🧪 测试清单

### 单元测试
- [ ] PathValidator.validate()
- [ ] SessionDetector.detectSession()
- [ ] DeviceManager.listAllDesktops()

### 集成测试
- [ ] 多Desktop注册
- [ ] Desktop选择和切换
- [ ] 路径权限检查
- [ ] Session检测和恢复
- [ ] 历史消息加载

### 端到端测试
- [ ] 219服务器：选择Desktop → 选择项目 → 发送消息
- [ ] Mac本机：选择Desktop → 选择项目 → 发送消息
- [ ] 路径越权测试（应该被拒绝）
- [ ] Session恢复测试
- [ ] 电脑运行 claude -c 同步测试

---

## 📊 进度跟踪

| Phase | 预计 | 实际 | 状态 |
|-------|------|------|------|
| Phase 1 | 2天 | - | ⏳ 待开始 |
| Phase 2 | 2天 | - | ⏳ 待开始 |
| Phase 3 | 2-3天 | - | ⏳ 待开始 |
| Phase 4 | 1天 | - | ⏳ 待开始 |

---

**创建时间**: 2026-02-01
**预计完成**: 2026-02-08
**负责人**: linyining + Claude
