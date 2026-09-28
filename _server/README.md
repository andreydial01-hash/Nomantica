# Servidor de nomantica.com.mx

Sitio + `POST /api/lead` + panel privado `/admin` para ver y borrar leads. Node ≥ 22.13, una sola
dependencia (Express); SQLite es el nativo de Node, no hay nada que compilar.

> Esta carpeta empieza con `_` a propósito: GitHub Pages (Jekyll) no la publica.

## Seguridad incluida
- **Leads** en SQLite fuera de la carpeta pública (`DB_FILE`, permisos 600). El servidor solo publica una
  lista blanca de archivos (`index.html`, `privacidad.html`, `terminos.html`, `og-image.jpg`, `fonts/*.woff2`).
- **Formulario**: límite por IP (5 cada 10 min y 20 al día) + límite general del sitio, honeypot
  (`website`), trampa de tiempo (< 2.5 s = bot), validación en el servidor, cuerpo máx. 4 KB.
  A los bots se les responde "ok" sin guardar nada para no darles pistas.
- **/admin**: contraseña con scrypt, sesión en cookie `HttpOnly + Secure + SameSite=Strict` (8 h),
  solo POST desde el mismo sitio, token CSRF, 5 intentos por IP cada 15 min + candado global,
  `no-store`, `noindex`, CSP estricta. Borrar = eliminar de la base.

## Instalar en el droplet (Ubuntu)
```bash
# 1. Node 22 LTS, PM2 y Caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2
sudo apt install -y caddy
# 2. Código
git clone https://github.com/andreydial01-hash/Nomantica.git /srv/nomantica
cd /srv/nomantica/_server && npm ci --omit=dev
# 3. Configuración (secretos solo en el droplet)
cp .env.example .env && nano .env            # correo del admin, DB_FILE, etc.
sudo mkdir -p /var/lib/nomantica && sudo chown $USER /var/lib/nomantica && chmod 700 /var/lib/nomantica
npm run password -- "una-contraseña-larga-y-única"
npm test                                      # 19 pruebas de seguridad
# 4. Arrancar
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
sudo cp Caddyfile.example /etc/caddy/Caddyfile && sudo systemctl reload caddy
# 5. Firewall: solo SSH y web
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```
Después, apuntar el DNS de `nomantica.com.mx` a la IP del droplet y **quitar `SUPABASE_*` de
`index.html`** (el respaldo temporal para cuando el sitio estaba en GitHub Pages).

## Actualizar
```bash
cd /srv/nomantica && git pull && cd _server && npm ci --omit=dev && pm2 restart nomantica
```
