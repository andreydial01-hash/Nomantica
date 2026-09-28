// PM2: pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [{
    name: 'nomantica',
    script: 'server.js',
    cwd: __dirname,
    node_args: '--env-file=.env --disable-warning=ExperimentalWarning',
    instances: 1,            // un solo proceso: el límite de envíos vive en memoria
    max_memory_restart: '200M',
    env: { NODE_ENV: 'production' },
  }],
};
