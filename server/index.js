import express from 'express';
import cors from 'cors';
import {
  q, scoped, ensureReady, ensureSchoolDefaults,
  hashPassword, verifyPassword, signToken, verifyToken,
} from './db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const ok = (res, data) => res.json(data);
const fail = (res, error, status = 400) => res.status(status).json({ error: error.message || String(error) });
const clean = (value) => (typeof value === 'string' ? value.trim() : value);

// Per-school GQ tolerance setting.
const getGqTolerance = async (dbh, schoolId) => {
  const row = await dbh.get("SELECT value FROM app_settings WHERE school_id=? AND key='gq_tolerance'", schoolId);
  const value = Number(row?.value ?? 20);
  return Number.isFinite(value) && value >= 0 ? value : 20;
};

// Make sure the schema + seed data exist (memoized) before any request runs.
app.use(async (req, res, next) => {
  try { await ensureReady(); next(); } catch (error) { fail(res, error, 500); }
});

app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));

app.post('/api/login', async (req, res) => {
  try {
    const username = clean(req.body?.username);
    const account = await q.get('SELECT * FROM accounts WHERE LOWER(username)=LOWER(?) AND active=1', username);
    if (!account || !verifyPassword(req.body?.password, account.password_hash)) throw new Error('Incorrect username or password.');
    let school = null;
    if (account.school_id) {
      school = await q.get('SELECT id,name,code FROM schools WHERE id=? AND active=1', account.school_id);
      if (!school) throw new Error('This school account is inactive.');
    }
    const user = {
      account_id: account.id,
      username: account.username,
      full_name: account.full_name,
      role: account.role,
      school_id: account.school_id,
      school_name: school?.name || null,
    };
    const token = signToken(user);
    ok(res, { token, user: { username: user.username, full_name: user.full_name, role: user.role, school_id: user.school_id, school_name: user.school_name } });
  } catch (error) { fail(res, error, 401); }
});

// Auth: verify JWT, then attach either admin (super_admin) or a school-scoped db.
app.use('/api', async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const session = verifyToken(token);
    if (!session) return fail(res, new Error('Please log in again.'), 401);
    req.user = session;
    if (req.path.startsWith('/admin')) {
      if (session.role !== 'super_admin') return fail(res, new Error('Super Admin access is required.'), 403);
      return next();
    }
    if (session.role === 'super_admin') return fail(res, new Error('Select a school account to access its library.'), 403);
    if (!session.school_id) return fail(res, new Error('No school is associated with this account.'), 403);
    await ensureSchoolDefaults(session.school_id);
    req.db = scoped(session.school_id);
    return next();
  } catch (error) { return fail(res, error, 500); }
});

app.get('/api/me', (req, res) => ok(res, { username: req.user.username, full_name: req.user.full_name, role: req.user.role, school_id: req.user.school_id, school_name: req.user.school_name || null }));

// ---------------------------------------------------------------------------
// Admin (super_admin only) — schools + accounts
// ---------------------------------------------------------------------------
app.get('/api/admin/schools', async (_req, res) => {
  try {
    const rows = await q.all(`SELECT s.*,COUNT(a.id) account_count FROM schools s LEFT JOIN accounts a ON a.school_id=s.id AND a.active=1 GROUP BY s.id ORDER BY s.created_at DESC,s.id DESC`);
    ok(res, rows);
  } catch (error) { fail(res, error); }
});

app.post('/api/admin/schools', async (req, res) => {
  try {
    const name = clean(req.body?.name);
    const code = clean(req.body?.code)?.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const username = clean(req.body?.username);
    const password = String(req.body?.password || '');
    if (!name || !code || !username || password.length < 6) throw new Error('School name, code, username and a password of at least 6 characters are required.');
    const schoolId = await q.tx(async (t) => {
      const result = await t.run('INSERT INTO schools(name,code,address,contact_name,contact_email,contact_phone) VALUES(?,?,?,?,?,?)',
        name, code, clean(req.body.address) || null, clean(req.body.contact_name) || null, clean(req.body.contact_email) || null, clean(req.body.contact_phone) || null);
      const id = result.lastInsertRowid;
      await t.run('INSERT INTO accounts(school_id,username,password_hash,role,full_name) VALUES(?,?,?,?,?)',
        id, username, hashPassword(password), req.body.role === 'school_admin' ? 'school_admin' : 'librarian', clean(req.body.full_name) || 'Librarian');
      await t.run("INSERT OR IGNORE INTO app_settings(school_id,key,value) VALUES(?,'gq_tolerance','20')", id);
      return id;
    });
    ok(res, { id: schoolId });
  } catch (error) { fail(res, error); }
});

