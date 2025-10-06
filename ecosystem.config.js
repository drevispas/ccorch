/**
 * PM2 Ecosystem Configuration
 *
 * Purpose: Production process management configuration for CCOrch
 * Usage: pm2 start ecosystem.config.js
 *
 * Features:
 * - Automatic restart on crash
 * - Log management
 * - Environment-specific configurations
 * - Graceful shutdown handling
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'ccorch',

      // Script to run
      script: './dist/server.js',

      // Number of instances (1 for SQLite, can scale with Redis/Postgres)
      instances: 1,

      // Cluster mode (use 'fork' for SQLite to avoid DB locking issues)
      exec_mode: 'fork',

      // Auto-restart on crash
      autorestart: true,

      // Watch for file changes (disable in production)
      watch: false,

      // Maximum memory before restart (1GB)
      max_memory_restart: '1G',

      // Environment variables for production
      env_production: {
        NODE_ENV: 'production',
        // Other env vars should be in .env file
      },

      // Environment variables for development
      env_development: {
        NODE_ENV: 'development',
      },

      // Log configuration
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // Prefix logs with timestamp

      // Merge logs from all instances (useful if instances > 1)
      merge_logs: true,

      // Log date format
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Graceful shutdown
      kill_timeout: 5000, // Wait 5s before force kill
      wait_ready: true, // Wait for app to emit 'ready' signal

      // Restart delay (avoid rapid restart loops)
      min_uptime: 10000, // App must run for 10s to be considered "started"
      max_restarts: 10, // Max restarts within 1 minute

      // Process management
      pid_file: './pids/ccorch.pid',

      // Cron restart (optional: restart daily at 2 AM)
      // cron_restart: '0 2 * * *',

      // Post-deploy commands (optional)
      // Can be used with pm2 deploy feature
      post_update: [
        'pnpm install',
        'pnpm prisma migrate deploy',
        'pnpm build'
      ].join(' && ')
    }
  ],

  /**
   * Deployment configuration (optional)
   * Allows using `pm2 deploy` for automated deployments
   */
  deploy: {
    production: {
      // SSH user
      user: 'node',

      // SSH host(s)
      host: 'your-production-server.com',

      // SSH port
      port: '22',

      // Git repository
      ref: 'origin/main',
      repo: 'git@github.com:your-org/ccorch.git',

      // Path on server
      path: '/var/www/ccorch',

      // Post-deploy commands
      'post-deploy':
        'pnpm install && pnpm prisma migrate deploy && pnpm build && pm2 reload ecosystem.config.js --env production',

      // Environment
      env: {
        NODE_ENV: 'production'
      }
    },

    staging: {
      user: 'node',
      host: 'your-staging-server.com',
      port: '22',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/ccorch.git',
      path: '/var/www/ccorch-staging',
      'post-deploy':
        'pnpm install && pnpm prisma migrate deploy && pnpm build && pm2 reload ecosystem.config.js --env development',
      env: {
        NODE_ENV: 'development'
      }
    }
  }
};
