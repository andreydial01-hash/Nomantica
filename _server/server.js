'use strict';
// Servidor de nomantica.com.mx en el droplet: sitio estático + API de leads + /admin privado.
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { openDb } = require('./lib/db');
const { rateLimit } = require('./lib/ratelimit');
const { validateLead } = require('./lib/lead');
const { notifyLead } = require('./lib/notify');
const { verifyPassword, safeEqual, token, sha256 } = require('./lib/auth');
const views = require('./lib/views');

const SITE_ROOT = path.resolve(__dirname, '..');
// Lista blanca de lo que se publica: nada del servidor, la base, .git ni .env puede salir por aquí
const PUBLIC_FILE = /^\/(?:index\.html|privacidad\.html|terminos\.html|og-image\.jpg|fonts\/[a-z0-9-]+\.woff2)$/;
const SESSION_MS = 8 * 60 * 60 * 1000;
const COOKIE = 'nom_admin';

function createApp(opts = {}) {
  const env = opts.env || process.env;
  const db = opts.db || openDb(env.DB_FILE || path.join(__dirname, 'data', 'leads.db'));
  const production = env.NODE_ENV === 'production';
  const minFillMs = opts.minFillMs ?? 2500;
  const notify = opts.notify || ((lead) => notifyLead(lead, env));
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminHash = env.ADMIN_PASSWORD_HASH || '';
  const adminEnabled = Boolean(adminEmail && adminHash);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', opts.trustProxy ?? 'loopback'); // Caddy en el mismo droplet pasa la IP real

  // Cabeceras de seguridad para todo
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Límite general por IP (sitio completo)
  app.use(rateLimit({ windowMs: 5 * 60_000, max: opts.globalMax ?? 600 }));

  /* ───────── API de leads ───────── */
  const leadBurst = rateLimit({ windowMs: 10 * 60_000, max: opts.leadMax ?? 5 });
  const leadDaily = rateLimit({ windowMs: 24 * 60 * 60_000, max: opts.leadDailyMax ?? 20 });
  app.post('/api/lead', leadBurst, leadDaily, express.json({ limit: '4kb', strict: true }), (req, res) => {
    const b = req.body || {};
    // Honeypot y trampa de tiempo: el bot recibe un "ok" falso y no se guarda nada
    if (typeof b.website === 'string' && b.website.trim() !== '') return res.status(201).json({ ok: true });
    const fill = Number(b.t);
    if (!Number.isFinite(fill) || fill < minFillMs) return res.status(201).json({ ok: true });

    const v = validateLead(b);
    if (v.error) return res.status(400).json({ ok: false, error: v.error });
    db.insertLead(v.lead);
    Promise.resolve().then(() => notify(v.lead)).catch((e) => console.error('[aviso] no se envió:', e.message));
    res.status(201).json({ ok: true });
  });
  app.all('/api/{*rest}', (req, res) => res.status(404).json({ ok: false }));

  /* ───────── /admin ───────── */
  const admin = express.Router();
  admin.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    res.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${res.locals.nonce}'; script-src 'nonce-${res.locals.nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    });
    if (!adminEnabled) return res.status(503).type('text').send('Panel no configurado.');
    next();
  });
  // Las peticiones POST solo se aceptan desde este mismo sitio
  admin.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const src = req.get('origin') || req.get('referer');
    let ok = false;
    try { ok = !!src && new URL(src).host === req.get('host'); } catch {}
    if (!ok) return res.status(403).type('text').send('Origen no permitido.');
    next();
  });
  admin.use(express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 300 }));
  // Sesión
  admin.use((req, res, next) => {
    const raw = parseCookie(req.get('cookie'))[COOKIE];
    req.session = raw ? db.getSession(sha256(raw)) : null;
    req.sessionToken = raw;
    next();
  });
  const cookieOpts = { httpOnly: true, sameSite: 'strict', secure: production, path: '/admin' };
  const requireCsrf = (req, res, next) => {
    if (!req.session) return res.redirect(303, '/admin');
    if (!safeEqual(req.body?.csrf || '', req.session.csrf)) return res.status(403).type('text').send('Sesión inválida. Recarga la página.');
    next();
  };

  // Intentos de acceso: por IP y un candado global contra ataques repartidos entre muchas IPs
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000, max: opts.loginMax ?? 5,
    onLimit: (req, res) => res.status(429).type('html').send(views.loginPage({ nonce: res.locals.nonce, error: 'Demasiados intentos. Espera 15 minutos.' })),
  });
  let fails = [];
  const LOCK_FAILS = opts.lockFails ?? 20, LOCK_MS = 15 * 60_000;

  admin.get('/', (req, res) => {
    if (!req.session) return res.type('html').send(views.loginPage({ nonce: res.locals.nonce }));
    const ok = Number(req.query.ok);
    const flash = Number.isInteger(ok) && ok > 0 ? `${ok} ${ok === 1 ? 'lead borrado' : 'leads borrados'}.` : '';
    res.type('html').send(views.leadsPage({ nonce: res.locals.nonce, csrf: req.session.csrf, leads: db.listLeads(), flash }));
  });

  admin.post('/login', loginLimiter, (req, res) => {
    const now = Date.now();
    fails = fails.filter((t) => now - t < LOCK_MS);
    const deny = (msg) => res.status(401).type('html').send(views.loginPage({ nonce: res.locals.nonce, error: msg }));
    if (fails.length >= LOCK_FAILS) return deny('Acceso bloqueado temporalmente. Intenta más tarde.');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const pass = String(req.body?.password || '').slice(0, 200);
    const good = safeEqual(email, adminEmail) & verifyPassword(pass, adminHash); // se evalúan ambos siempre
    if (!good) { fails.push(now); return deny('Correo o contraseña incorrectos.'); }
    if (req.sessionToken) db.deleteSession(sha256(req.sessionToken));
    const t = token();
    db.createSession(sha256(t), token(24), now + SESSION_MS);
    res.cookie(COOKIE, t, { ...cookieOpts, maxAge: SESSION_MS });
    res.redirect(303, '/admin');
  });

  admin.post('/logout', requireCsrf, (req, res) => {
    db.deleteSession(sha256(req.sessionToken));
    res.clearCookie(COOKIE, cookieOpts);
    res.redirect(303, '/admin');
  });

  admin.post('/leads/:id/delete', requireCsrf, (req, res) => {
    const id = Number(req.params.id);
    const n = Number.isInteger(id) && id > 0 ? db.deleteLeads([id]) : 0;
    res.redirect(303, `/admin?ok=${n}`);
  });

  admin.post('/leads/delete', requireCsrf, (req, res) => {
    const raw = [].concat(req.body?.ids ?? []);
    const ids = [...new Set(raw.map(Number).filter((x) => Number.isInteger(x) && x > 0))].slice(0, 500);
    const n = ids.length ? db.deleteLeads(ids) : 0;
    res.redirect(303, `/admin?ok=${n}`);
  });

  admin.use((req, res) => res.status(404).type('text').send('No encontrado'));
  app.use('/admin', admin);

  /* ───────── Sitio estático (solo la lista blanca) ───────── */
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path === '/' ? '/index.html' : req.path;
    if (!PUBLIC_FILE.test(p)) return next();
    const long = p.startsWith('/fonts/') || p === '/og-image.jpg';
    res.set('Cache-Control', long ? 'public, max-age=2592000' : 'no-cache');
    res.sendFile(p.slice(1), { root: SITE_ROOT, dotfiles: 'deny' }, (err) => { if (err) next(); });
  });

  app.use((req, res) => res.status(404).type('text').send('No encontrado'));
  // Errores (JSON mal formado, cuerpo demasiado grande…): sin detalles internos
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    if (req.path.startsWith('/api/')) return res.status(status).json({ ok: false });
    res.status(status).type('text').send(status === 413 ? 'Demasiado grande' : 'Error');
  });

  return { app, db };
}

function parseCookie(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

if (require.main === module) {
  const { app, db } = createApp();
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH) console.warn('[aviso] /admin desactivado: falta ADMIN_EMAIL o ADMIN_PASSWORD_HASH en .env');
  setInterval(() => db.purgeSessions(), 60 * 60_000).unref();
  const port = Number(process.env.PORT || 3050);
  app.listen(port, '127.0.0.1', () => console.log(`Nomántica escuchando en http://127.0.0.1:${port}`));
}

module.exports = { createApp };
