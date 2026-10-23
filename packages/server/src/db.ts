import { DatabaseSync } from 'node:sqlite'

// One SQLite file holds everything: the owner's login, sessions, the saved
// app data and a short audit log. Uses Node's built-in driver, so there are
// no native modules to build.

export interface Owner {
  passwordHash: string
  totpSealed: string | null
  totpLastStep: number
}

export interface SavedData {
  body: string
  version: number
  updatedAt: string
}

export interface Session {
  tokenHash: string
  expiresAt: number
  lastSeenAt: number
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS owner (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    totp_sealed TEXT,
    totp_pending_sealed TEXT,
    totp_last_step INTEGER NOT NULL DEFAULT -1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_data (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    body TEXT NOT NULL,
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    event TEXT NOT NULL,
    ip TEXT
  );
`

const AUDIT_KEEP = 1000

export type Store = ReturnType<typeof openStore>

export function openStore(path: string) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)

  return {
    close: () => db.close(),

    getOwner(): Owner | null {
      const row = db.prepare('SELECT password_hash, totp_sealed, totp_last_step FROM owner WHERE id = 1').get()
      if (!row) return null
      return {
        passwordHash: String(row.password_hash),
        totpSealed: row.totp_sealed == null ? null : String(row.totp_sealed),
        totpLastStep: Number(row.totp_last_step),
      }
    },

    /** Returns false if an owner already exists. */
    createOwner(passwordHash: string): boolean {
      const result = db
        .prepare('INSERT OR IGNORE INTO owner (id, password_hash, created_at) VALUES (1, ?, ?)')
        .run(passwordHash, new Date().toISOString())
      return result.changes === 1
    },

    setPasswordHash(passwordHash: string) {
      db.prepare('UPDATE owner SET password_hash = ? WHERE id = 1').run(passwordHash)
    },

    setPendingTotp(sealed: string | null) {
      db.prepare('UPDATE owner SET totp_pending_sealed = ? WHERE id = 1').run(sealed)
    },

    getPendingTotp(): string | null {
      const row = db.prepare('SELECT totp_pending_sealed FROM owner WHERE id = 1').get()
      return row?.totp_pending_sealed == null ? null : String(row.totp_pending_sealed)
    },

    /** Turns TOTP on (with a sealed secret) or off (null). */
    setTotp(sealed: string | null, lastStep = -1) {
      db.prepare('UPDATE owner SET totp_sealed = ?, totp_pending_sealed = NULL, totp_last_step = ? WHERE id = 1').run(sealed, lastStep)
    },

    /**
     * Records a used TOTP step. Only succeeds if it is newer than the last
     * one, so two requests racing with the same code can't both win.
     */
    useTotpStep(step: number): boolean {
      return db.prepare('UPDATE owner SET totp_last_step = ? WHERE id = 1 AND totp_last_step < ?').run(step, step).changes === 1
    },

    /** Removes the login but keeps the saved data (for --reset-login). */
    deleteOwner() {
      db.exec('DELETE FROM owner; DELETE FROM sessions;')
    },

    addSession(tokenHash: string, now: number, expiresAt: number) {
      db.prepare('INSERT INTO sessions (token_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?)').run(tokenHash, now, now, expiresAt)
    },

    getSession(tokenHash: string): Session | null {
      const row = db.prepare('SELECT token_hash, expires_at, last_seen_at FROM sessions WHERE token_hash = ?').get(tokenHash)
      if (!row) return null
      return { tokenHash: String(row.token_hash), expiresAt: Number(row.expires_at), lastSeenAt: Number(row.last_seen_at) }
    },

    touchSession(tokenHash: string, now: number, expiresAt: number) {
      db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now, expiresAt, tokenHash)
    },

    deleteSession(tokenHash: string) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
    },

    /** Signs out everywhere, optionally keeping one session. */
    deleteOtherSessions(keepTokenHash: string | null) {
      db.prepare('DELETE FROM sessions WHERE token_hash != ?').run(keepTokenHash ?? '')
    },

    deleteExpiredSessions(now: number) {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
    },

    getData(): SavedData | null {
      const row = db.prepare('SELECT body, version, updated_at FROM app_data WHERE id = 1').get()
      if (!row) return null
      return { body: String(row.body), version: Number(row.version), updatedAt: String(row.updated_at) }
    },

    /**
     * Saves only if the stored version still matches `expectedVersion`
     * (0 when nothing is saved yet). Returns the new version, or null on a
     * conflict.
     */
    putData(body: string, expectedVersion: number): SavedData | null {
      const updatedAt = new Date().toISOString()
      const version = expectedVersion + 1
      const result = expectedVersion === 0
        ? db.prepare('INSERT OR IGNORE INTO app_data (id, body, version, updated_at) VALUES (1, ?, 1, ?)').run(body, updatedAt)
        : db.prepare('UPDATE app_data SET body = ?, version = ?, updated_at = ? WHERE id = 1 AND version = ?').run(body, version, updatedAt, expectedVersion)
      return result.changes === 1 ? { body, version, updatedAt } : null
    },

    audit(event: string, ip: string | null) {
      db.prepare('INSERT INTO audit (at, event, ip) VALUES (?, ?, ?)').run(new Date().toISOString(), event, ip)
      db.prepare('DELETE FROM audit WHERE id <= (SELECT MAX(id) FROM audit) - ?').run(AUDIT_KEEP)
    },

    recentAudit(limit = 50): { at: string; event: string; ip: string | null }[] {
      return db.prepare('SELECT at, event, ip FROM audit ORDER BY id DESC LIMIT ?').all(limit).map((row) => ({
        at: String(row.at),
        event: String(row.event),
        ip: row.ip == null ? null : String(row.ip),
      }))
    },
  }
}
