'use strict';
// Límite de peticiones por ventana fija, en memoria (un solo proceso en el droplet).
// Se aplica ANTES de leer el cuerpo, así un ataque no gasta CPU ni memoria.
function rateLimit({ windowMs, max, key = (req) => req.ip, onLimit }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of hits) if (now > e.reset) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  timer.unref();

  const mw = (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let e = hits.get(k);
    if (!e || now > e.reset) { e = { n: 0, reset: now + windowMs }; hits.set(k, e); }
    e.n++;
    if (e.n > max) {
      res.set('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      if (onLimit) return onLimit(req, res);
      return res.status(429).json({ ok: false, error: 'rate' });
    }
    next();
  };
  mw.reset = () => hits.clear();
  return mw;
}

module.exports = { rateLimit };
