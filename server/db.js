import 'dotenv/config';
import { createClient } from '@libsql/client';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// libSQL / Turso client
// ---------------------------------------------------------------------------
// Local dev:   TURSO_DATABASE_URL=file:local-dev.db   (no auth token needed)
// Production:  TURSO_DATABASE_URL=libsql://...turso.io + TURSO_AUTH_TOKEN=...
const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  throw new Error(
    'TURSO_DATABASE_URL is not set. Copy .env.example to .env and set it (use file:local-dev.db for local development).',
  );
}
export const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

// ---------------------------------------------------------------------------
// Tiny async query helpers over the libSQL client.
//   get(sql, ...args)  -> first row (or undefined)
//   all(sql, ...args)  -> array of rows
//   run(sql, ...args)  -> { lastInsertRowid:Number, changes:Number }
//   tx(async (t) => { ... })  -> interactive write transaction (t has get/all/run)
// Positional parameters use `?`, exactly like the previous node:sqlite code.
// ---------------------------------------------------------------------------
const normalizeArgs = (args) => {
  // Support both run(sql, a, b) and run(sql, [a, b]).
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
};

function wrap(executor) {
  const get = async (sql, ...args) => {
    const rs = await executor.execute({ sql, args: normalizeArgs(args) });
    return rs.rows[0];
  };
  const all = async (sql, ...args) => {
    const rs = await executor.execute({ sql, args: normalizeArgs(args) });
    return rs.rows;
  };
  const run = async (sql, ...args) => {
    const rs = await executor.execute({ sql, args: normalizeArgs(args) });
    return {
      lastInsertRowid: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid),
      changes: rs.rowsAffected,
    };
  };
  return { get, all, run };
}

const base = wrap(client);

async function tx(callback) {
  const transaction = await client.transaction('write');
  try {
    const result = await callback(wrap(transaction));
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    throw error;
  }
}

// `q` = unscoped helpers, used for admin/auth tables (schools, accounts).
export const q = { ...base, tx };

// A per-request, school-scoped handle. It does not magically filter SQL — every
// library query must still pass schoolId explicitly — but it carries the id so
// route handlers can reference `req.db.schoolId`.
export function scoped(schoolId) {
  return { schoolId, ...base, tx };
}

// ---------------------------------------------------------------------------
// Schema (single database, multi-tenant via school_id on every library table)
// ---------------------------------------------------------------------------
const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schools(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super_admin','school_admin','librarian')),
  full_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS grades(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(school_id, name),
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS sections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  grade_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(school_id, grade_id, name),
  FOREIGN KEY(grade_id) REFERENCES grades(id),
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS students(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_code TEXT NOT NULL,
  name TEXT NOT NULL,
  grade_id INTEGER NOT NULL,
  section_id INTEGER NOT NULL,
  gq REAL NOT NULL,
  email TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, student_code),
  FOREIGN KEY(grade_id) REFERENCES grades(id),
  FOREIGN KEY(section_id) REFERENCES sections(id),
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS books(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id TEXT NOT NULL,
  isbn TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT,
  publisher TEXT,
  publication_year INTEGER,
  edition TEXT,
  language TEXT,
  category TEXT,
  gq REAL NOT NULL,
  registration_date TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1,
  shelf_location TEXT,
  price REAL,
  supplier TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id, book_id),
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS copies(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  copy_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  condition TEXT NOT NULL DEFAULT 'good',
  notes TEXT,
  UNIQUE(school_id, copy_code),
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS circulation(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  copy_id INTEGER NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  return_date TEXT,
  renewed_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  return_condition TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id),
  FOREIGN KEY(copy_id) REFERENCES copies(id),
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE TABLE IF NOT EXISTS app_settings(
  school_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(school_id, key),
  FOREIGN KEY(school_id) REFERENCES schools(id)
);

CREATE INDEX IF NOT EXISTS idx_circulation_status ON circulation(school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_books_school ON books(school_id);
CREATE INDEX IF NOT EXISTS idx_copies_school ON copies(school_id);
`;

// ---------------------------------------------------------------------------
// Password hashing (unchanged: scrypt with per-password salt)
// ---------------------------------------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored).split(':');
    const actual = crypto.scryptSync(String(password), salt, 64);
    return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// JWT (stateless sessions — replaces the old in-memory Map)
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-to-a-long-random-string';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// ---------------------------------------------------------------------------
// One-time (per cold start) schema creation + seeding. Memoized so concurrent
// requests share a single init.
// ---------------------------------------------------------------------------
let readyPromise = null;
export function ensureReady() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

async function init() {
  await client.executeMultiple(schemaSql);

  // Seed a default school so the packaged librarian login keeps working.
  let defaultSchool = await base.get("SELECT * FROM schools WHERE code='DEFAULT'");
  if (!defaultSchool) {
    const result = await base.run(
      'INSERT INTO schools(name,code) VALUES(?,?)',
      'Default School', 'DEFAULT',
    );
    defaultSchool = await base.get('SELECT * FROM schools WHERE id=?', result.lastInsertRowid);
  }

  const superAdmin = await base.get("SELECT id FROM accounts WHERE role='super_admin'");
  if (!superAdmin) {
    await base.run(
      'INSERT INTO accounts(school_id,username,password_hash,role,full_name) VALUES(NULL,?,?,?,?)',
      'admin', hashPassword('admin123'), 'super_admin', 'GroBro Super Admin',
    );
  }

  const librarian = await base.get("SELECT id FROM accounts WHERE username='librarian'");
  if (!librarian) {
    await base.run(
      'INSERT INTO accounts(school_id,username,password_hash,role,full_name) VALUES(?,?,?,?,?)',
      defaultSchool.id, 'librarian', hashPassword('grobro123'), 'librarian', 'Librarian',
    );
  }
}

// Seed the per-school default settings row (idempotent).
export async function ensureSchoolDefaults(schoolId) {
  await base.run(
    "INSERT OR IGNORE INTO app_settings(school_id,key,value) VALUES(?,'gq_tolerance','20')",
    schoolId,
  );
}
