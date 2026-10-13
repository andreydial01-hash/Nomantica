// Sube en 1 el número de versión de la miniatura en index.html (og-image.jpg?v=N),
// para que WhatsApp y Facebook descarten la imagen que tenían guardada.
// Uso, desde la raíz del repo:  node _og/subir-version.js
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const found = [...html.matchAll(/og-image\.jpg\?v=(\d+)/g)];
if (found.length !== 2) {
  console.error(`Esperaba 2 referencias a og-image.jpg?v=N en index.html y encontré ${found.length}. No cambié nada.`);
  process.exit(1);
}
const actual = Math.max(...found.map((m) => Number(m[1])));
const nueva = actual + 1;
fs.writeFileSync(file, html.replace(/og-image\.jpg\?v=\d+/g, `og-image.jpg?v=${nueva}`));
console.log(`Listo: la miniatura pasó de v=${actual} a v=${nueva} (2 líneas de index.html).`);
