'use strict';
// Vistas del /admin como HTML generado en el servidor. Todo dato del lead pasa por esc().
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fecha = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' });

function waLink(tel) {
  let d = String(tel).replace(/\D/g, '');
  if (d.length === 10) d = '52' + d;
  return 'https://wa.me/' + d;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#05050e;color:#eeedf8;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh}
a{color:#b9a8ff}
.wrap{max-width:1100px;margin:0 auto;padding:1.5rem}
header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-bottom:1rem;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:1.2rem}
.logo{font-weight:800;font-size:1.2rem;letter-spacing:-.02em}
.muted{color:#8d8cae;font-size:.85rem}
button,.btn{font:inherit;border:1px solid rgba(155,127,248,.4);background:rgba(107,94,240,.14);color:#eeedf8;border-radius:10px;padding:.45rem .9rem;cursor:pointer}
button:hover{background:rgba(107,94,240,.28)}
button.danger{border-color:rgba(229,62,62,.5);background:rgba(229,62,62,.12)}
button.danger:hover{background:rgba(229,62,62,.25)}
.card{background:#0c0c1c;border:1px solid rgba(255,255,255,.07);border-radius:14px}
.login{max-width:360px;margin:12vh auto;padding:1.6rem}
.login h1{font-size:1.2rem;margin-bottom:1rem}
label{display:block;font-size:.8rem;color:#a9a7c8;margin:.8rem 0 .3rem}
input[type=email],input[type=password]{width:100%;padding:.6rem .75rem;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#05050e;color:#eeedf8;font:inherit}
.login button{width:100%;margin-top:1.2rem;padding:.65rem}
.err{background:rgba(229,62,62,.12);border:1px solid rgba(229,62,62,.4);padding:.6rem .8rem;border-radius:10px;margin-bottom:.8rem;font-size:.85rem}
.ok{background:rgba(107,94,240,.14);border:1px solid rgba(155,127,248,.35);padding:.6rem .8rem;border-radius:10px;margin-bottom:1rem;font-size:.85rem}
.bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.8rem;flex-wrap:wrap}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.7rem .75rem;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top;font-size:.88rem}
th{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#8d8cae;font-weight:600}
td.c{max-width:340px;white-space:pre-wrap;word-break:break-word;color:#c9c7e2}
.tag{display:inline-block;font-size:.72rem;padding:.15rem .55rem;border-radius:100px;background:rgba(155,127,248,.14);border:1px solid rgba(155,127,248,.3)}
.empty{padding:3rem;text-align:center;color:#8d8cae}
@media(max-width:760px){
  thead{display:none}
  tr{display:block;padding:.6rem 0;border-bottom:1px solid rgba(255,255,255,.08)}
  td{display:block;border:none;padding:.25rem .5rem}
  td.c{max-width:none}
}`;

function page(title, body, nonce) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(title)}</title><style nonce="${nonce}">${CSS}</style></head>
<body>${body}</body></html>`;
}

function loginPage({ nonce, error }) {
  return page('Nomántica · Acceso', `
<form class="card login" method="post" action="/admin/login" autocomplete="on">
  <h1>Nomántica · Leads</h1>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <label for="e">Correo</label><input id="e" name="email" type="email" required autocomplete="username">
  <label for="p">Contraseña</label><input id="p" name="password" type="password" required autocomplete="current-password">
  <button type="submit">Entrar</button>
</form>`, nonce);
}

function leadsPage({ nonce, csrf, leads, flash }) {
  const rows = leads.map((l) => `
  <tr>
    <td><input type="checkbox" name="ids" value="${l.id}" form="del" aria-label="Seleccionar"></td>
    <td>${esc(fecha.format(new Date(l.created_at)))}</td>
    <td><strong>${esc(l.nombre)}</strong>${l.email ? `<br><span class="muted">${esc(l.email)}</span>` : ''}</td>
    <td><a href="${esc(waLink(l.telefono))}" target="_blank" rel="noopener noreferrer">${esc(l.telefono)}</a></td>
    <td><span class="tag">${esc(l.servicio)}</span></td>
    <td class="c">${esc(l.comentarios || '')}</td>
    <td><form method="post" action="/admin/leads/${l.id}/delete" class="one"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="danger" type="submit">Borrar</button></form></td>
  </tr>`).join('');

  return page(`Leads (${leads.length}) · Nomántica`, `
<div class="wrap">
  <header>
    <div><div class="logo">Nomántica · Leads</div><div class="muted">${leads.length} ${leads.length === 1 ? 'registro' : 'registros'}</div></div>
    <form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><button type="submit">Salir</button></form>
  </header>
  ${flash ? `<div class="ok">${esc(flash)}</div>` : ''}
  ${leads.length ? `
  <div class="bar">
    <span class="muted">Los leads borrados se eliminan de la base de datos y no se pueden recuperar.</span>
    <form id="del" method="post" action="/admin/leads/delete" class="many"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="danger" type="submit">Borrar seleccionados</button></form>
  </div>
  <div class="card"><table>
    <thead><tr><th></th><th>Fecha</th><th>Nombre</th><th>WhatsApp</th><th>Servicio</th><th>Comentario / diagnóstico</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>` : `<div class="card empty">Todavía no hay leads.</div>`}
</div>
<script nonce="${nonce}">
  document.querySelectorAll('form.one').forEach(function(f){ f.addEventListener('submit',function(e){ if(!confirm('¿Borrar este lead? No se puede deshacer.')) e.preventDefault(); }); });
  var m=document.querySelector('form.many');
  if(m) m.addEventListener('submit',function(e){ var n=document.querySelectorAll('input[name=ids]:checked').length; if(!n){ e.preventDefault(); alert('Selecciona al menos un lead.'); return; } if(!confirm('¿Borrar '+n+' lead(s)? No se puede deshacer.')) e.preventDefault(); });
</script>`, nonce);
}

module.exports = { loginPage, leadsPage, esc, waLink };
