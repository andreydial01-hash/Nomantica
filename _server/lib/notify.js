'use strict';
// Aviso opcional de lead nuevo por correo vía API de Resend (HTTPS: DigitalOcean bloquea SMTP).
// Solo se activa si hay RESEND_API_KEY y NOTIFY_EMAIL. Por defecto el correo NO lleva datos
// personales: solo avisa y manda a /admin. Con NOTIFY_DETAIL=full incluye nombre y WhatsApp.
async function notifyLead(lead, env = process.env) {
  const key = env.RESEND_API_KEY, to = env.NOTIFY_EMAIL;
  if (!key || !to) return false;
  const site = (env.SITE_URL || 'https://nomantica.com.mx').replace(/\/$/, '');
  const full = env.NOTIFY_DETAIL === 'full';
  const lines = [
    `Llegó un lead nuevo (${lead.servicio}).`,
    full ? `Nombre: ${lead.nombre}\nWhatsApp: ${lead.telefono}` : '',
    `Revísalo en ${site}/admin`,
  ].filter(Boolean);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.NOTIFY_FROM || 'Nomántica <leads@nomantica.com.mx>',
      to: [to],
      subject: `Nuevo lead · ${lead.servicio}`,
      text: lines.join('\n\n'),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
  return true;
}

module.exports = { notifyLead };
