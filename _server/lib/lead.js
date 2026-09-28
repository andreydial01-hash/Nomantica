'use strict';
// Validación del lead en el servidor (la del navegador se puede saltar).
const SERVICIOS = new Set(['Redes Sociales', 'Campañas Publicitarias', 'Desarrollo Web', 'E-commerce', 'Contenido Orgánico', 'Plataformas', 'Todo']);

// quita etiquetas y caracteres de control; recorta
function clean(v, max) {
  return String(v ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function validateLead(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'body' };
  const nombre = clean(body.nombre, 80);
  const telefono = clean(body.telefono, 22);
  const email = clean(body.email, 254);
  const servicio = clean(body.servicio, 60);
  const comentarios = clean(body.comentarios, 400);

  if (nombre.length < 2) return { error: 'nombre' };
  const digits = telefono.replace(/\D/g, '');
  if (!/^[\d\s+\-()]{10,22}$/.test(telefono) || digits.length < 10 || digits.length > 15) return { error: 'telefono' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'email' };
  if (!SERVICIOS.has(servicio)) return { error: 'servicio' };

  return { lead: { nombre, telefono, email: email || null, servicio, comentarios: comentarios || null } };
}

module.exports = { validateLead, SERVICIOS };
