module.exports = {
  apps: [
    {
      name: 'studo-bot',
      script: './node_modules/.bin/tsx',
      args: './src/bot.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
    },
  ],
};
