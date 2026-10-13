// Comprueba en el sitio real que la miniatura nueva ya está publicada.
// Uso, desde la carpeta del sitio:  node _og/verificar.js
const fs = require('node:fs');
const path = require('node:path');

const SITIO = 'https://nomantica.com.mx';

(async () => {
  const local = (fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/og-image\.jpg\?v=(\d+)/) || [])[1];
  const html = await (await fetch(`${SITIO}/?nocache=${Date.now()}`)).text();
  const enLinea = (html.match(/og-image\.jpg\?v=(\d+)/) || [])[1];
  const titulo = (html.match(/property="og:title" content="([^"]*)"/) || [])[1];

  const img = await fetch(`${SITIO}/og-image.jpg?v=${enLinea}&nocache=${Date.now()}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  const esJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const igual = Buffer.compare(bytes, fs.readFileSync(path.join(__dirname, '..', 'og-image.jpg'))) === 0;

  console.log(`Versión en tu carpeta:   v=${local}`);
  console.log(`Versión en el sitio:     v=${enLinea}`);
  console.log(`Título al compartir:     ${titulo}`);
  console.log(`Imagen en el sitio:      ${img.status} ${img.headers.get('content-type')} · ${Math.round(bytes.length / 1024)} KB`);

  if (local !== enLinea) { console.log('\nTodavía NO está publicada: el sitio sigue en la versión anterior.\nSi acabas de publicar, espera 1 minuto y repite. Si no, falta el paso 6.'); process.exit(1); }
  if (img.status !== 200 || !esJpg) { console.log('\nEl sitio no está entregando una imagen JPG válida.'); process.exit(1); }
  if (!igual) { console.log('\nLa imagen del sitio no es la misma que la de tu carpeta. Espera 1 minuto y repite.'); process.exit(1); }
  console.log('\nTodo bien: la miniatura nueva ya está en línea.');
})().catch((e) => { console.error('No pude conectar con el sitio:', e.message); process.exit(1); });
