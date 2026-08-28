module.exports = {
  apps: [
    {
      name: 'school-erp-backend',
      script: './dist/server.js',
      instances: 1, // Changed from max to 1 to fit Free Tier VM memory limits
      exec_mode: 'fork', // Set to fork since we're using 1 instance
      watch: false, // Don't restart on file changes in production
      max_memory_restart: '1G', // Restart if memory exceeds 1GB
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'school-erp-worker',
      script: './dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
