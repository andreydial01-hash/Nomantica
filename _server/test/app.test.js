'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { openDb } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

const PASS = 'clave-de-prueba-larga-123';
let server, base, db, app, notified;

function start(extra = {}) {
  db = openDb(':memory:');
  notified = [];
  ({ app } = createApp({
    db, minFillMs: 2500, leadMax: 5, loginMax: 5,
    notify: async (l) => { notified.push(l); },
    env: { ADMIN_EMAIL: 'dueno@nomantica.com.mx', ADMIN_PASSWORD_HASH: hashPassword(PASS) },
    ...extra,
  }));
  return new Promise((r) => { server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
}
const stop = () => new Promise((r) => server.close(r));

const lead = (over = {}) => ({ nombre: 'Ana Pérez', telefono: '55 5492 1640', email: '', servicio: 'Desarrollo Web', comentarios: 'Hola', website: '', t: 9000, ...over });
const postLead = (body) => fetch(base + '/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const form = (o) => new URLSearchParams(o).toString();
async function login(pass = PASS) {
  const r = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: form({ email: 'dueno@nomantica.com.mx', password: pass }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { r, cookie };
}
async function adminHtml(cookie) { return (await fetch(base + '/admin', { headers: { Cookie: cookie } })).text(); }
const csrfOf = (html) => (html.match(/name="csrf" value="([^"]+)"/) || [])[1];

beforeEach(async () => { if (server) await stop(); await start(); });
after(async () => { if (server) await stop(); });

/* ── API de leads ── */
test('lead válido se guarda y se avisa', async () => {
  const r = await postLead(lead());
  assert.equal(r.status, 201);
  assert.equal(db.countLeads(), 1);
  await new Promise((x) => setTimeout(x, 20));
  assert.equal(notified.length, 1);
});

test('email es opcional pero si viene debe ser válido', async () => {
  assert.equal((await postLead(lead({ email: '' }))).status, 201);
  assert.equal((await postLead(lead({ email: 'malo@' }))).status, 400);
  assert.equal(db.countLeads(), 1);
});

test('honeypot lleno: responde ok pero NO guarda', async () => {
  const r = await postLead(lead({ website: 'http://spam.example' }));
  assert.equal(r.status, 201);
  assert.equal(db.countLeads(), 0);
});

test('llenado demasiado rápido (bot): responde ok pero NO guarda', async () => {
  assert.equal((await postLead(lead({ t: 300 }))).status, 201);
  assert.equal((await postLead(lead({ t: undefined }))).status, 201);
  assert.equal(db.countLeads(), 0);
});

test('validación en el servidor', async () => {
  assert.equal((await postLead(lead({ telefono: '123' }))).status, 400);
  assert.equal((await postLead(lead({ nombre: 'A' }))).status, 400);
  assert.equal((await postLead(lead({ servicio: 'Hackeo' }))).status, 400);
  assert.equal((await postLead([1, 2])).status, 201); // sin campo de tiempo = bot: ok falso
  assert.equal(db.countLeads(), 0);
});

test('etiquetas HTML se limpian antes de guardar', async () => {
  await postLead(lead({ nombre: '<script>alert(1)</script>Ana', comentarios: '<img src=x onerror=alert(1)>hola' }));
  const [l] = db.listLeads();
  assert.ok(!l.nombre.includes('<') && !l.comentarios.includes('<'));
});

test('rate limit: el 6º envío en 10 min recibe 429', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await postLead(lead())).status, 201);
  const r = await postLead(lead());
  assert.equal(r.status, 429);
  assert.ok(r.headers.get('retry-after'));
  assert.equal(db.countLeads(), 5);
});

test('cuerpo gigante se rechaza (413)', async () => {
  const r = await postLead(lead({ comentarios: 'x'.repeat(10_000) }));
  assert.equal(r.status, 413);
});

test('JSON mal formado no revela detalles', async () => {
  const r = await fetch(base + '/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo' });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { ok: false });
});

/* ── /admin ── */
test('sin sesión: /admin solo muestra el login, nunca datos', async () => {
  await postLead(lead({ nombre: 'Cliente Secreto' }));
  const r = await fetch(base + '/admin');
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes('Contraseña'));
  assert.ok(!html.includes('Cliente Secreto'));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
});

test('contraseña incorrecta: 401 y sin cookie', async () => {
  const { r, cookie } = await login('otra-clave-incorrecta');
  assert.equal(r.status, 401);
  assert.equal(cookie, '');
});

test('fuerza bruta: el 6º intento en 15 min recibe 429', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await login('mala-' + i)).r.status, 401);
  assert.equal((await login(PASS)).r.status, 429); // ni con la buena mientras dure el bloqueo
});

test('login correcto: cookie blindada y se ven los leads', async () => {
  await postLead(lead({ nombre: 'Cliente Real' }));
  const { r, cookie } = await login();
  assert.equal(r.status, 303);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Strict/i); assert.match(sc, /Path=\/admin/i);
  assert.ok((await adminHtml(cookie)).includes('Cliente Real'));
});

test('cookie inventada no da acceso', async () => {
  await postLead(lead({ nombre: 'Cliente Real' }));
  const html = await adminHtml('nom_admin=inventada123');
  assert.ok(!html.includes('Cliente Real'));
});

test('POST desde otro sitio (CSRF) se rechaza', async () => {
  const r = await fetch(base + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://atacante.example' }, body: form({ email: 'dueno@nomantica.com.mx', password: PASS }) });
  assert.equal(r.status, 403);
});

test('borrar sin token CSRF se rechaza; con token borra de verdad', async () => {
  await postLead(lead()); await postLead(lead({ nombre: 'Beto' }));
  const { cookie } = await login();
  const csrf = csrfOf(await adminHtml(cookie));
  const [a, b] = db.listLeads();
  const bad = await fetch(`${base}/admin/leads/${a.id}/delete`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ csrf: 'falso' }) });
  assert.equal(bad.status, 403);
  assert.equal(db.countLeads(), 2);
  const ok = await fetch(`${base}/admin/leads/delete`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `csrf=${encodeURIComponent(csrf)}&ids=${a.id}&ids=${b.id}` });
  assert.equal(ok.status, 303);
  assert.equal(db.countLeads(), 0);
});

test('salir invalida la sesión en el servidor', async () => {
  const { cookie } = await login();
  const csrf = csrfOf(await adminHtml(cookie));
  await fetch(base + '/admin/logout', { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ csrf }) });
  assert.ok((await adminHtml(cookie)).includes('Contraseña')); // la misma cookie ya no sirve
});

/* ── Sitio estático: nada privado se publica ── */
test('solo se sirven los archivos públicos', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/fonts/lato-300.woff2')).status, 200);
  for (const p of ['/_server/server.js', '/_server/.env', '/_server/data/leads.db', '/.git/config', '/CNAME', '/_server/package.json', '/index.html/../_server/server.js', '/%2e%2e/_server/server.js', '/api/leads', '/admin/leads.json']) {
    const r = await fetch(base + p);
    assert.ok(r.status === 404 || r.status === 400, `${p} respondió ${r.status}`);
  }
});

test('cabeceras de seguridad en el sitio', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-powered-by'), null);
});
