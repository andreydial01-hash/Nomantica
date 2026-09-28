'use strict';
// Manda un aviso de prueba con la configuración de .env para confirmar que Resend funciona.
// Uso (en el droplet):  npm run test-email
const { notifyLead } = require('../lib/notify');

if (!process.env.RESEND_API_KEY || !process.env.NOTIFY_EMAIL) {
  console.error('Falta RESEND_API_KEY o NOTIFY_EMAIL en .env');
  process.exit(1);
}
notifyLead({ nombre: 'Prueba', telefono: '5500000000', servicio: 'Desarrollo Web' })
  .then(() => console.log(`Listo: aviso de prueba enviado a ${process.env.NOTIFY_EMAIL}. Revisa la bandeja (y spam).`))
  .catch((e) => { console.error('No se pudo enviar:', e.message); process.exit(1); });
