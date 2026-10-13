// Coloca el diseño nuevo como miniatura del sitio (og-image.jpg, 1200x630).
// Acepta PDF (lo convierte) o JPG (lo revisa y lo copia). Funciona igual en PowerShell, Git Bash o CMD.
// Uso, desde la carpeta del sitio:  node _og/poner-imagen.js "C:\ruta\al\diseño.pdf"
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'og-image.jpg');
const salir = (msg) => { console.error('\nNo se cambió nada. ' + msg + '\n'); process.exit(1); };

const arg = (process.argv[2] || '').trim().replace(/^["']|["']$/g, '');
if (!arg) salir('Falta la ruta del archivo. Ejemplo:\n  node _og/poner-imagen.js "C:\\Users\\Andres\\Downloads\\mi-diseño.pdf"');
const origen = path.resolve(arg);
if (!fs.existsSync(origen)) salir(`No encuentro el archivo:\n  ${origen}\nRevisa la ruta: en el Explorador, clic derecho sobre el archivo > "Copiar como ruta de acceso".`);

const ext = path.extname(origen).toLowerCase();

if (ext === '.pdf') {
  const copia = path.join(__dirname, 'og-nomantica.pdf');
  if (path.resolve(copia) !== origen) fs.copyFileSync(origen, copia); // el original queda guardado junto al sitio
  const fijo = 'C:\\Users\\Andres\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
  const python = fs.existsSync(fijo) ? fijo : 'python';
  const r = spawnSync(python, [path.join(__dirname, 'pdf-a-jpg.py'), copia], { stdio: 'inherit' });
  if (r.error) salir(`No pude ejecutar Python (${r.error.message}). Instálalo y luego: pip install pymupdf`);
  if (r.status !== 0) salir('La conversión del PDF falló (el mensaje de arriba dice por qué).');
} else if (ext === '.jpg' || ext === '.jpeg') {
  const t = medidasJpg(fs.readFileSync(origen));
  if (!t) salir('Ese archivo no es un JPG válido.');
  if (t.w !== 1200 || t.h !== 630) salir(`El JPG mide ${t.w} x ${t.h} px y debe medir 1200 x 630 px. Expórtalo con ese tamaño.`);
  fs.copyFileSync(origen, DESTINO);
  console.log(`og-image.jpg: 1200x630 px, ${Math.round(fs.statSync(DESTINO).size / 1024)} KB`);
} else {
  salir(`El archivo es ${ext || 'de un tipo desconocido'}. Usa un PDF o un JPG (un PNG expórtalo como JPG de 1200 x 630 px).`);
}

console.log('Listo: la imagen nueva ya está en la carpeta del sitio. Sigue con el paso 4.');

// Lee ancho y alto de un JPG desde su cabecera (marcador SOF)
function medidasJpg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
