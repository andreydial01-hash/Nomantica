'use strict';
// Genera el hash de la contraseña del /admin y lo guarda en .env (nunca se guarda la contraseña en claro).
// Uso: npm run password -- "tu-contraseña-larga"
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('../lib/auth');

const pass = process.argv[2];
if (!pass || pass.length < 12) {
  console.error('Usa una contraseña de al menos 12 caracteres:  npm run password -- "tu-contraseña"');
  process.exit(1);
}
const file = path.join(__dirname, '..', '.env');
let env = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const line = `ADMIN_PASSWORD_HASH=${hashPassword(pass)}`;
env = /^ADMIN_PASSWORD_HASH=.*$/m.test(env) ? env.replace(/^ADMIN_PASSWORD_HASH=.*$/m, line) : env + (env && !env.endsWith('\n') ? '\n' : '') + line + '\n';
fs.writeFileSync(file, env, { mode: 0o600 });
console.log('Listo: hash guardado en .env. Reinicia el servidor (pm2 restart nomantica).');
