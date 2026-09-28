'use strict';
// SQLite nativo de Node (node:sqlite): sin dependencias que compilar en el droplet.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') { try { fs.chmodSync(file, 0o600); } catch {} } // solo el usuario del servidor puede leerla
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS leads (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  INTEGER NOT NULL,
      nombre      TEXT NOT NULL,
      telefono    TEXT NOT NULL,
      email       TEXT,
      servicio    TEXT NOT NULL,
      comentarios TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      csrf        TEXT NOT NULL,
      expires_at  INTEGER NOT NULL
    );
  `);

  const q = {
    insertLead: db.prepare('INSERT INTO leads (created_at, nombre, telefono, email, servicio, comentarios) VALUES (?, ?, ?, ?, ?, ?)'),
    listLeads: db.prepare('SELECT * FROM leads ORDER BY created_at DESC, id DESC'),
    countLeads: db.prepare('SELECT COUNT(*) AS n FROM leads'),
    deleteLead: db.prepare('DELETE FROM leads WHERE id = ?'),
    createSession: db.prepare('INSERT INTO sessions (token_hash, csrf, expires_at) VALUES (?, ?, ?)'),
    getSession: db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  };

  return {
    insertLead(l, now = Date.now()) {
      return q.insertLead.run(now, l.nombre, l.telefono, l.email || null, l.servicio, l.comentarios || null).lastInsertRowid;
    },
    listLeads: () => q.listLeads.all(),
    countLeads: () => q.countLeads.get().n,
    deleteLeads(ids) {
      let n = 0;
      db.exec('BEGIN IMMEDIATE');
      try { for (const id of ids) n += Number(q.deleteLead.run(id).changes); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      return n;
    },
    createSession: (tokenHash, csrf, expiresAt) => q.createSession.run(tokenHash, csrf, expiresAt),
    getSession: (tokenHash, now = Date.now()) => q.getSession.get(tokenHash, now),
    deleteSession: (tokenHash) => q.deleteSession.run(tokenHash),
    purgeSessions: (now = Date.now()) => q.purgeSessions.run(now),
    close: () => db.close(),
  };
}

module.exports = { openDb };
