module.exports = {
  apps: [{
    name: 'desktop-client',
    script: 'npm',
    args: 'start',
    cwd: '/home/ecs-user/claude-app/desktop',
    env: {
      SERVER_URL: 'ws://localhost:3001/ws',
      DEVICE_ID: 'desktop-219',
      ENCRYPTION_ENABLED: 'false',
      CLAUDE_PATH: '/home/ecs-user/.local/share/claude/versions/2.1.17',
      WORK_DIR: '/home/ecs-user/workspace',
      ANTHROPIC_AUTH_TOKEN: 'apikey-45d1474107fb441a9523e40cbbe5b218',
      ANTHROPIC_BASE_URL: 'https://api.atlascloud.ai',
      ANTHROPIC_MODEL: 'anthropic/claude-sonnet-4.5-20250929'
    },
    max_memory_restart: '500M',
    error_file: '/home/ecs-user/.pm2/logs/desktop-client-error.log',
    out_file: '/home/ecs-user/.pm2/logs/desktop-client-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
