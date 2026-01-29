# PTY模式使用说明

## 新的架构

### 原来（Main分支）：
```
用户消息 → 服务端 → Claude直接执行 → 返回结果
```
**问题**：看不到Claude执行了什么命令，无法确认

### 现在（Dev分支）：
```
用户消息 → planCommands → Claude生成命令 → 显示给用户确认
                                              ↓
                                        executeCommands
                                              ↓
                                      PTY中执行命令 → 实时输出
```
**优势**：命令可见、可确认、可编辑

---

## WebSocket消息协议

### 1. 请求Claude生成执行计划

**客户端发送**：
```json
{
  "type": "planCommands",
  "id": "msg-123",
  "content": "帮我删除temp目录"
}
```

**服务端返回**：
```json
{
  "type": "commandPlan",
  "messageId": "msg-123",
  "commands": ["rm -rf temp/"],
  "explanation": "这个命令会递归删除temp目录及其所有内容"
}
```

### 2. 用户确认后执行命令

**客户端发送**：
```json
{
  "type": "executeCommands",
  "id": "exec-456",
  "commands": ["rm -rf temp/"],
  "projectPath": "/home/ecs-user/code"
}
```

**服务端返回**：
```json
{
  "type": "commandsExecuting",
  "messageId": "exec-456"
}
```

### 3. 实时终端输出

**服务端推送**：
```json
{
  "type": "terminalOutput",
  "data": "Removing temp/\nDone.\n"
}
```

### 4. 终端交互（如输入密码）

**服务端推送**：
```json
{
  "type": "terminalOutput",
  "data": "[sudo] password: "
}
```

**客户端发送密码**：
```json
{
  "type": "terminalInput",
  "input": "mypassword\n"
}
```

---

## 移动端UI实现示例

### 步骤1：显示命令预览

```tsx
// 收到commandPlan消息
const CommandPreviewDialog = ({ commands, explanation }) => (
  <View style={styles.dialog}>
    <Text style={styles.title}>Claude建议执行：</Text>

    {commands.map((cmd, idx) => (
      <View key={idx} style={styles.commandRow}>
        <Text style={styles.commandNumber}>{idx + 1}.</Text>
        <TextInput
          style={styles.commandInput}
          value={cmd}
          editable={true}  // 允许用户编辑
        />
      </View>
    ))}

    <Text style={styles.explanation}>{explanation}</Text>

    <View style={styles.buttons}>
      <Button title="取消" onPress={onCancel} />
      <Button title="执行" onPress={onConfirm} />
    </View>
  </View>
);
```

### 步骤2：显示终端输出

```tsx
// 收到terminalOutput消息
const TerminalOutput = ({ output }) => (
  <ScrollView style={styles.terminal}>
    <Text style={styles.terminalText}>{output}</Text>
  </ScrollView>
);
```

### 步骤3：处理交互输入

```tsx
// 检测到需要输入（如密码）
const [waitingInput, setWaitingInput] = useState(false);
const [inputPrompt, setInputPrompt] = useState('');

useEffect(() => {
  if (wsMessage.type === 'terminalOutput') {
    const data = wsMessage.data;

    // 检测常见的输入提示
    if (data.includes('password:') || data.includes('[y/n]')) {
      setWaitingInput(true);
      setInputPrompt(data);
    }
  }
}, [wsMessage]);

// 显示输入框
{waitingInput && (
  <TextInput
    placeholder={inputPrompt}
    secureTextEntry={inputPrompt.includes('password')}
    onSubmitEditing={(e) => {
      ws.send(JSON.stringify({
        type: 'terminalInput',
        input: e.nativeEvent.text + '\n'
      }));
      setWaitingInput(false);
    }}
  />
)}
```

---

## 完整流程示例

### 场景：用户说"帮我安装nginx"

1. **用户发送消息**
   ```
   Mobile → Server: {type: "planCommands", content: "帮我安装nginx"}
   ```

2. **Claude生成计划**
   ```
   Server → Mobile: {
     type: "commandPlan",
     commands: [
       "sudo apt update",
       "sudo apt install nginx -y",
       "sudo systemctl start nginx"
     ],
     explanation: "这些命令会更新包列表、安装nginx并启动服务"
   }
   ```

3. **移动端显示预览**
   ```
   ┌────────────────────────────┐
   │ Claude建议执行：           │
   │ 1. sudo apt update         │
   │ 2. sudo apt install nginx  │
   │ 3. sudo systemctl start    │
   │                            │
   │ 说明：更新、安装、启动     │
   │                            │
   │ [取消]        [执行]       │
   └────────────────────────────┘
   ```

4. **用户点击[执行]**
   ```
   Mobile → Server: {
     type: "executeCommands",
     commands: ["sudo apt update", "sudo apt install nginx -y", ...]
   }
   ```

5. **实时显示输出**
   ```
   Server → Mobile: {type: "terminalOutput", data: "Hit:1 http://..."}
   Server → Mobile: {type: "terminalOutput", data: "Reading package lists..."}
   Server → Mobile: {type: "terminalOutput", data: "[sudo] password: "}
   ```

6. **用户输入密码**
   ```
   Mobile → Server: {type: "terminalInput", input: "mypass\n"}
   ```

7. **继续执行**
   ```
   Server → Mobile: {type: "terminalOutput", data: "Installing nginx..."}
   Server → Mobile: {type: "terminalOutput", data: "nginx is now running"}
   Server → Mobile: {type: "terminalExit", exitCode: 0}
   ```

---

## 安全特性

1. **命令可见** - 用户知道要执行什么
2. **可编辑** - 用户可以修改命令
3. **可取消** - 随时可以停止
4. **风险提示** - 检测到危险命令（rm -rf /等）时高亮警告

---

## 与Main分支对比

| 特性 | Main分支 | Dev分支（PTY） |
|-----|---------|---------------|
| 命令可见性 | ❌ | ✅ |
| 用户确认 | ❌ | ✅ |
| 交互支持 | ❌ | ✅（密码等） |
| 命令编辑 | ❌ | ✅ |
| 实时输出 | ❌ | ✅ |
| 安全性 | ⚠️ 低 | ✅ 高 |

---

## 下一步

1. **测试服务端** - 部署到219测试
2. **实现移动端UI** - 添加命令预览对话框
3. **完善交互处理** - 密码输入、确认提示等
4. **添加安全检测** - 危险命令警告
