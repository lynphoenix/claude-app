#!/usr/bin/env node

/**
 * 模拟手机客户端 - 测试消息路由
 */

import WebSocket from 'ws';
import { randomBytes } from 'crypto';

const SERVER_URL = 'ws://47.99.75.219:3001/ws';
const DEVICE_ID = 'mobile-test-simulator';
const SESSION_ID = randomBytes(16).toString('hex');

console.log('📱 模拟手机客户端启动...');
console.log(`   Server: ${SERVER_URL}`);
console.log(`   Device ID: ${DEVICE_ID}`);
console.log(`   Session ID: ${SESSION_ID}\n`);

const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
  console.log('✅ 已连接到服务器\n');

  // Step 1: 注册为移动设备
  console.log('📤 Step 1: 注册为mobile设备');
  ws.send(JSON.stringify({
    type: 'register',
    deviceId: DEVICE_ID,
    deviceType: 'mobile'
  }));

  // Step 2: 初始化会话
  setTimeout(() => {
    console.log('📤 Step 2: 初始化会话');
    ws.send(JSON.stringify({
      type: 'init',
      sessionId: SESSION_ID
    }));
  }, 1000);

  // Step 3: 发送测试消息
  setTimeout(() => {
    console.log('📤 Step 3: 发送用户消息\n');
    console.log('   内容: "Hello from mobile simulator! Please respond."\n');
    ws.send(JSON.stringify({
      type: 'message',
      id: randomBytes(16).toString('hex'),
      sessionId: SESSION_ID,
      content: 'Hello from mobile simulator! Please respond with a simple greeting.',
      projectPath: '/tmp/test-project'
    }));
  }, 2000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 收到服务器消息:');
    console.log('   类型:', message.type);

    switch (message.type) {
      case 'registered':
        console.log('   ✅ 设备注册成功\n');
        break;

      case 'ready':
        console.log('   ✅ 会话已就绪\n');
        break;

      case 'messageAck':
        console.log('   ✅ 消息已送达\n');
        break;

      case 'responseChunk':
        console.log('   💬 收到Claude响应:');
        console.log('   ', message.content);
        console.log('');
        break;

      case 'permissionRequest':
        console.log('   🔐 权限请求:');
        console.log('     工具:', message.toolName);
        console.log('     参数:', JSON.stringify(message.input, null, 2));
        console.log('   ✅ 自动批准\n');

        // 自动批准权限
        ws.send(JSON.stringify({
          type: 'permission-response',
          sessionId: SESSION_ID,
          requestId: message.requestId,
          approved: true,
          reason: 'Auto approved by simulator'
        }));
        break;

      case 'error':
        console.error('   ❌ 错误:', message.error);
        break;

      default:
        console.log('   内容:', JSON.stringify(message, null, 2));
    }
  } catch (e) {
    console.error('解析消息失败:', e);
  }
});

ws.on('close', () => {
  console.log('\n❌ 与服务器断开连接');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket错误:', error);
  process.exit(1);
});

// 30秒后自动关闭
setTimeout(() => {
  console.log('\n⏱️  测试时间到，关闭连接');
  ws.close();
}, 30000);
