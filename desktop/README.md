# Claude Code Desktop Client

Desktop client that spawns Claude CLI locally and allows control from mobile app.

## Features

- **Local Claude Execution**: Runs Claude CLI on your desktop, not on remote server
- **ACP Protocol**: Full support for Agent Client Protocol (stream-json)
- **Device Switching**: Seamless handoff between mobile and desktop control
- **Session History Sync**: All conversations synced to server with encryption
- **Permission Handling**: Mobile app can approve/deny tool uses in real-time

## Architecture

```
Mobile App ←→ Server (routing) ←→ Desktop Client ←→ Claude CLI
```

The server acts as a message router, not an executor. Claude runs locally on your desktop.

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Configure your server URL and database credentials
3. Optionally set custom Claude CLI path

## Usage

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start

# Build TypeScript
npm run build
```

## How It Works

1. Desktop client connects to server via WebSocket
2. When mobile sends a message, server routes it to desktop
3. Desktop spawns/manages Claude CLI process using ACP protocol
4. Claude output is streamed back through server to mobile
5. Permission requests are forwarded to mobile for approval
6. All messages are encrypted and synced to database

## Requirements

- Node.js 18+
- Claude Code CLI installed (https://claude.ai/download)
- Access to server and database
