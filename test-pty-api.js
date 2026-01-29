const WebSocket = require('ws');

const ws = new WebSocket('ws://47.99.75.219:3001/ws');

ws.on('open', function open() {
  console.log('✅ 已连接到服务器');

  // 1. 初始化
  console.log('\n[1/3] 发送init消息...');
  ws.send(JSON.stringify({
    type: 'init',
    projectPath: '/home/ecs-user/code'
  }));

  // 等待2秒后发送planCommands
  setTimeout(() => {
    console.log('\n[2/3] 请求Claude生成执行计划...');
    ws.send(JSON.stringify({
      type: 'planCommands',
      id: 'test-plan-1',
      content: '帮我创建一个test-pty.txt文件，内容是"Hello PTY"'
    }));
  }, 2000);
});

ws.on('message', function message(data) {
  const msg = JSON.parse(data.toString());
  console.log(`\n收到消息 [${msg.type}]:`, JSON.stringify(msg, null, 2));

  // 收到commandPlan后，询问是否执行
  if (msg.type === 'commandPlan') {
    console.log('\n📋 Claude建议执行以下命令:');
    msg.commands.forEach((cmd, idx) => {
      console.log(`  ${idx + 1}. ${cmd}`);
    });
    console.log(`\n说明: ${msg.explanation}`);

    // 自动确认执行（测试）
    setTimeout(() => {
      console.log('\n[3/3] 确认执行命令...');
      ws.send(JSON.stringify({
        type: 'executeCommands',
        id: 'test-exec-1',
        commands: msg.commands,
        projectPath: '/home/ecs-user/code'
      }));
    }, 2000);
  }

  // 收到终端输出
  if (msg.type === 'terminalOutput') {
    console.log('\n🖥️  Terminal输出:', msg.data);
  }

  // 命令执行完成
  if (msg.type === 'terminalExit') {
    console.log(`\n✅ Terminal退出，代码: ${msg.exitCode}`);

    // 验证文件是否创建
    setTimeout(() => {
      console.log('\n验证结果...');
      ws.close();
    }, 1000);
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket错误:', err.message);
});

ws.on('close', function close() {
  console.log('\n👋 连接已关闭');
  process.exit(0);
});
