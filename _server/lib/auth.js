'use strict';
const crypto = require('node:crypto');

// Contraseña: scrypt con sal aleatoria. Formato: scrypt$N$r$p$sal$hash (base64url)
const N = 16384, R = 8, P = 1, KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const got = crypto.scryptSync(String(password), Buffer.from(salt, 'base64url'), expected.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(got, expected);
}

// Comparación en tiempo constante para textos (evita medir por tiempos cuántas letras coinciden)
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { hashPassword, verifyPassword, safeEqual, token, sha256 };