app.put('/api/admin/schools/:id', async (req, res) => {
  try {
    await q.run('UPDATE schools SET name=?,address=?,contact_name=?,contact_email=?,contact_phone=?,active=? WHERE id=?',
      clean(req.body.name), clean(req.body.address) || null, clean(req.body.contact_name) || null, clean(req.body.contact_email) || null, clean(req.body.contact_phone) || null, req.body.active ? 1 : 0, req.params.id);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.get('/api/admin/accounts', async (req, res) => {
  try {
    const rows = await q.all(`SELECT a.id,a.school_id,a.username,a.role,a.full_name,a.active,a.created_at,s.name school_name FROM accounts a LEFT JOIN schools s ON s.id=a.school_id WHERE a.role!='super_admin' ${req.query.school_id ? 'AND a.school_id=?' : ''} ORDER BY s.name,a.username`,
      ...(req.query.school_id ? [Number(req.query.school_id)] : []));
    ok(res, rows);
  } catch (error) { fail(res, error); }
});

app.post('/api/admin/accounts', async (req, res) => {
  try {
    const schoolId = Number(req.body.school_id);
    const username = clean(req.body.username);
    const password = String(req.body.password || '');
    if (!schoolId || !username || password.length < 6) throw new Error('School, username and a password of at least 6 characters are required.');
    const result = await q.run('INSERT INTO accounts(school_id,username,password_hash,role,full_name) VALUES(?,?,?,?,?)',
      schoolId, username, hashPassword(password), req.body.role === 'school_admin' ? 'school_admin' : 'librarian', clean(req.body.full_name) || null);
    ok(res, { id: result.lastInsertRowid });
  } catch (error) { fail(res, error); }
});

app.put('/api/admin/accounts/:id', async (req, res) => {
  try {
    if (req.body.password) await q.run('UPDATE accounts SET full_name=?,role=?,active=?,password_hash=? WHERE id=?', clean(req.body.full_name) || null, req.body.role === 'school_admin' ? 'school_admin' : 'librarian', req.body.active ? 1 : 0, hashPassword(req.body.password), req.params.id);
    else await q.run('UPDATE accounts SET full_name=?,role=?,active=? WHERE id=?', clean(req.body.full_name) || null, req.body.role === 'school_admin' ? 'school_admin' : 'librarian', req.body.active ? 1 : 0, req.params.id);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

// ---------------------------------------------------------------------------
// Settings (school-scoped)
// ---------------------------------------------------------------------------
app.get('/api/settings', async (req, res) => {
  try { ok(res, { gq_tolerance: await getGqTolerance(req.db, req.db.schoolId) }); } catch (error) { fail(res, error); }
});

app.put('/api/settings/gq-tolerance', async (req, res) => {
  try {
    const tolerance = Number(req.body?.gq_tolerance);
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 500) throw new Error('GQ tolerance must be between 0 and 500.');
    await req.db.run("INSERT INTO app_settings(school_id,key,value,updated_at) VALUES(?,'gq_tolerance',?,CURRENT_TIMESTAMP) ON CONFLICT(school_id,key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP", req.db.schoolId, String(tolerance));
    ok(res, { gq_tolerance: tolerance });
  } catch (error) { fail(res, error); }
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
app.get('/api/dashboard', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const scalar = async (sql, ...args) => Number((await req.db.get(sql, ...args))?.count || 0);
    const students = await scalar('SELECT COUNT(*) count FROM students WHERE school_id=? AND active=1', sid);
    const studentsWithBooks = await scalar("SELECT COUNT(DISTINCT student_id) count FROM circulation WHERE school_id=? AND status='active'", sid);
    const inventoryStatus = [];
    for (const [status, dbStatus] of [['Available', 'available'], ['Issued', 'issued'], ['Lost', 'lost'], ['Damaged', 'damaged']]) {
      inventoryStatus.push({ status, count: await scalar(`SELECT COUNT(*) count FROM copies cp JOIN books b ON b.id=cp.book_id WHERE b.school_id=? AND b.active=1 AND cp.status='${dbStatus}'`, sid) });
    }
    const data = {
      students,
      studentsWithBooks,
      studentsWithoutBooks: Math.max(0, students - studentsWithBooks),
      titles: await scalar('SELECT COUNT(*) count FROM books WHERE school_id=? AND active=1', sid),
      available: inventoryStatus.find((r) => r.status === 'Available').count,
      issued: inventoryStatus.find((r) => r.status === 'Issued').count,
      overdue: await scalar("SELECT COUNT(*) count FROM circulation WHERE school_id=? AND status='active' AND date(due_date)<date('now')", sid),
      lost: inventoryStatus.find((r) => r.status === 'Lost').count,
      damaged: inventoryStatus.find((r) => r.status === 'Damaged').count,
      inventoryStatus,
      gradeParticipation: await req.db.all(`
        SELECT g.id grade_id,g.name grade,COUNT(DISTINCT s.id) total,
          COUNT(DISTINCT CASE WHEN c.status='active' THEN s.id END) with_books,
          COUNT(DISTINCT s.id)-COUNT(DISTINCT CASE WHEN c.status='active' THEN s.id END) without_books
        FROM grades g
        LEFT JOIN students s ON s.grade_id=g.id AND s.active=1
        LEFT JOIN circulation c ON c.student_id=s.id AND c.status='active'
        WHERE g.school_id=? AND g.active=1
        GROUP BY g.id,g.name ORDER BY g.id
      `, sid),
      gqAvailability: await req.db.all(`
        SELECT b.gq,printf('GQ %g',b.gq) gq_label,
          SUM(CASE WHEN cp.status='available' THEN 1 ELSE 0 END) available
        FROM books b LEFT JOIN copies cp ON cp.book_id=b.id
        WHERE b.school_id=? AND b.active=1 GROUP BY b.gq ORDER BY b.gq
      `, sid),
      monthlyCirculation: await req.db.all(`
        WITH months AS (
          SELECT substr(issue_date,1,7) month FROM circulation WHERE school_id=?
          UNION SELECT substr(return_date,1,7) FROM circulation WHERE school_id=? AND return_date IS NOT NULL
          UNION SELECT substr(renewed_at,1,7) FROM circulation WHERE school_id=? AND renewed_at IS NOT NULL
        )
        SELECT m.month,
          (SELECT COUNT(*) FROM circulation c WHERE c.school_id=? AND substr(c.issue_date,1,7)=m.month) issues,
          (SELECT COUNT(*) FROM circulation c WHERE c.school_id=? AND substr(c.return_date,1,7)=m.month) returns,
          (SELECT COUNT(*) FROM circulation c WHERE c.school_id=? AND substr(c.renewed_at,1,7)=m.month) renewals
        FROM months m WHERE m.month IS NOT NULL ORDER BY m.month
      `, sid, sid, sid, sid, sid, sid),
      overdueByGrade: await req.db.all(`
        SELECT g.name grade,COUNT(*) overdue
        FROM circulation c JOIN students s ON s.id=c.student_id JOIN grades g ON g.id=s.grade_id
        WHERE c.school_id=? AND c.status='active' AND date(c.due_date)<date('now') GROUP BY g.id,g.name ORDER BY g.id
      `, sid),
    };
    ok(res, data);
  } catch (error) { fail(res, error); }
});

// ---------------------------------------------------------------------------
// Grades + sections
// ---------------------------------------------------------------------------
app.get('/api/grades', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const grades = await req.db.all('SELECT * FROM grades WHERE school_id=? AND active=1 ORDER BY id', sid);
    const sections = await req.db.all('SELECT * FROM sections WHERE school_id=? AND active=1 ORDER BY grade_id,id', sid);
    ok(res, grades.map((grade) => ({ ...grade, sections: sections.filter((section) => section.grade_id === grade.id) })));
  } catch (error) { fail(res, error); }
});

app.post('/api/grades', async (req, res) => {
  try {
    const name = clean(req.body.name);
    if (!name) throw new Error('Grade name is required.');
    const result = await req.db.run('INSERT INTO grades(school_id,name) VALUES(?,?)', req.db.schoolId, name);
    ok(res, { id: result.lastInsertRowid });
  } catch (error) { fail(res, error); }
});

app.post('/api/grades/:id/sections', async (req, res) => {
  try {
    const name = clean(req.body.name);
    if (!name) throw new Error('Section name is required.');
    const grade = await req.db.get('SELECT id FROM grades WHERE id=? AND school_id=? AND active=1', req.params.id, req.db.schoolId);
    if (!grade) throw new Error('Grade not found.');
    const result = await req.db.run('INSERT INTO sections(school_id,grade_id,name) VALUES(?,?,?)', req.db.schoolId, req.params.id, name);
    ok(res, { id: result.lastInsertRowid });
  } catch (error) { fail(res, error); }
});

app.delete('/api/sections/:id', async (req, res) => {
  try {
    const activeStudents = Number((await req.db.get('SELECT COUNT(*) count FROM students WHERE section_id=? AND school_id=? AND active=1', req.params.id, req.db.schoolId)).count);
    if (activeStudents) throw new Error('Move or remove students from this section first.');
    await req.db.run('UPDATE sections SET active=0 WHERE id=? AND school_id=?', req.params.id, req.db.schoolId);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.delete('/api/grades/:id', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const activeStudents = Number((await req.db.get('SELECT COUNT(*) count FROM students WHERE grade_id=? AND school_id=? AND active=1', req.params.id, sid)).count);
    if (activeStudents) throw new Error('Move or remove students from this grade first.');
    await req.db.tx(async (t) => {
      await t.run('UPDATE grades SET active=0 WHERE id=? AND school_id=?', req.params.id, sid);
      await t.run('UPDATE sections SET active=0 WHERE grade_id=? AND school_id=?', req.params.id, sid);
    });
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
app.get('/api/students', async (req, res) => {
  try {
    const clauses = ['s.school_id=?', 's.active=1'];
    const params = [req.db.schoolId];
    if (req.query.grade_id) { clauses.push('s.grade_id=?'); params.push(Number(req.query.grade_id)); }
    if (req.query.section_id) { clauses.push('s.section_id=?'); params.push(Number(req.query.section_id)); }
    if (req.query.q) {
      clauses.push('(LOWER(s.name) LIKE ? OR LOWER(s.student_code) LIKE ?)');
      const term = `%${String(req.query.q).toLowerCase()}%`;
      params.push(term, term);
    }
    const rows = await req.db.all(`
      SELECT s.*,g.name grade,se.name section,
        MAX(CASE WHEN c.status='active' THEN 1 ELSE 0 END) active_issue,
        MAX(CASE WHEN c.status='active' THEN b.title END) current_book
      FROM students s
      JOIN grades g ON g.id=s.grade_id
      JOIN sections se ON se.id=s.section_id
      LEFT JOIN circulation c ON c.student_id=s.id
      LEFT JOIN copies cp ON cp.id=c.copy_id
      LEFT JOIN books b ON b.id=cp.book_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY s.id ORDER BY g.id,se.id,s.name
    `, params);
    ok(res, rows);
  } catch (error) { fail(res, error); }
});

app.get('/api/students/:id', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const student = await req.db.get(`
      SELECT s.*,g.name grade,se.name section,
        MAX(CASE WHEN c.status='active' THEN b.title END) current_book
      FROM students s JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id
      LEFT JOIN circulation c ON c.student_id=s.id
      LEFT JOIN copies cp ON cp.id=c.copy_id LEFT JOIN books b ON b.id=cp.book_id
      WHERE s.id=? AND s.school_id=? GROUP BY s.id
    `, req.params.id, sid);
    if (!student) return fail(res, new Error('Student not found.'), 404);
    const history = await req.db.all(`
      SELECT c.*,b.title,cp.copy_code FROM circulation c
      JOIN copies cp ON cp.id=c.copy_id JOIN books b ON b.id=cp.book_id
      WHERE c.student_id=? AND c.school_id=? ORDER BY c.created_at DESC,c.id DESC
    `, req.params.id, sid);
    ok(res, { student, history });
  } catch (error) { fail(res, error); }
});

async function validateStudent(dbh, schoolId, body) {
  const required = ['student_code', 'name', 'grade_id', 'section_id', 'gq'];
  for (const key of required) if (body[key] === '' || body[key] === undefined || body[key] === null) throw new Error(`${key.replace('_', ' ')} is required.`);
  const section = await dbh.get('SELECT id FROM sections WHERE id=? AND grade_id=? AND school_id=? AND active=1', body.section_id, body.grade_id, schoolId);
  if (!section) throw new Error('The selected section does not belong to the selected grade.');
}

app.post('/api/students', async (req, res) => {
  try {
    const body = req.body;
    await validateStudent(req.db, req.db.schoolId, body);
    const result = await req.db.run('INSERT INTO students(school_id,student_code,name,grade_id,section_id,gq,email,phone) VALUES(?,?,?,?,?,?,?,?)',
      req.db.schoolId, clean(body.student_code), clean(body.name), body.grade_id, body.section_id, Number(body.gq), clean(body.email) || null, clean(body.phone) || null);
    ok(res, { id: result.lastInsertRowid });
  } catch (error) { fail(res, error); }
});

app.put('/api/students/:id', async (req, res) => {
  try {
    const body = req.body;
    await validateStudent(req.db, req.db.schoolId, body);
    await req.db.run('UPDATE students SET student_code=?,name=?,grade_id=?,section_id=?,gq=?,email=?,phone=? WHERE id=? AND school_id=?',
      clean(body.student_code), clean(body.name), body.grade_id, body.section_id, Number(body.gq), clean(body.email) || null, clean(body.phone) || null, req.params.id, req.db.schoolId);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const active = Number((await req.db.get("SELECT COUNT(*) count FROM circulation WHERE student_id=? AND school_id=? AND status='active'", req.params.id, req.db.schoolId)).count);
    if (active) throw new Error('Return the active book before removing this student.');
    await req.db.run('UPDATE students SET active=0 WHERE id=? AND school_id=?', req.params.id, req.db.schoolId);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.post('/api/students/bulk-import', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return fail(res, new Error('No student rows were supplied.'));
  const sid = req.db.schoolId;
  const results = { total: rows.length, imported: 0, failed: 0, errors: [] };

  const findOrCreateGrade = async (t, name) => {
    const gradeName = clean(name);
    if (!gradeName) throw new Error('grade is required');
    let grade = await t.get('SELECT id FROM grades WHERE school_id=? AND LOWER(name)=LOWER(?) AND active=1', sid, gradeName);
    if (!grade) {
      const result = await t.run('INSERT INTO grades(school_id,name) VALUES(?,?)', sid, gradeName);
      grade = { id: result.lastInsertRowid };
    }
    return grade.id;
  };
  const findOrCreateSection = async (t, gradeId, name) => {
    const sectionName = clean(name);
    if (!sectionName) throw new Error('section is required');
    let section = await t.get('SELECT id FROM sections WHERE school_id=? AND grade_id=? AND LOWER(name)=LOWER(?) AND active=1', sid, gradeId, sectionName);
    if (!section) {
      const result = await t.run('INSERT INTO sections(school_id,grade_id,name) VALUES(?,?,?)', sid, gradeId, sectionName);
      section = { id: result.lastInsertRowid };
    }
    return section.id;
  };

  for (const [index, raw] of rows.entries()) {
    try {
      const studentCode = clean(raw.student_code);
      const name = clean(raw.name);
      const gq = Number(raw.gq);
      if (!studentCode) throw new Error('student_code is required');
      if (!name) throw new Error('name is required');
      if (!Number.isFinite(gq)) throw new Error('gq must be a number');
      await req.db.tx(async (t) => {
        if (await t.get('SELECT id FROM students WHERE school_id=? AND LOWER(student_code)=LOWER(?)', sid, studentCode)) throw new Error(`duplicate student_code: ${studentCode}`);
        const gradeId = await findOrCreateGrade(t, raw.grade);
        const sectionId = await findOrCreateSection(t, gradeId, raw.section);
        await t.run('INSERT INTO students(school_id,student_code,name,grade_id,section_id,gq,email,phone) VALUES(?,?,?,?,?,?,?,?)',
          sid, studentCode, name, gradeId, sectionId, gq, clean(raw.email) || null, clean(raw.phone) || null);
      });
      results.imported += 1;
    } catch (error) {
      results.failed += 1;
      results.errors.push({ row: index + 2, identifier: clean(raw.student_code) || clean(raw.name) || '', error: error.message });
    }
  }
  ok(res, results);
});

// ---------------------------------------------------------------------------
// Books + copies
// ---------------------------------------------------------------------------
app.get('/api/books', async (req, res) => {
  try {
    const rows = await req.db.all(`
      SELECT b.*,COUNT(cp.id) copies,
        SUM(CASE WHEN cp.status='available' THEN 1 ELSE 0 END) available,
        SUM(CASE WHEN cp.status='issued' THEN 1 ELSE 0 END) issued,
        SUM(CASE WHEN cp.status='lost' THEN 1 ELSE 0 END) lost,
        SUM(CASE WHEN cp.status='damaged' THEN 1 ELSE 0 END) damaged
      FROM books b LEFT JOIN copies cp ON cp.book_id=b.id
      WHERE b.school_id=? AND b.active=1 GROUP BY b.id ORDER BY b.title
    `, req.db.schoolId);
    ok(res, rows);
  } catch (error) { fail(res, error); }
});

app.get('/api/books/:id', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const book = await req.db.get('SELECT * FROM books WHERE id=? AND school_id=?', req.params.id, sid);
    if (!book) return fail(res, new Error('Book not found.'), 404);
    const copies = await req.db.all('SELECT * FROM copies WHERE book_id=? AND school_id=? ORDER BY copy_code', req.params.id, sid);
    const history = await req.db.all(`
      SELECT c.*,s.name student,g.name grade,se.name section,cp.copy_code
      FROM circulation c JOIN students s ON s.id=c.student_id
      JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id
      JOIN copies cp ON cp.id=c.copy_id WHERE cp.book_id=? AND c.school_id=?
      ORDER BY c.created_at DESC,c.id DESC
    `, req.params.id, sid);
    ok(res, { book, copies, history });
  } catch (error) { fail(res, error); }
});

function validateBook(body) {
  if (!clean(body.book_id)) throw new Error('Book ID is required.');
  if (!clean(body.title)) throw new Error('Title is required.');
  if (body.gq === '' || body.gq === undefined || Number.isNaN(Number(body.gq))) throw new Error('Book GQ is required.');
}

const bookFields = ['book_id', 'isbn', 'title', 'subtitle', 'author', 'publisher', 'publication_year', 'edition', 'language', 'category', 'gq', 'registration_date', 'shelf_location', 'price', 'supplier', 'description'];
const bookValues = (body) => bookFields.map((field) => {
  if (field === 'gq') return Number(body[field]);
  if (field === 'publication_year' || field === 'price') return body[field] === '' || body[field] == null ? null : Number(body[field]);
  return clean(body[field]) || null;
});

// Shared insert used by POST /books and bulk import. Runs inside transaction `t`.
async function insertBookWithCopies(t, schoolId, body, copies) {
  const placeholders = bookFields.map(() => '?').join(',');
  const result = await t.run(`INSERT INTO books(school_id,${bookFields.join(',')},total_copies) VALUES(?,${placeholders},?)`, schoolId, ...bookValues(body), copies);
  const id = result.lastInsertRowid;
  for (let i = 1; i <= copies; i += 1) {
    await t.run('INSERT INTO copies(school_id,book_id,copy_code) VALUES(?,?,?)', schoolId, id, `${clean(body.book_id)}-${String(i).padStart(3, '0')}`);
  }
  return id;
}

app.post('/api/books', async (req, res) => {
  try {
    const body = req.body;
    validateBook(body);
    const copies = Number(body.total_copies || 1);
    if (!Number.isInteger(copies) || copies < 1) throw new Error('Total copies must be at least 1.');
    const sid = req.db.schoolId;
    const id = await req.db.tx(async (t) => {
      if (await t.get('SELECT id FROM books WHERE school_id=? AND LOWER(book_id)=LOWER(?)', sid, clean(body.book_id))) throw new Error(`duplicate book_id: ${clean(body.book_id)}`);
      return insertBookWithCopies(t, sid, body, copies);
    });
    ok(res, { id });
  } catch (error) { fail(res, error); }
});

app.put('/api/books/:id', async (req, res) => {
  try {
    validateBook(req.body);
    const assignments = bookFields.map((field) => `${field}=?`).join(',');
    await req.db.run(`UPDATE books SET ${assignments} WHERE id=? AND school_id=?`, ...bookValues(req.body), req.params.id, req.db.schoolId);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.post('/api/books/:id/copies', async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Enter a valid number of copies.');
    const sid = req.db.schoolId;
    const book = await req.db.get('SELECT * FROM books WHERE id=? AND school_id=? AND active=1', req.params.id, sid);
    if (!book) throw new Error('Book not found.');
    const current = Number((await req.db.get('SELECT COUNT(*) count FROM copies WHERE book_id=? AND school_id=?', req.params.id, sid)).count);
    await req.db.tx(async (t) => {
      for (let i = 1; i <= quantity; i += 1) {
        await t.run('INSERT INTO copies(school_id,book_id,copy_code) VALUES(?,?,?)', sid, req.params.id, `${book.book_id}-${String(current + i).padStart(3, '0')}`);
      }
      await t.run('UPDATE books SET total_copies=total_copies+? WHERE id=? AND school_id=?', quantity, req.params.id, sid);
    });
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.delete('/api/books/:id', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const active = Number((await req.db.get("SELECT COUNT(*) count FROM copies WHERE book_id=? AND school_id=? AND status='issued'", req.params.id, sid)).count);
    if (active) throw new Error('Return all issued copies before removing this book.');
    await req.db.run('UPDATE books SET active=0 WHERE id=? AND school_id=?', req.params.id, sid);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.post('/api/books/bulk-import', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return fail(res, new Error('No book rows were supplied.'));
  const sid = req.db.schoolId;
  const results = { total: rows.length, imported: 0, failed: 0, errors: [] };
  for (const [index, raw] of rows.entries()) {
    try {
      const body = { ...raw };
      validateBook(body);
      const copies = Number(body.total_copies || 1);
      if (!Number.isInteger(copies) || copies < 1) throw new Error('total_copies must be a positive whole number');
      await req.db.tx(async (t) => {
        if (await t.get('SELECT id FROM books WHERE school_id=? AND LOWER(book_id)=LOWER(?)', sid, clean(body.book_id))) throw new Error(`duplicate book_id: ${clean(body.book_id)}`);
        await insertBookWithCopies(t, sid, body, copies);
      });
      results.imported += 1;
    } catch (error) {
      results.failed += 1;
      results.errors.push({ row: index + 2, identifier: clean(raw.book_id) || clean(raw.title) || '', error: error.message });
    }
  }
  ok(res, results);
});

// ---------------------------------------------------------------------------
// Circulation
// ---------------------------------------------------------------------------
app.get('/api/eligible-books/:studentId', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const student = await req.db.get('SELECT * FROM students WHERE id=? AND school_id=? AND active=1', req.params.studentId, sid);
    if (!student) return fail(res, new Error('Student not found.'), 404);
    const active = Number((await req.db.get("SELECT COUNT(*) count FROM circulation WHERE student_id=? AND school_id=? AND status='active'", student.id, sid)).count);
    if (active) return ok(res, []);
    const tolerance = await getGqTolerance(req.db, sid);
    const minimumGq = Number(student.gq) - tolerance;
    const maximumGq = Number(student.gq) + tolerance;
    const rows = await req.db.all(`
      SELECT cp.id copy_id,cp.copy_code,b.id,b.title,b.author,b.gq,
        ABS(b.gq-?) gq_difference
      FROM copies cp JOIN books b ON b.id=cp.book_id
      WHERE cp.school_id=? AND cp.status='available' AND b.active=1 AND b.gq BETWEEN ? AND ?
      ORDER BY gq_difference,b.title,cp.copy_code
    `, student.gq, sid, minimumGq, maximumGq);
    ok(res, { tolerance, minimum_gq: minimumGq, maximum_gq: maximumGq, books: rows });
  } catch (error) { fail(res, error); }
});

// Issue one book to one student inside an open transaction `t`.
async function issueOne(t, schoolId, { student_id, copy_id, issue_date, due_date }) {
  if (!student_id || !copy_id || !issue_date || !due_date) throw new Error('Student, book copy, issue date and due date are required.');
  if (new Date(due_date) < new Date(issue_date)) throw new Error('Due date cannot be before the issue date.');
  const active = Number((await t.get("SELECT COUNT(*) count FROM circulation WHERE student_id=? AND school_id=? AND status='active'", student_id, schoolId)).count);
  if (active) throw new Error('This student already has an active book.');
  const student = await t.get('SELECT gq FROM students WHERE id=? AND school_id=? AND active=1', student_id, schoolId);
  const copy = await t.get('SELECT cp.*,b.gq FROM copies cp JOIN books b ON b.id=cp.book_id WHERE cp.id=? AND cp.school_id=? AND b.active=1', copy_id, schoolId);
  if (!student || !copy || copy.status !== 'available') throw new Error('Student or available book copy not found.');
  const tolerance = await getGqTolerance(t, schoolId);
  if (Math.abs(Number(student.gq) - Number(copy.gq)) > tolerance) throw new Error(`Book GQ must be within ±${tolerance} of the student GQ.`);
  await t.run('INSERT INTO circulation(school_id,student_id,copy_id,issue_date,due_date,status) VALUES(?,?,?,?,?,?)', schoolId, student_id, copy_id, issue_date, due_date, 'active');
  await t.run("UPDATE copies SET status='issued' WHERE id=? AND school_id=?", copy_id, schoolId);
}

app.post('/api/bulk-issue', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) throw new Error('No CSV rows were provided.');
    if (rows.length > 1000) throw new Error('A single bulk upload cannot exceed 1,000 rows.');
    const results = [];
    for (const row of rows) {
      try {
        await req.db.tx(async (t) => {
          const student = await t.get('SELECT id FROM students WHERE student_code=? AND school_id=? AND active=1', clean(row.student_code), sid);
          if (!student) throw new Error('Active student ID not found.');
          const copy = await t.get('SELECT id FROM copies WHERE copy_code=? AND school_id=?', clean(row.copy_code), sid);
          if (!copy) throw new Error('Copy ID not found.');
          await issueOne(t, sid, { student_id: student.id, copy_id: copy.id, issue_date: row.issue_date, due_date: row.due_date });
        });
        results.push({ success: true });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    ok(res, { results });
  } catch (error) { fail(res, error); }
});

app.post('/api/issue', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    await req.db.tx((t) => issueOne(t, sid, req.body));
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.get('/api/circulation', async (req, res) => {
  try {
    const clauses = ['c.school_id=?'];
    const params = [req.db.schoolId];
    if (req.query.tab === 'active') clauses.push("c.status='active'");
    else if (req.query.tab === 'returns') clauses.push("c.status='returned'");
    else if (req.query.tab === 'overdue') clauses.push("c.status='active' AND date(c.due_date)<date('now')");
    if (req.query.grade_id) { clauses.push('s.grade_id=?'); params.push(Number(req.query.grade_id)); }
    if (req.query.section_id) { clauses.push('s.section_id=?'); params.push(Number(req.query.section_id)); }
    if (req.query.q) {
      const term = `%${String(req.query.q).toLowerCase()}%`;
      clauses.push('(LOWER(s.name) LIKE ? OR LOWER(s.student_code) LIKE ? OR LOWER(b.title) LIKE ? OR LOWER(cp.copy_code) LIKE ?)');
      params.push(term, term, term, term);
    }
    const where = clauses.join(' AND ');
    const rows = await req.db.all(`
      SELECT c.*,s.name student,s.student_code,s.gq student_gq,g.name grade,se.name section,
        b.title,b.gq book_gq,cp.copy_code
      FROM circulation c JOIN students s ON s.id=c.student_id
      JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id
      JOIN copies cp ON cp.id=c.copy_id JOIN books b ON b.id=cp.book_id
      WHERE ${where} ORDER BY c.created_at DESC,c.id DESC
    `, params);
    ok(res, rows);
  } catch (error) { fail(res, error); }
});

app.post('/api/circulation/:id/action', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const { action, due_date, return_date, condition = 'good', notes = '' } = req.body;
    const record = await req.db.get('SELECT * FROM circulation WHERE id=? AND school_id=?', req.params.id, sid);
    if (!record) throw new Error('Circulation record not found.');
    if (record.status !== 'active') throw new Error('Only active circulation records can be changed.');

    if (action === 'renew') {
      if (!due_date) throw new Error('New due date is required.');
      if (new Date(due_date) <= new Date(record.due_date)) throw new Error('New due date must be after the current due date.');
      await req.db.run('UPDATE circulation SET due_date=?,renewed_at=CURRENT_TIMESTAMP,notes=? WHERE id=? AND school_id=?', due_date, clean(notes) || null, record.id, sid);
    } else if (action === 'return') {
      if (!return_date) throw new Error('Return date is required.');
      if (!['good', 'damaged'].includes(condition)) throw new Error('Select a valid book condition.');
      const copyStatus = condition === 'damaged' ? 'damaged' : 'available';
      await req.db.tx(async (t) => {
        await t.run("UPDATE circulation SET status='returned',return_date=?,return_condition=?,notes=? WHERE id=? AND school_id=?", return_date, condition, clean(notes) || null, record.id, sid);
        await t.run('UPDATE copies SET status=?,condition=?,notes=? WHERE id=? AND school_id=?', copyStatus, condition, clean(notes) || null, record.copy_id, sid);
      });
    } else if (action === 'lost') {
      await req.db.tx(async (t) => {
        await t.run("UPDATE circulation SET status='lost',notes=? WHERE id=? AND school_id=?", clean(notes) || null, record.id, sid);
        await t.run("UPDATE copies SET status='lost',condition='lost',notes=? WHERE id=? AND school_id=?", clean(notes) || null, record.copy_id, sid);
      });
    } else throw new Error('Invalid circulation action.');
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

app.get('/api/problem-books', async (req, res) => {
  try {
    const rows = await req.db.all(`
      SELECT cp.id,cp.copy_code,cp.status,cp.condition,cp.notes,b.title,b.book_id,
        s.name student,COALESCE(c.return_date,c.created_at) reported_date
      FROM copies cp JOIN books b ON b.id=cp.book_id
      LEFT JOIN circulation c ON c.id=(SELECT c2.id FROM circulation c2 WHERE c2.copy_id=cp.id ORDER BY c2.id DESC LIMIT 1)
      LEFT JOIN students s ON s.id=c.student_id
      WHERE cp.school_id=? AND cp.status IN ('lost','damaged') ORDER BY cp.status,b.title,cp.copy_code
    `, req.db.schoolId);
    ok(res, rows);
  } catch (error) { fail(res, error); }
});

app.post('/api/copies/:id/recover', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    const copy = await req.db.get('SELECT * FROM copies WHERE id=? AND school_id=?', req.params.id, sid);
    if (!copy) throw new Error('Book copy not found.');
    await req.db.run("UPDATE copies SET status='available',condition='good',notes=NULL WHERE id=? AND school_id=?", req.params.id, sid);
    ok(res, { success: true });
  } catch (error) { fail(res, error); }
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
app.get('/api/report-view/:type', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    let payload;
    switch (req.params.type) {
      case 'student-participation': {
        const rows = await req.db.all(`
          SELECT s.student_code,s.name,g.name grade,se.name section,s.gq,
            CASE WHEN EXISTS(SELECT 1 FROM circulation c WHERE c.student_id=s.id AND c.status='active') THEN 'With Book' ELSE 'Without Book' END status
          FROM students s JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id
          WHERE s.school_id=? AND s.active=1 ORDER BY g.id,se.id,s.name
        `, sid);
        const chart = await req.db.all(`
          SELECT g.name grade,COUNT(DISTINCT s.id) total,
            COUNT(DISTINCT CASE WHEN c.status='active' THEN s.id END) with_books,
            COUNT(DISTINCT s.id)-COUNT(DISTINCT CASE WHEN c.status='active' THEN s.id END) without_books
          FROM grades g LEFT JOIN students s ON s.grade_id=g.id AND s.active=1
          LEFT JOIN circulation c ON c.student_id=s.id AND c.status='active'
          WHERE g.school_id=? AND g.active=1 GROUP BY g.id,g.name ORDER BY g.id
        `, sid);
        payload = { chartType: 'bar', categoryKey: 'grade', series: [['with_books', 'With Book'], ['without_books', 'Without Book']], chart, rows, chartFilterMap: { with_books: 'grade', without_books: 'grade' } };
        break;
      }
      case 'inventory': {
        const rows = await req.db.all(`
          SELECT b.book_id,b.title,b.author,b.gq,cp.copy_code,
            CASE cp.status WHEN 'available' THEN 'Available' WHEN 'issued' THEN 'Issued' WHEN 'lost' THEN 'Lost' WHEN 'damaged' THEN 'Damaged' ELSE cp.status END status,
            cp.condition,cp.notes
          FROM copies cp JOIN books b ON b.id=cp.book_id WHERE b.school_id=? AND b.active=1 ORDER BY b.title,cp.copy_code
        `, sid);
        const chart = await req.db.all(`SELECT CASE status WHEN 'available' THEN 'Available' WHEN 'issued' THEN 'Issued' WHEN 'lost' THEN 'Lost' WHEN 'damaged' THEN 'Damaged' ELSE status END status,COUNT(*) count FROM copies WHERE school_id=? GROUP BY status ORDER BY count DESC`, sid);
        payload = { chartType: 'bar', categoryKey: 'status', series: [['count', 'Copies']], filterKey: 'status', chart, rows };
        break;
      }
      case 'circulation': {
        const rows = (await req.db.all(`
          SELECT c.id,s.student_code,s.name student,g.name grade,se.name section,b.title,cp.copy_code,c.issue_date,c.due_date,c.return_date,
            CASE WHEN c.renewed_at IS NOT NULL THEN substr(c.renewed_at,1,10) ELSE NULL END renewal_date,c.status
          FROM circulation c JOIN students s ON s.id=c.student_id JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id
          JOIN copies cp ON cp.id=c.copy_id JOIN books b ON b.id=cp.book_id WHERE c.school_id=? ORDER BY c.created_at DESC,c.id DESC
        `, sid)).map((r) => ({ ...r, month: String(r.issue_date || '').slice(0, 7) }));
        const chart = await req.db.all(`
          WITH months AS (SELECT substr(issue_date,1,7) month FROM circulation WHERE school_id=? UNION SELECT substr(return_date,1,7) FROM circulation WHERE school_id=? AND return_date IS NOT NULL UNION SELECT substr(renewed_at,1,7) FROM circulation WHERE school_id=? AND renewed_at IS NOT NULL)
          SELECT m.month,(SELECT COUNT(*) FROM circulation c WHERE c.school_id=? AND substr(c.issue_date,1,7)=m.month) issues,(SELECT COUNT(*) FROM circulation c WHERE c.school_id=? AND substr(c.return_date,1,7)=m.month) returns,(SELECT COUNT(*) FROM circulation c WHERE c.school_id=? AND substr(c.renewed_at,1,7)=m.month) renewals FROM months m WHERE m.month IS NOT NULL ORDER BY m.month
        `, sid, sid, sid, sid, sid, sid);
        payload = { chartType: 'line', categoryKey: 'month', series: [['issues', 'Issues'], ['returns', 'Returns'], ['renewals', 'Renewals']], filterKey: 'month', chart, rows };
        break;
      }
      case 'book-usage': {
        const rows = await req.db.all(`
          SELECT b.book_id,b.title,b.author,b.gq,COUNT(c.id) total_issues,
            SUM(CASE WHEN c.status='active' THEN 1 ELSE 0 END) active_issues,
            SUM(CASE WHEN c.status='returned' THEN 1 ELSE 0 END) returns
          FROM books b LEFT JOIN copies cp ON cp.book_id=b.id LEFT JOIN circulation c ON c.copy_id=cp.id
          WHERE b.school_id=? AND b.active=1 GROUP BY b.id ORDER BY total_issues DESC,b.title
        `, sid);
        payload = { chartType: 'bar', categoryKey: 'title', series: [['total_issues', 'Total Issues']], filterKey: 'title', chart: rows.slice(0, 12), rows };
        break;
      }
      case 'gq-coverage': {
        const rows = await req.db.all(`
          WITH gqs AS (SELECT gq FROM students WHERE school_id=? AND active=1 UNION SELECT gq FROM books WHERE school_id=? AND active=1)
          SELECT printf('GQ %g',gqs.gq) gq_label,gqs.gq,
            (SELECT COUNT(*) FROM students s WHERE s.school_id=? AND s.active=1 AND s.gq=gqs.gq) students,
            (SELECT COUNT(*) FROM copies cp JOIN books b ON b.id=cp.book_id WHERE b.school_id=? AND b.active=1 AND b.gq=gqs.gq AND cp.status='available') available_copies
          FROM gqs ORDER BY gqs.gq
        `, sid, sid, sid, sid);
        payload = { chartType: 'bar', categoryKey: 'gq_label', series: [['students', 'Students'], ['available_copies', 'Available Copies']], filterKey: 'gq', chart: rows, rows };
        break;
      }
      case 'overdue': {
        const rows = await req.db.all(`SELECT s.student_code,s.name,g.name grade,se.name section,b.title,cp.copy_code,c.issue_date,c.due_date,CAST(julianday('now')-julianday(c.due_date) AS INTEGER) days_overdue FROM circulation c JOIN students s ON s.id=c.student_id JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id JOIN copies cp ON cp.id=c.copy_id JOIN books b ON b.id=cp.book_id WHERE c.school_id=? AND c.status='active' AND date(c.due_date)<date('now') ORDER BY c.due_date`, sid);
        const chart = await req.db.all(`SELECT g.name grade,COUNT(*) overdue FROM circulation c JOIN students s ON s.id=c.student_id JOIN grades g ON g.id=s.grade_id WHERE c.school_id=? AND c.status='active' AND date(c.due_date)<date('now') GROUP BY g.id,g.name ORDER BY g.id`, sid);
        payload = { chartType: 'bar', categoryKey: 'grade', series: [['overdue', 'Overdue']], filterKey: 'grade', chart, rows };
        break;
      }
      case 'problem-books': {
        const rows = await req.db.all(`SELECT b.book_id,b.title,cp.copy_code,CASE cp.status WHEN 'lost' THEN 'Lost' WHEN 'damaged' THEN 'Damaged' ELSE cp.status END status,cp.condition,s.name student,cp.notes FROM copies cp JOIN books b ON b.id=cp.book_id LEFT JOIN circulation c ON c.id=(SELECT c2.id FROM circulation c2 WHERE c2.copy_id=cp.id ORDER BY c2.id DESC LIMIT 1) LEFT JOIN students s ON s.id=c.student_id WHERE cp.school_id=? AND cp.status IN ('lost','damaged') ORDER BY cp.status,b.title`, sid);
        const chart = await req.db.all(`SELECT CASE status WHEN 'lost' THEN 'Lost' WHEN 'damaged' THEN 'Damaged' ELSE status END status,COUNT(*) count FROM copies WHERE school_id=? AND status IN ('lost','damaged') GROUP BY status`, sid);
        payload = { chartType: 'bar', categoryKey: 'status', series: [['count', 'Copies']], filterKey: 'status', chart, rows };
        break;
      }
      default: throw new Error('Unknown report type.');
    }
    ok(res, payload);
  } catch (error) { fail(res, error); }
});

app.get('/api/report/:type', async (req, res) => {
  try {
    const sid = req.db.schoolId;
    let rows;
    switch (req.params.type) {
      case 'students-with-books':
        rows = await req.db.all(`SELECT s.student_code,s.name,g.name grade,se.name section,s.gq,b.title book,cp.copy_code,c.issue_date,c.due_date FROM circulation c JOIN students s ON s.id=c.student_id JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id JOIN copies cp ON cp.id=c.copy_id JOIN books b ON b.id=cp.book_id WHERE c.school_id=? AND c.status='active' ORDER BY g.id,se.id,s.name`, sid); break;
      case 'students-without-books':
        rows = await req.db.all(`SELECT s.student_code,s.name,g.name grade,se.name section,s.gq FROM students s JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id WHERE s.school_id=? AND s.active=1 AND NOT EXISTS(SELECT 1 FROM circulation c WHERE c.student_id=s.id AND c.status='active') ORDER BY g.id,se.id,s.name`, sid); break;
      case 'overdue':
        rows = await req.db.all(`SELECT s.student_code,s.name,g.name grade,se.name section,b.title book,cp.copy_code,c.issue_date,c.due_date,CAST(julianday('now')-julianday(c.due_date) AS INTEGER) days_overdue FROM circulation c JOIN students s ON s.id=c.student_id JOIN grades g ON g.id=s.grade_id JOIN sections se ON se.id=s.section_id JOIN copies cp ON cp.id=c.copy_id JOIN books b ON b.id=cp.book_id WHERE c.school_id=? AND c.status='active' AND date(c.due_date)<date('now') ORDER BY c.due_date`, sid); break;
      case 'problem-books':
        rows = await req.db.all(`SELECT b.book_id,b.title,cp.copy_code,cp.status,cp.condition,s.name student,cp.notes FROM copies cp JOIN books b ON b.id=cp.book_id LEFT JOIN circulation c ON c.id=(SELECT c2.id FROM circulation c2 WHERE c2.copy_id=cp.id ORDER BY c2.id DESC LIMIT 1) LEFT JOIN students s ON s.id=c.student_id WHERE cp.school_id=? AND cp.status IN ('lost','damaged') ORDER BY cp.status,b.title`, sid); break;
      case 'circulation-summary':
        rows = await req.db.all(`SELECT substr(issue_date,1,7) month,COUNT(*) total_issues,SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) returned,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) lost FROM circulation WHERE school_id=? GROUP BY substr(issue_date,1,7) ORDER BY month DESC`, sid); break;
      default:
        rows = await req.db.all(`SELECT b.book_id,b.title,b.author,b.gq,COUNT(cp.id) total_copies,SUM(CASE WHEN cp.status='available' THEN 1 ELSE 0 END) available,SUM(CASE WHEN cp.status='issued' THEN 1 ELSE 0 END) issued,SUM(CASE WHEN cp.status='lost' THEN 1 ELSE 0 END) lost,SUM(CASE WHEN cp.status='damaged' THEN 1 ELSE 0 END) damaged FROM books b LEFT JOIN copies cp ON cp.book_id=b.id WHERE b.school_id=? AND b.active=1 GROUP BY b.id ORDER BY b.title`, sid);
    }
    ok(res, rows || []);
  } catch (error) { fail(res, error); }
});

// ---------------------------------------------------------------------------
// Server entry: listen locally; export the app for the Vercel serverless handler.
// ---------------------------------------------------------------------------
if (process.env.VERCEL === undefined) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`GroBro API running at http://localhost:${port}`));
}

export default app;
