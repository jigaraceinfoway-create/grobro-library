import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Dev talks to the local Express server; production build calls the same-origin
// serverless function under /api. Override with VITE_API_BASE if needed.
const API = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api');

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('grobroToken') ? { Authorization: `Bearer ${localStorage.getItem('grobroToken')}` } : {}), ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('grobroUser') || 'null'); } catch { return null; }
  });
  const [page, setPage] = useState(session?.role === 'super_admin' ? 'admin' : 'dashboard');
  const [pageContext, setPageContext] = useState({});

  const navigate = (nextPage, context = {}) => {
    setPageContext(context);
    setPage(nextPage);
  };

  if (!session || !localStorage.getItem('grobroToken')) {
    return <Login onLogin={(user) => { setSession(user); setPage(user.role === 'super_admin' ? 'admin' : 'dashboard'); }} />;
  }

  if (session.role === 'super_admin') {
    return <AdminShell user={session} logout={() => { localStorage.removeItem('grobroToken'); localStorage.removeItem('grobroUser'); setSession(null); }} />;
  }

  return (
    <Shell
      page={page}
      navigate={navigate}
      pageContext={pageContext}
      user={session}
      logout={() => {
        localStorage.removeItem('grobroToken');
        localStorage.removeItem('grobroUser');
        setSession(null);
      }}
    />
  );
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/login', { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem('grobroToken', result.token);
      localStorage.setItem('grobroUser', JSON.stringify(result.user));
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page login-page-refined">
      <section className="login-visual-panel">
        <img src="/login-reading.jpg" alt="Students reading together in a school library" />
        <div className="login-visual-shade" />
        <div className="login-visual-content">
          <div className="login-visual-badge">GQ-BASED LIBRARY MANAGEMENT</div>
          <h2>Every learner gets the right book at the right reading level.</h2>
          <p>Manage multiple school libraries with isolated records, traceable circulation and measurable reading access.</p>
          <div className="login-feature-row">
            <span>Separate school libraries</span>
            <span>Traceable records</span>
            <span>GQ-based issuing</span>
          </div>
        </div>
      </section>

      <section className="login-form-panel login-form-panel-refined">
        <div className="login-form-card">
          <div className="login-brand-row login-brand-centered">
            <div className="logo-mark">G</div>
            <div>
              <div className="brand-name">GroBro.ai</div>
              <div className="brand-caption">School Library Module</div>
            </div>
          </div>

          <div className="login-copy login-copy-refined">
            <span className="eyebrow">SECURE ACCESS</span>
            <h1>Welcome back</h1>
            <p>Sign in with the account created for your school or Super Admin access.</p>
          </div>

          <form className="login-form login-form-refined" onSubmit={submit}>
            <Field label="Username">
              <div className="login-input-wrap">
                <span className="login-input-icon">@</span>
                <input
                  autoFocus
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Enter your username"
                  required
                />
              </div>
            </Field>
            <Field label="Password">
              <div className="login-input-wrap">
                <span className="login-input-icon">•</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter your password"
                  required
                />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>
            {error && <div className="alert error-alert">{error}</div>}
            <button className="btn primary wide-button login-submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="login-security-note">
            <span>✓</span>
            <p>Your account only opens the school library linked to it.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Shell({ page, navigate, pageContext, user, logout }) {
  const nav = [
    ['dashboard', 'Dashboard', '▦'],
    ['books', 'Books', '▤'],
    ['students', 'Students', '◉'],
    ['issue', 'Issue Books', '↗'],
    ['circulation', 'Circulation', '⇄'],
    ['problems', 'Lost & Damaged', '⚠'],
    ['reports', 'Reports', '▥'],
    ['settings', 'Settings', '⚙'],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo-mark small">G</div>
          <div>
            <div className="brand-name light">GroBro.ai</div>
            <div className="brand-caption light-muted">Library Module</div>
          </div>
        </div>
        <nav>
          {nav.map(([id, label, icon]) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}>
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">L</div>
            <div><b>{user.full_name || user.username}</b><small>{user.school_name}</small></div>
          </div>
          <button className="nav-item logout" onClick={logout}><span className="nav-icon">↪</span> Logout</button>
        </div>
      </aside>
      <main className="main-content">
        {page === 'dashboard' && <Dashboard navigate={navigate} />}
        {page === 'books' && <Books initialAction={pageContext.action} />}
        {page === 'students' && <Students initialAction={pageContext.action} />}
        {page === 'issue' && <IssueBooks />}
        {page === 'circulation' && <Circulation initialTab={pageContext.tab} />}
        {page === 'problems' && <ProblemBooks />}
        {page === 'reports' && <Reports initialReport={pageContext.report} initialFilter={pageContext.filter} />}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  );
}

function AdminShell({ user, logout }) {
  const [tab, setTab] = useState('schools');
  const adminPages = [
    { id: 'schools', label: 'Schools', icon: '▦' },
    { id: 'accounts', label: 'Accounts', icon: '◉' },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="logo-mark small">G</div><div><div className="brand-name light">GroBro.ai</div><div className="brand-caption light-muted">Super Admin</div></div></div>
        <nav>
          {adminPages.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><div className="user-chip"><div className="avatar">A</div><div><b>{user.full_name || 'Super Admin'}</b><small>All schools</small></div></div><button type="button" className="nav-item logout" onClick={logout}><span className="nav-icon">↪</span> Logout</button></div>
      </aside>
      <main className="main-content" key={tab}>
        {tab === 'schools' && <AdminSchools />}
        {tab === 'accounts' && <AdminAccounts />}
      </main>
    </div>
  );
}

function AdminSchools() {
  const empty = { name:'', code:'', address:'', contact_name:'', contact_email:'', contact_phone:'', full_name:'', username:'', password:'', role:'librarian' };
  const [schools,setSchools]=useState([]); const [form,setForm]=useState(empty); const [show,setShow]=useState(false); const [error,setError]=useState('');
  const load=()=>api('/admin/schools').then(setSchools).catch(e=>setError(e.message));
  useEffect(load,[]);
  async function create(e){e.preventDefault();setError('');try{await api('/admin/schools',{method:'POST',body:JSON.stringify(form)});setForm(empty);setShow(false);load();}catch(err){setError(err.message)}}
  async function toggle(school){try{await api(`/admin/schools/${school.id}`,{method:'PUT',body:JSON.stringify({...school,active:!school.active})});load();}catch(err){setError(err.message)}}
  return <>
    <PageHeader title="School Management" subtitle="Create and manage separate, isolated school libraries."><button className="btn primary" onClick={()=>setShow(true)}>+ Create School</button></PageHeader>
    {error&&<div className="alert error-alert">{error}</div>}
    <div className="panel"><div className="table-wrap"><table><thead><tr><th>School</th><th>Code</th><th>Contact</th><th>Accounts</th><th>Status</th><th>Action</th></tr></thead><tbody>{schools.map(s=><tr key={s.id}><td><b>{s.name}</b><small className="table-subtext">{s.address||'No address added'}</small></td><td>{s.code}</td><td>{s.contact_name||'—'}<small className="table-subtext">{s.contact_email||s.contact_phone||''}</small></td><td>{s.account_count}</td><td><span className={`status ${s.active?'available':'inactive'}`}>{s.active?'Active':'Inactive'}</span></td><td><button className="btn small secondary" onClick={()=>toggle(s)}>{s.active?'Deactivate':'Activate'}</button></td></tr>)}</tbody></table>{!schools.length&&<EmptyState title="No schools found" text="Create the first school library."/>}</div></div>
    {show&&<Modal title="Create New School" onClose={()=>setShow(false)}><form onSubmit={create}><div className="form-grid"><Field label="School Name"><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="School Code"><input required value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="e.g. ABC001"/></Field><Field label="Address"><input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></Field><Field label="Contact Person"><input value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></Field><Field label="Contact Email"><input type="email" value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})}/></Field><Field label="Contact Phone"><input value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})}/></Field></div><h3 className="form-section-title">First School Account</h3><div className="form-grid"><Field label="Account Name"><input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></Field><Field label="Username"><input required value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></Field><Field label="Password"><input required type="password" minLength="6" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field><Field label="Role"><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="librarian">Librarian</option><option value="school_admin">School Admin</option></select></Field></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setShow(false)}>Cancel</button><button className="btn primary">Create School</button></div></form></Modal>}
  </>;
}

function AdminAccounts() {
  const empty = { school_id: '', full_name: '', username: '', password: '', role: 'librarian' };
  const [schools, setSchools] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [schoolFilter, setSchoolFilter] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [schoolRows, accountRows] = await Promise.all([
        api('/admin/schools'),
        api('/admin/accounts'),
      ]);
      setSchools(schoolRows.filter((school) => school.active));
      setAccounts(accountRows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/admin/accounts', { method: 'POST', body: JSON.stringify(form) });
      setForm(empty);
      setShow(false);
      await load();
    } catch (err) { setError(err.message); }
  }

  async function saveEdit(event) {
    event.preventDefault();
    setError('');
    try {
      await api(`/admin/accounts/${edit.id}`, { method: 'PUT', body: JSON.stringify(edit) });
      setEdit(null);
      await load();
    } catch (err) { setError(err.message); }
  }

  const filteredAccounts = schoolFilter
    ? accounts.filter((account) => String(account.school_id) === String(schoolFilter))
    : accounts;

  return <>
    <PageHeader title="School Accounts" subtitle="Create and manage accounts that can access only their assigned school library.">
      <button type="button" className="btn primary" onClick={() => setShow(true)} disabled={!schools.length}>+ Add Account</button>
    </PageHeader>
    {error && <div className="alert error-alert">{error}</div>}
    <div className="panel filter-panel admin-account-filter">
      <Field label="Filter by School">
        <select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)}>
          <option value="">All Schools</option>
          {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
        </select>
      </Field>
      <span className="record-count">{filteredAccounts.length} account{filteredAccounts.length === 1 ? '' : 's'}</span>
    </div>
    <div className="panel">
      {loading ? <Loading /> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>School</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredAccounts.map((account) => <tr key={account.id}><td>{account.full_name || '—'}</td><td><b>{account.username}</b></td><td>{account.school_name || '—'}</td><td>{account.role === 'school_admin' ? 'School Admin' : 'Librarian'}</td><td><span className={`status ${account.active ? 'available' : 'inactive'}`}>{account.active ? 'Active' : 'Inactive'}</span></td><td><button type="button" className="btn small secondary" onClick={() => setEdit({ ...account, password: '' })}>Edit</button></td></tr>)}</tbody></table>{!filteredAccounts.length && <EmptyState title="No accounts found" text={schools.length ? 'Add an account for a school or change the school filter.' : 'Create an active school before adding accounts.'} />}</div>}
    </div>
    {show && <Modal title="Add School Account" onClose={() => setShow(false)}><form onSubmit={create}><div className="form-grid"><Field label="School"><select required value={form.school_id} onChange={(event) => setForm({ ...form, school_id: event.target.value })}><option value="">Select School</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></Field><Field label="Full Name"><input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field><Field label="Username"><input required autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field><Field label="Password"><input required type="password" autoComplete="new-password" minLength="6" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field><Field label="Role"><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="librarian">Librarian</option><option value="school_admin">School Admin</option></select></Field></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setShow(false)}>Cancel</button><button className="btn primary">Add Account</button></div></form></Modal>}
    {edit && <Modal title="Edit Account" onClose={() => setEdit(null)}><form onSubmit={saveEdit}><div className="form-grid"><Field label="Full Name"><input value={edit.full_name || ''} onChange={(event) => setEdit({ ...edit, full_name: event.target.value })} /></Field><Field label="Role"><select value={edit.role} onChange={(event) => setEdit({ ...edit, role: event.target.value })}><option value="librarian">Librarian</option><option value="school_admin">School Admin</option></select></Field><Field label="New Password (optional)"><input type="password" autoComplete="new-password" minLength="6" value={edit.password || ''} onChange={(event) => setEdit({ ...edit, password: event.target.value })} /></Field><Field label="Status"><select value={edit.active ? '1' : '0'} onChange={(event) => setEdit({ ...edit, active: event.target.value === '1' })}><option value="1">Active</option><option value="0">Inactive</option></select></Field></div><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save Changes</button></div></form></Modal>}
  </>;
}

function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle || 'All figures are calculated from saved records.'}</p>
      </div>
      <div className="header-actions">{children}</div>
    </div>
  );
}

function Dashboard({ navigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  const cards = [
    { label: 'Total Students', value: data.students, page: 'students', icon: '◉' },
    { label: 'Students with Books', value: data.studentsWithBooks, page: 'circulation', context: { tab: 'active' }, icon: '↗' },
    { label: 'Students without Books', value: data.studentsWithoutBooks, page: 'reports', context: { report: 'student-participation', filter: { status: 'Without Book' } }, icon: '○' },
    { label: 'Book Titles', value: data.titles, page: 'books', icon: '▤' },
    { label: 'Available Copies', value: data.available, page: 'reports', context: { report: 'inventory', filter: { status: 'Available' } }, icon: '✓' },
    { label: 'Issued Copies', value: data.issued, page: 'circulation', context: { tab: 'active' }, icon: '⇄' },
    { label: 'Overdue', value: data.overdue, page: 'reports', context: { report: 'overdue' }, icon: '!' },
    { label: 'Lost / Damaged', value: data.lost + data.damaged, page: 'reports', context: { report: 'problem-books' }, icon: '⚠' },
  ];

  const openReport = (report, filter = {}) => navigate('reports', { report, filter });

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live library overview based on your saved data." />
      <div className="metric-grid">
        {cards.map((card) => (
          <button key={card.label} className="metric-card" onClick={() => navigate(card.page, card.context || {})}>
            <div className="metric-icon">{card.icon}</div>
            <div><strong>{card.value}</strong><span>{card.label}</span></div>
            <span className="card-arrow">›</span>
          </button>
        ))}
      </div>

      <div className="dashboard-grid charts-grid">
        <ChartPanel title="Student participation by grade" subtitle="Students with and without an active book.">
          <GroupedBarChart rows={data.gradeParticipation || []} categoryKey="grade" series={[['with_books', 'With Book'], ['without_books', 'Without Book']]} onSelect={(row, series) => openReport('student-participation', { grade: row.grade, status: series === 'with_books' ? 'With Book' : 'Without Book' })} />
        </ChartPanel>
        <ChartPanel title="Inventory status" subtitle="Current status of every physical copy.">
          <SimpleBarChart rows={data.inventoryStatus || []} labelKey="status" valueKey="count" onSelect={(row) => openReport('inventory', { status: row.status })} />
        </ChartPanel>
        <ChartPanel title="Monthly circulation trend" subtitle="Issues, returns and renewals by month.">
          <LineChart rows={data.monthlyCirculation || []} categoryKey="month" series={[['issues', 'Issues'], ['returns', 'Returns'], ['renewals', 'Renewals']]} onSelect={(row) => openReport('circulation', { month: row.month })} />
        </ChartPanel>
        <ChartPanel title="GQ-wise book availability" subtitle="Available physical copies at each Book GQ.">
          <SimpleBarChart rows={data.gqAvailability || []} labelKey="gq_label" valueKey="available" onSelect={(row) => openReport('gq-coverage', { gq: String(row.gq) })} compact />
        </ChartPanel>
        <ChartPanel title="Overdue books by grade" subtitle="Active issues past their due date.">
          <SimpleBarChart rows={data.overdueByGrade || []} labelKey="grade" valueKey="overdue" onSelect={(row) => openReport('overdue', { grade: row.grade })} />
        </ChartPanel>
        <section className="panel">
          <div className="panel-heading"><div><h2>Quick actions</h2><p>Start common library tasks.</p></div></div>
          <div className="quick-action-grid">
            <button className="quick-action" onClick={() => navigate('books', { action: 'add' })}><span>＋</span><b>Add Book</b><small>Create title and copies</small></button>
            <button className="quick-action" onClick={() => navigate('students', { action: 'add' })}><span>＋</span><b>Add Student</b><small>Save grade, section and GQ</small></button>
            <button className="quick-action" onClick={() => navigate('issue')}><span>↗</span><b>Issue Book</b><small>Match by student GQ</small></button>
            <button className="quick-action" onClick={() => navigate('circulation', { tab: 'active' })}><span>⇄</span><b>Return / Renew</b><small>Manage active issues</small></button>
          </div>
        </section>
      </div>
    </>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return <section className="panel chart-panel"><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}

function SimpleBarChart({ rows, labelKey, valueKey, onSelect, compact = false }) {
  if (!rows.length) return <EmptyState title="No chart data yet" text="The graph will populate automatically from saved records." />;
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  return <div className={`visual-bar-chart ${compact ? 'compact-bars' : ''}`}>
    {rows.map((row, index) => {
      const value = Number(row[valueKey]) || 0;
      return <button className="visual-bar-item" key={`${row[labelKey]}-${index}`} onClick={() => onSelect?.(row)} title={`Open ${row[labelKey]} records`}>
        <span className="visual-bar-value">{value}</span>
        <span className="visual-bar-column"><i style={{ height: `${Math.max(4, (value / max) * 100)}%` }} /></span>
        <span className="visual-bar-label">{row[labelKey]}</span>
      </button>;
    })}
  </div>;
}

function GroupedBarChart({ rows, categoryKey, series, onSelect }) {
  if (!rows.length) return <EmptyState title="No chart data yet" text="The graph will populate automatically from saved records." />;
  const max = Math.max(...rows.flatMap((row) => series.map(([key]) => Number(row[key]) || 0)), 1);
  return <div className="grouped-chart">
    <div className="chart-legend">{series.map(([key, label]) => <span key={key}><i className={`legend-dot series-${key}`} />{label}</span>)}</div>
    <div className="grouped-bars">
      {rows.map((row) => <div className="grouped-item" key={row[categoryKey]}>
        <div className="grouped-columns">{series.map(([key, label]) => {
          const value = Number(row[key]) || 0;
          return <button key={key} className={`grouped-column series-${key}`} style={{ height: `${Math.max(4, (value / max) * 100)}%` }} onClick={() => onSelect?.(row, key)} title={`${row[categoryKey]} — ${label}: ${value}`}><span>{value}</span></button>;
        })}</div>
        <span className="grouped-label">{row[categoryKey]}</span>
      </div>)}
    </div>
  </div>;
}

function LineChart({ rows, categoryKey, series, onSelect }) {
  if (!rows.length) return <EmptyState title="No circulation activity yet" text="Issue, renew or return books to populate this graph." />;
  const width = 720, height = 230, padX = 38, padY = 24;
  const max = Math.max(...rows.flatMap((row) => series.map(([key]) => Number(row[key]) || 0)), 1);
  const x = (index) => rows.length === 1 ? width / 2 : padX + (index * (width - padX * 2)) / (rows.length - 1);
  const y = (value) => height - padY - ((Number(value) || 0) / max) * (height - padY * 2);
  return <div className="line-chart-wrap">
    <div className="chart-legend">{series.map(([key, label]) => <span key={key}><i className={`legend-dot series-${key}`} />{label}</span>)}</div>
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img">
      {[0, .25, .5, .75, 1].map((tick) => <line key={tick} x1={padX} x2={width-padX} y1={y(max*tick)} y2={y(max*tick)} className="chart-grid-line" />)}
      {series.map(([key]) => {
        const points = rows.map((row, index) => `${x(index)},${y(row[key])}`).join(' ');
        return <g key={key}><polyline points={points} className={`chart-line series-${key}`} />{rows.map((row, index) => <circle key={`${key}-${index}`} cx={x(index)} cy={y(row[key])} r="6" className={`chart-point series-${key}`} onClick={() => onSelect?.(row, key)}><title>{`${row[categoryKey]}: ${row[key] || 0}`}</title></circle>)}</g>;
      })}
      {rows.map((row, index) => <text key={row[categoryKey]} x={x(index)} y={height-3} textAnchor="middle" className="chart-axis-label">{row[categoryKey]}</text>)}
    </svg>
  </div>;
}


function PieChart({ rows, labelKey, valueKey, onSelect, donut = true }) {
  if (!rows.length) return <EmptyState title="No chart data yet" text="The graph will populate automatically from saved records." />;
  const total = rows.reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0) || 1;
  let cursor = 0;
  const colors = ['#246BCE','#65A3F3','#F2A23A','#E06A5F','#7D8CA3','#56B890'];
  const segments = rows.map((row, index) => {
    const value = Number(row[valueKey]) || 0;
    const start = cursor;
    cursor += (value / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(', ');
  return <div className="pie-chart-layout">
    <button className={`pie-chart ${donut ? 'donut' : ''}`} style={{ background: `conic-gradient(${segments})` }} onClick={() => {}} aria-label="Chart">
      {donut && <span><b>{total}</b><small>Total</small></span>}
    </button>
    <div className="pie-legend">{rows.map((row, index) => {
      const value = Number(row[valueKey]) || 0;
      const percentage = Math.round((value / total) * 100);
      return <button key={`${row[labelKey]}-${index}`} onClick={() => onSelect?.(row)}><i style={{ background: colors[index % colors.length] }} /><span>{row[labelKey]}</span><b>{value}</b><small>{percentage}%</small></button>;
    })}</div>
  </div>;
}

function Books({ initialAction }) {
  const [list, setList] = useState([]);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [error, setError] = useState('');

  const load = () => api('/books').then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (initialAction === 'add') setModal({ type: 'form', book: null }); }, [initialAction]);

  const filtered = list.filter((book) => [book.book_id, book.title, book.author, book.isbn].some((x) => String(x || '').toLowerCase().includes(query.toLowerCase())));

  async function remove(book) {
    if (!window.confirm(`Remove “${book.title}” from active inventory? Historical records will remain saved.`)) return;
    try { await api(`/books/${book.id}`, { method: 'DELETE' }); await load(); } catch (e) { alert(e.message); }
  }

  return (
    <>
      <PageHeader title="Books" subtitle="Add, update and trace every book title and physical copy.">
        <button className="btn secondary" onClick={() => setBulkOpen(true)}>⇧ Bulk Upload</button>
        <button className="btn primary" onClick={() => setModal({ type: 'form', book: null })}>＋ Add Book</button>
      </PageHeader>
      {error && <div className="alert error-alert">{error}</div>}
      <section className="panel">
        <div className="toolbar">
          <div className="search-box">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, author, ISBN or Book ID" /></div>
          <span className="record-count">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
        </div>
        <Table
          columns={['Book ID', 'Title', 'Author', 'GQ', 'Total Copies', 'Available', 'Issued', 'Lost', 'Damaged', 'Actions']}
          empty={<EmptyState title="No books added" text="Add the first book to create your live inventory." action={<button className="btn primary" onClick={() => setModal({ type: 'form', book: null })}>Add Book</button>} />}
        >
          {filtered.map((book) => (
            <tr key={book.id}>
              <td><span className="code">{book.book_id}</span></td>
              <td><button className="text-link" onClick={() => setModal({ type: 'details', book })}>{book.title}</button></td>
              <td>{book.author || '—'}</td>
              <td><GQ value={book.gq} /></td>
              <td>{book.copies || 0}</td><td>{book.available || 0}</td><td>{book.issued || 0}</td><td>{book.lost || 0}</td><td>{book.damaged || 0}</td>
              <td><div className="row-actions"><button className="btn small secondary" onClick={() => setModal({ type: 'details', book })}>View</button><button className="icon-btn danger-icon" title="Remove book" onClick={() => remove(book)}>×</button></div></td>
            </tr>
          ))}
        </Table>
      </section>
      {modal?.type === 'form' && <BookForm book={modal.book} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.type === 'details' && <BookDetails bookId={modal.book.id} onClose={() => setModal(null)} onEdit={(book) => setModal({ type: 'form', book })} onChanged={load} />}
      {bulkOpen && <BulkImportModal type="books" onClose={() => setBulkOpen(false)} onImported={() => { setBulkOpen(false); load(); }} />}
    </>
  );
}

function BookDetails({ bookId, onClose, onEdit, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api(`/books/${bookId}`).then(setData).catch((e) => setError(e.message));
  useEffect(load, [bookId]);

  async function addCopies() {
    const quantity = Number(window.prompt('How many copies do you want to add?', '1'));
    if (!Number.isInteger(quantity) || quantity < 1) return;
    try { await api(`/books/${bookId}/copies`, { method: 'POST', body: JSON.stringify({ quantity }) }); await load(); onChanged(); } catch (e) { alert(e.message); }
  }

  if (error) return <Modal title="Book Details" onClose={onClose}><ErrorState message={error} /></Modal>;
  if (!data) return <Modal title="Book Details" onClose={onClose}><Loading /></Modal>;
  const { book, copies, history } = data;

  return (
    <Modal title="Book Details" onClose={onClose} large>
      <div className="detail-header">
        <div><span className="code">{book.book_id}</span><h2>{book.title}</h2><p>{book.author || 'Author not entered'} · <GQ value={book.gq} /></p></div>
        <div className="header-actions"><button className="btn secondary" onClick={() => onEdit(book)}>Edit Metadata</button><button className="btn primary" onClick={addCopies}>＋ Add Copies</button></div>
      </div>
      <div className="detail-grid">
        {[
          ['ISBN', book.isbn], ['Subtitle', book.subtitle], ['Publisher', book.publisher], ['Publication Year', book.publication_year], ['Edition', book.edition], ['Language', book.language], ['Category', book.category], ['Registration Date', book.registration_date], ['Shelf / Rack', book.shelf_location], ['Price', book.price], ['Supplier', book.supplier], ['Description', book.description],
        ].map(([label, value]) => <div className="detail-item" key={label}><span>{label}</span><b>{value || '—'}</b></div>)}
      </div>
      <h3 className="section-title">Physical Copies</h3>
      <Table columns={['Copy ID', 'Status', 'Condition', 'Notes']} empty={<EmptyState title="No copies" text="Add a copy to make this title issuable." />}>
        {copies.map((copy) => <tr key={copy.id}><td><span className="code">{copy.copy_code}</span></td><td><Status value={copy.status} /></td><td>{copy.condition}</td><td>{copy.notes || '—'}</td></tr>)}
      </Table>
      <h3 className="section-title">Circulation History</h3>
      <Table columns={['Student', 'Grade', 'Issue Date', 'Due Date', 'Return Date', 'Status']} empty={<EmptyState title="No circulation history" text="This book has not been issued yet." />}>
        {history.map((row) => <tr key={row.id}><td>{row.student}</td><td>{row.grade} {row.section}</td><td>{row.issue_date}</td><td>{row.due_date}</td><td>{row.return_date || '—'}</td><td><Status value={row.status} /></td></tr>)}
      </Table>
    </Modal>
  );
}

function BookForm({ book, onClose, onSaved }) {
  const initial = book || { book_id: '', isbn: '', title: '', subtitle: '', author: '', publisher: '', publication_year: '', edition: '', language: 'English', category: '', gq: '', registration_date: today(), total_copies: 1, shelf_location: '', price: '', supplier: '', description: '' };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(book ? `/books/${book.id}` : '/books', { method: book ? 'PUT' : 'POST', body: JSON.stringify(form) });
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <Modal title={book ? 'Edit Book Metadata' : 'Add New Book'} onClose={onClose} large>
      <form className="form-grid" onSubmit={save}>
        <Field label="Book ID" required><input value={form.book_id} onChange={(e) => update('book_id', e.target.value)} required /></Field>
        <Field label="ISBN"><input value={form.isbn || ''} onChange={(e) => update('isbn', e.target.value)} /></Field>
        <Field label="Book GQ" required><input type="number" step="0.01" value={form.gq} onChange={(e) => update('gq', e.target.value)} required /></Field>
        <Field label="Title" required className="span-2"><input value={form.title} onChange={(e) => update('title', e.target.value)} required /></Field>
        <Field label="Subtitle"><input value={form.subtitle || ''} onChange={(e) => update('subtitle', e.target.value)} /></Field>
        <Field label="Author"><input value={form.author || ''} onChange={(e) => update('author', e.target.value)} /></Field>
        <Field label="Publisher"><input value={form.publisher || ''} onChange={(e) => update('publisher', e.target.value)} /></Field>
        <Field label="Publication Year"><input type="number" value={form.publication_year || ''} onChange={(e) => update('publication_year', e.target.value)} /></Field>
        <Field label="Edition"><input value={form.edition || ''} onChange={(e) => update('edition', e.target.value)} /></Field>
        <Field label="Language"><input value={form.language || ''} onChange={(e) => update('language', e.target.value)} /></Field>
        <Field label="Category"><input value={form.category || ''} onChange={(e) => update('category', e.target.value)} /></Field>
        <Field label="Registration Date"><input type="date" value={form.registration_date || ''} onChange={(e) => update('registration_date', e.target.value)} /></Field>
        {!book && <Field label="Total Copies" required><input type="number" min="1" value={form.total_copies} onChange={(e) => update('total_copies', e.target.value)} required /></Field>}
        <Field label="Shelf / Rack"><input value={form.shelf_location || ''} onChange={(e) => update('shelf_location', e.target.value)} /></Field>
        <Field label="Price"><input type="number" min="0" step="0.01" value={form.price || ''} onChange={(e) => update('price', e.target.value)} /></Field>
        <Field label="Supplier"><input value={form.supplier || ''} onChange={(e) => update('supplier', e.target.value)} /></Field>
        <Field label="Description" className="span-3"><textarea value={form.description || ''} onChange={(e) => update('description', e.target.value)} /></Field>
        <div className="form-footer span-3"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save Book'}</button></div>
      </form>
    </Modal>
  );
}

function useGrades() {
  const [grades, setGrades] = useState([]);
  const load = () => api('/grades').then(setGrades);
  useEffect(() => { load(); }, []);
  return [grades, load];
}

function Students({ initialAction }) {
  const [grades] = useGrades();
  const [list, setList] = useState([]);
  const [filters, setFilters] = useState({ grade_id: '', section_id: '', q: '' });
  const [modal, setModal] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = () => api(`/students?${new URLSearchParams(filters)}`).then(setList).catch((e) => alert(e.message));
  useEffect(() => { load(); }, [filters.grade_id, filters.section_id, filters.q]);
  useEffect(() => { if (initialAction === 'add') setModal({ type: 'form', student: null }); }, [initialAction]);

  async function remove(student) {
    if (!window.confirm(`Remove ${student.name} from the active student list? Historical records will remain saved.`)) return;
    try { await api(`/students/${student.id}`, { method: 'DELETE' }); load(); } catch (e) { alert(e.message); }
  }

  return (
    <>
      <PageHeader title="Students" subtitle="Manage students by grade, section and GQ.">
        <button className="btn secondary" onClick={() => setBulkOpen(true)}>⇧ Bulk Upload</button>
        <button className="btn primary" onClick={() => setModal({ type: 'form', student: null })}>＋ Add Student</button>
      </PageHeader>
      <FilterBar grades={grades} value={filters} setValue={setFilters} showSearch searchPlaceholder="Search student name or ID" />
      <section className="panel">
        <Table columns={['Student ID', 'Student Name', 'Grade', 'Section', 'GQ', 'Current Book', 'Status', 'Actions']} empty={<EmptyState title="No students found" text="Add a student or change the selected filters." />}>
          {list.map((student) => (
            <tr key={student.id}>
              <td><span className="code">{student.student_code}</span></td>
              <td><button className="text-link" onClick={() => setModal({ type: 'details', student })}>{student.name}</button></td>
              <td>{student.grade}</td><td>{student.section}</td><td><GQ value={student.gq} /></td>
              <td>{student.current_book || '—'}</td><td><Status value={student.active_issue ? 'issued' : 'eligible'} /></td>
              <td><div className="row-actions"><button className="btn small secondary" onClick={() => setModal({ type: 'form', student })}>Edit</button><button className="icon-btn danger-icon" onClick={() => remove(student)}>×</button></div></td>
            </tr>
          ))}
        </Table>
      </section>
      {modal?.type === 'form' && <StudentForm grades={grades} student={modal.student} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.type === 'details' && <StudentDetails studentId={modal.student.id} onClose={() => setModal(null)} onEdit={(student) => setModal({ type: 'form', student })} />}
      {bulkOpen && <BulkImportModal type="students" onClose={() => setBulkOpen(false)} onImported={() => { setBulkOpen(false); load(); }} />}
    </>
  );
}

function StudentDetails({ studentId, onClose, onEdit }) {
  const [data, setData] = useState(null);
  useEffect(() => { api(`/students/${studentId}`).then(setData).catch((e) => alert(e.message)); }, [studentId]);
  if (!data) return <Modal title="Student Profile" onClose={onClose}><Loading /></Modal>;
  const { student, history } = data;
  return (
    <Modal title="Student Profile" onClose={onClose} large>
      <div className="detail-header">
        <div><span className="code">{student.student_code}</span><h2>{student.name}</h2><p>{student.grade} · Section {student.section} · <GQ value={student.gq} /></p></div>
        <button className="btn secondary" onClick={() => onEdit(student)}>Edit Student</button>
      </div>
      <div className="detail-grid compact">
        <div className="detail-item"><span>Email</span><b>{student.email || '—'}</b></div>
        <div className="detail-item"><span>Phone</span><b>{student.phone || '—'}</b></div>
        <div className="detail-item"><span>Current Book</span><b>{student.current_book || 'No active book'}</b></div>
      </div>
      <h3 className="section-title">Borrowing History</h3>
      <Table columns={['Book', 'Copy ID', 'Issue Date', 'Due Date', 'Return Date', 'Status', 'Condition']} empty={<EmptyState title="No borrowing history" text="This student has not received a book yet." />}>
        {history.map((row) => <tr key={row.id}><td>{row.title}</td><td><span className="code">{row.copy_code}</span></td><td>{row.issue_date}</td><td>{row.due_date}</td><td>{row.return_date || '—'}</td><td><Status value={row.status} /></td><td>{row.return_condition || '—'}</td></tr>)}
      </Table>
    </Modal>
  );
}

function StudentForm({ grades, student, onClose, onSaved }) {
  const [form, setForm] = useState(student || { student_code: '', name: '', grade_id: '', section_id: '', gq: '', email: '', phone: '' });
  const sections = grades.find((g) => String(g.id) === String(form.grade_id))?.sections || [];

  async function save(event) {
    event.preventDefault();
    try {
      await api(student ? `/students/${student.id}` : '/students', { method: student ? 'PUT' : 'POST', body: JSON.stringify(form) });
      onSaved();
    } catch (e) { alert(e.message); }
  }

  return (
    <Modal title={student ? 'Edit Student' : 'Add Student'} onClose={onClose}>
      <form className="form-grid two-column" onSubmit={save}>
        <Field label="Student ID" required><input value={form.student_code} onChange={(e) => setForm({ ...form, student_code: e.target.value })} required /></Field>
        <Field label="Student Name" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Grade" required><select value={form.grade_id} onChange={(e) => setForm({ ...form, grade_id: e.target.value, section_id: '' })} required><option value="">Select grade</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <Field label="Section" required><select value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })} required><option value="">Select section</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Student GQ" required><input type="number" step="0.01" value={form.gq} onChange={(e) => setForm({ ...form, gq: e.target.value })} required /></Field>
        <Field label="Email"><input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Phone"><input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <div className="form-footer span-2"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary">Save Student</button></div>
      </form>
    </Modal>
  );
}

function FilterBar({ grades, value, setValue, showSearch = false, searchPlaceholder = 'Search' }) {
  const sections = grades.find((g) => String(g.id) === String(value.grade_id))?.sections || [];
  return (
    <section className="panel filter-panel">
      {showSearch && <div className="search-box">⌕<input value={value.q || ''} onChange={(e) => setValue({ ...value, q: e.target.value })} placeholder={searchPlaceholder} /></div>}
      <select value={value.grade_id} onChange={(e) => setValue({ ...value, grade_id: e.target.value, section_id: '' })}><option value="">All Grades</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <select value={value.section_id} onChange={(e) => setValue({ ...value, section_id: e.target.value })} disabled={!value.grade_id}><option value="">All Sections</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      {(value.grade_id || value.section_id || value.q) && <button className="btn secondary" onClick={() => setValue({ grade_id: '', section_id: '', q: '' })}>Clear Filters</button>}
    </section>
  );
}

function IssueBooks() {
  const [mode, setMode] = useState('single');
  const [grades] = useGrades();
  const [students, setStudents] = useState([]);
  const [filters, setFilters] = useState({ grade_id: '', section_id: '', q: '' });
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [eligibleBooks, setEligibleBooks] = useState([]);
  const [eligibility, setEligibility] = useState({ tolerance: 20, minimum_gq: '', maximum_gq: '' });
  const [copyId, setCopyId] = useState('');
  const [dates, setDates] = useState({ issue_date: today(), due_date: plusDays(14) });

  const loadStudents = () => api(`/students?${new URLSearchParams(filters)}`).then(setStudents);
  useEffect(() => { loadStudents(); }, [filters.grade_id, filters.section_id, filters.q]);

  async function chooseStudent(student) {
    setSelectedStudent(student);
    setCopyId('');
    try {
      const response = await api(`/eligible-books/${student.id}`);
      setEligibleBooks(response.books || []);
      setEligibility({ tolerance: response.tolerance, minimum_gq: response.minimum_gq, maximum_gq: response.maximum_gq });
    } catch (e) { alert(e.message); }
  }

  async function issue() {
    try {
      await api('/issue', { method: 'POST', body: JSON.stringify({ student_id: selectedStudent.id, copy_id: copyId, ...dates }) });
      alert('Book issued successfully.');
      setSelectedStudent(null); setEligibleBooks([]); setEligibility({ tolerance: 20, minimum_gq: '', maximum_gq: '' }); setCopyId(''); loadStudents();
    } catch (e) { alert(e.message); }
  }

  return (
    <>
      <PageHeader title="Issue Books" subtitle="Issue one book at a time or upload a verified CSV for bulk issue." />
      <div className="tabs compact-tabs"><button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>Single Issue</button><button className={mode === 'bulk' ? 'active' : ''} onClick={() => setMode('bulk')}>Bulk Issue / Upload</button></div>
      {mode === 'bulk' ? <BulkIssue onDone={loadStudents} /> : <>
        <FilterBar grades={grades} value={filters} setValue={setFilters} showSearch searchPlaceholder="Search student name or ID" />
        <div className="split-layout">
          <section className="panel student-picker">
            <div className="panel-heading"><div><h2>Select Student</h2><p>A student can hold only one active book.</p></div><span className="record-count">{students.length}</span></div>
            <div className="picker-list">
              {students.map((student) => (
                <button key={student.id} className={`picker-row ${selectedStudent?.id === student.id ? 'selected' : ''}`} disabled={Boolean(student.active_issue)} onClick={() => chooseStudent(student)}>
                  <div className="avatar">{student.name.slice(0, 1).toUpperCase()}</div>
                  <div className="picker-main"><b>{student.name}</b><span>{student.grade} · Section {student.section} · GQ {student.gq}</span></div>
                  <Status value={student.active_issue ? 'already issued' : 'eligible'} />
                </button>
              ))}
              {!students.length && <EmptyState title="No students found" text="Add students or change the selected filters." />}
            </div>
          </section>
          <section className="panel issue-panel">
            <div className="panel-heading"><div><h2>Issue Details</h2><p>Select the exact physical copy to issue.</p></div></div>
            {!selectedStudent ? <EmptyState title="Select a student" text="Choose an eligible student from the list to view matching books." /> : (
              <div className="issue-form">
                <div className="selected-summary"><div className="avatar large-avatar">{selectedStudent.name.slice(0, 1)}</div><div><b>{selectedStudent.name}</b><span>{selectedStudent.grade} · {selectedStudent.section} · GQ {selectedStudent.gq}</span></div></div>
                <div className="alert info-alert">Eligible book GQ range: <b>{eligibility.minimum_gq} to {eligibility.maximum_gq}</b> (±{eligibility.tolerance}). Books are sorted by nearest GQ first.</div>
                <Field label="Matching Book Copy"><select value={copyId} onChange={(e) => setCopyId(e.target.value)}><option value="">Select available book</option>{eligibleBooks.map((book) => <option key={book.copy_id} value={book.copy_id}>{book.title} — GQ {book.gq} — {book.copy_code}</option>)}</select></Field>
                {!eligibleBooks.length && <div className="alert warning-alert">No available book currently matches this student’s GQ.</div>}
                <div className="date-grid"><Field label="Issue Date"><input type="date" value={dates.issue_date} onChange={(e) => setDates({ ...dates, issue_date: e.target.value })} /></Field><Field label="Due Date"><input type="date" min={dates.issue_date} value={dates.due_date} onChange={(e) => setDates({ ...dates, due_date: e.target.value })} /></Field></div>
                <button className="btn primary wide-button" disabled={!copyId || !dates.issue_date || !dates.due_date} onClick={issue}>Confirm Book Issue</button>
              </div>
            )}
          </section>
        </div>
      </>}
    </>
  );
}

function BulkIssue({ onDone }) {
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  function downloadTemplate() {
    const template = 'student_code,copy_code,issue_date,due_date\nSTUDENT-001,BOOK-001-001,2026-07-15,2026-07-29';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
    link.download = 'grobro-bulk-issue-template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCSV(await file.text());
      const required = ['student_code', 'copy_code', 'issue_date', 'due_date'];
      if (!parsed.length || required.some((key) => !(key in parsed[0]))) throw new Error(`CSV must contain: ${required.join(', ')}`);
      setRows(parsed);
      setResults([]);
    } catch (e) { alert(e.message); event.target.value = ''; }
  }

  async function submit() {
    setBusy(true);
    try {
      const response = await api('/bulk-issue', { method: 'POST', body: JSON.stringify({ rows }) });
      setResults(response.results);
      onDone();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  return <section className="panel">
    <div className="panel-heading"><div><h2>Bulk Issue by CSV</h2><p>Each row is validated against student status, copy availability and the GQ tolerance saved in Settings.</p></div><button className="btn secondary" onClick={downloadTemplate}>↓ Download Template</button></div>
    <div className="upload-zone"><input id="bulk-file" type="file" accept=".csv,text/csv" onChange={readFile} /><label htmlFor="bulk-file"><span>↑</span><b>Select CSV File</b><small>Required columns: student_code, copy_code, issue_date, due_date</small></label></div>
    {rows.length > 0 && <><div className="panel-heading preview-heading"><div><h2>Upload Preview</h2><p>{rows.length} row{rows.length === 1 ? '' : 's'} ready for validation.</p></div><button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Processing…' : 'Validate & Issue'}</button></div>
      <Table columns={['Student ID', 'Copy ID', 'Issue Date', 'Due Date', 'Result']}>
        {rows.map((row, index) => <tr key={`${row.student_code}-${index}`}><td>{row.student_code}</td><td>{row.copy_code}</td><td>{row.issue_date}</td><td>{row.due_date}</td><td>{results[index] ? <Status value={results[index].success ? 'issued' : 'failed'} /> : 'Pending'}{results[index]?.error && <div className="cell-error">{results[index].error}</div>}</td></tr>)}
      </Table></>}
  </section>;
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const split = (line) => {
    const values = []; let current = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quoted) { current += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { values.push(current.trim()); current = ''; }
      else current += char;
    }
    values.push(current.trim()); return values;
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, split(line)[index] || ''])));
}

function Circulation({ initialTab }) {
  const [grades] = useGrades();
  const [tab, setTab] = useState(initialTab || 'active');
  const [filters, setFilters] = useState({ grade_id: '', section_id: '', q: '' });
  const [rows, setRows] = useState([]);
  const [actionModal, setActionModal] = useState(null);
  const tabs = [['active', 'Active Issues'], ['overdue', 'Overdue'], ['returns', 'Returns'], ['history', 'Complete History']];

  const load = () => api(`/circulation?${new URLSearchParams({ tab, ...filters })}`).then(setRows).catch((e) => alert(e.message));
  useEffect(() => { load(); }, [tab, filters.grade_id, filters.section_id, filters.q]);
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  return (
    <>
      <PageHeader title="Circulation" subtitle="Issue history, active loans, returns, renewals and book conditions." />
      <div className="tabs">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}<span>{tab === id ? rows.length : ''}</span></button>)}</div>
      <FilterBar grades={grades} value={filters} setValue={setFilters} showSearch searchPlaceholder="Search student, book or copy ID" />
      <section className="panel">
        <Table
          columns={tab === 'returns'
            ? ['Student', 'Grade / Section', 'Book', 'Copy ID', 'Issue Date', 'Return Date', 'Condition', 'Status']
            : tab === 'history'
              ? ['Student', 'Book', 'Copy ID', 'Issue Date', 'Due Date', 'Return Date', 'Status', 'Condition']
              : ['Student', 'Grade / Section', 'Book', 'Copy ID', 'Issue Date', 'Due Date', 'Status', 'Actions']}
          empty={<EmptyState title={`No ${tabs.find((x) => x[0] === tab)?.[1].toLowerCase()} found`} text="Records will appear here as circulation activity is saved." />}
        >
          {rows.map((row) => tab === 'returns' ? (
            <tr key={row.id}><td>{row.student}</td><td>{row.grade} · {row.section}</td><td>{row.title}</td><td><span className="code">{row.copy_code}</span></td><td>{row.issue_date}</td><td>{row.return_date || '—'}</td><td>{row.return_condition || '—'}</td><td><Status value={row.status} /></td></tr>
          ) : tab === 'history' ? (
            <tr key={row.id}><td>{row.student}</td><td>{row.title}</td><td><span className="code">{row.copy_code}</span></td><td>{row.issue_date}</td><td>{row.due_date}</td><td>{row.return_date || '—'}</td><td><Status value={row.status} /></td><td>{row.return_condition || '—'}</td></tr>
          ) : (
            <tr key={row.id}><td>{row.student}</td><td>{row.grade} · {row.section}</td><td>{row.title}</td><td><span className="code">{row.copy_code}</span></td><td>{row.issue_date}</td><td>{row.due_date}</td><td><Status value={tab === 'overdue' ? 'overdue' : row.status} /></td><td><select className="action-select" value="" onChange={(e) => { if (e.target.value) setActionModal({ row, action: e.target.value }); }}><option value="">Choose Action</option><option value="return">Register Return</option><option value="renew">Renew Book</option><option value="lost">Mark as Lost</option></select></td></tr>
          ))}
        </Table>
      </section>
      {actionModal && <CirculationAction modal={actionModal} onClose={() => setActionModal(null)} onDone={() => { setActionModal(null); load(); }} />}
    </>
  );
}

function CirculationAction({ modal, onClose, onDone }) {
  const { row, action } = modal;
  const [form, setForm] = useState({ due_date: row.due_date, return_date: today(), condition: 'good', notes: '' });
  const titles = { renew: 'Renew Book', return: 'Register Book Return', lost: 'Mark Book as Lost' };

  async function submit(event) {
    event.preventDefault();
    if (action === 'lost' && !window.confirm('This will remove the copy from available inventory until it is recovered. Continue?')) return;
    try { await api(`/circulation/${row.id}/action`, { method: 'POST', body: JSON.stringify({ action, ...form }) }); onDone(); } catch (e) { alert(e.message); }
  }

  return (
    <Modal title={titles[action]} onClose={onClose}>
      <div className="selected-summary"><div className="avatar">{row.student.slice(0, 1)}</div><div><b>{row.student}</b><span>{row.title} · {row.copy_code}</span></div></div>
      <form className="stack-form" onSubmit={submit}>
        {action === 'renew' && <Field label="New Due Date" required><input type="date" min={today()} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required /></Field>}
        {action === 'return' && <><Field label="Return Date" required><input type="date" value={form.return_date} onChange={(e) => setForm({ ...form, return_date: e.target.value })} required /></Field><Field label="Book Condition" required><select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}><option value="good">Good — return to available inventory</option><option value="damaged">Damaged — move to damaged inventory</option></select></Field></>}
        <Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={action === 'lost' ? 'Record details about the lost copy' : 'Optional notes'} /></Field>
        <div className="form-footer"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className={`btn ${action === 'lost' ? 'danger' : 'primary'}`}>Confirm</button></div>
      </form>
    </Modal>
  );
}

function ProblemBooks() {
  const [rows, setRows] = useState([]);
  const load = () => api('/problem-books').then(setRows).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);

  async function recover(row) {
    if (!window.confirm(`Mark copy ${row.copy_code} as recovered/repaired and available?`)) return;
    try { await api(`/copies/${row.id}/recover`, { method: 'POST' }); load(); } catch (e) { alert(e.message); }
  }

  return (
    <>
      <PageHeader title="Lost & Damaged Books" subtitle="Trace every unavailable copy and restore it after recovery or repair." />
      <section className="panel">
        <Table columns={['Book ID', 'Title', 'Copy ID', 'Status', 'Condition', 'Student', 'Date Reported', 'Notes', 'Action']} empty={<EmptyState title="No lost or damaged books" text="Copies marked during circulation will appear here." />}>
          {rows.map((row) => <tr key={row.id}><td><span className="code">{row.book_id}</span></td><td>{row.title}</td><td><span className="code">{row.copy_code}</span></td><td><Status value={row.status} /></td><td>{row.condition}</td><td>{row.student || '—'}</td><td>{row.reported_date || '—'}</td><td>{row.notes || '—'}</td><td><button className="btn small secondary" onClick={() => recover(row)}>Recover / Repair</button></td></tr>)}
        </Table>
      </section>
    </>
  );
}

function Reports() {
  const [grades] = useGrades();
  const [filters, setFilters] = useState({ grade_id: '', section_id: '', q: '' });
  const [issuedRows, setIssuedRows] = useState([]);
  const [reports, setReports] = useState({});
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    Promise.all([
      api('/report-view/student-participation'),
      api('/report-view/inventory'),
      api('/report-view/circulation'),
      api('/report-view/book-usage'),
      api('/report-view/gq-coverage'),
      api('/report-view/overdue'),
      api('/report-view/problem-books'),
    ]).then(([participation, inventory, circulation, usage, coverage, overdue, problems]) => {
      setReports({ participation, inventory, circulation, usage, coverage, overdue, problems });
    }).catch((e) => alert(e.message)).finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    api(`/circulation?${new URLSearchParams({ tab: 'active', ...filters })}`).then(setIssuedRows).catch((e) => alert(e.message));
  }, [filters.grade_id, filters.section_id, filters.q]);

  if (busy) return <Loading />;

  const openCirculation = (row) => {
    const next = { ...filters };
    if (row?.grade_id) next.grade_id = String(row.grade_id);
    setFilters(next);
    document.getElementById('issued-books-report')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="All graphs and issued-book records are generated from saved library data.">
        <button className="btn secondary" disabled={!issuedRows.length} onClick={() => downloadCSV(issuedRows, 'issued-books-report.csv')}>↓ Download Issued Books</button>
      </PageHeader>

      <div className="report-dashboard-grid">
        <ChartPanel title="Student participation" subtitle="Share of students currently holding a book.">
          <PieChart rows={[
            { status: 'With Book', count: (reports.participation?.rows || []).filter((r) => r.status === 'With Book').length },
            { status: 'Without Book', count: (reports.participation?.rows || []).filter((r) => r.status === 'Without Book').length },
          ]} labelKey="status" valueKey="count" onSelect={(row) => setFilters({ ...filters, q: '' })} />
        </ChartPanel>

        <ChartPanel title="Inventory status" subtitle="Current distribution of all physical book copies.">
          <PieChart rows={reports.inventory?.chart || []} labelKey="status" valueKey="count" onSelect={() => {}} donut={false} />
        </ChartPanel>

        <ChartPanel title="Monthly circulation" subtitle="Issues, returns and renewals over time.">
          <LineChart rows={reports.circulation?.chart || []} categoryKey="month" series={reports.circulation?.series || []} />
        </ChartPanel>

        <ChartPanel title="Most-issued books" subtitle="Top titles ranked by total issue count.">
          <SimpleBarChart rows={(reports.usage?.chart || []).slice(0, 10)} labelKey="title" valueKey="total_issues" compact />
        </ChartPanel>

        <ChartPanel title="GQ coverage" subtitle="Student demand compared with available book copies.">
          <GroupedBarChart rows={reports.coverage?.chart || []} categoryKey="gq_label" series={reports.coverage?.series || []} />
        </ChartPanel>

        <ChartPanel title="Overdue books by grade" subtitle="Active issues currently past their due date.">
          <SimpleBarChart rows={reports.overdue?.chart || []} labelKey="grade" valueKey="overdue" onSelect={openCirculation} />
        </ChartPanel>

        <ChartPanel title="Lost and damaged copies" subtitle="Current unavailable copies by condition status.">
          <PieChart rows={reports.problems?.chart || []} labelKey="status" valueKey="count" onSelect={() => {}} />
        </ChartPanel>
      </div>

      <section className="panel" id="issued-books-report">
        <div className="panel-heading"><div><h2>Issued Books</h2><p>Filter the complete list by grade, section or student/book details.</p></div><div className="report-count"><strong>{issuedRows.length}</strong><span>Active issue{issuedRows.length === 1 ? '' : 's'}</span></div></div>
        <FilterBar grades={grades} value={filters} setValue={setFilters} showSearch searchPlaceholder="Search student, book or copy ID" />
        <Table columns={['Student ID','Student','Grade','Section','Book','Copy ID','Issue Date','Due Date','Status']} empty={<EmptyState title="No issued books found" text="Adjust the filters or issue a book to a student." />}>
          {issuedRows.map((row) => <tr key={row.id}><td><span className="code">{row.student_code || '—'}</span></td><td>{row.student}</td><td>{row.grade}</td><td>{row.section}</td><td>{row.title}</td><td><span className="code">{row.copy_code}</span></td><td>{row.issue_date}</td><td>{row.due_date}</td><td><Status value={new Date(row.due_date) < new Date(today()) ? 'overdue' : row.status} /></td></tr>)}
        </Table>
      </section>
    </>
  );
}

function Settings() {
  const [grades, load] = useGrades();
  const [gradeName, setGradeName] = useState('');
  const [sectionModal, setSectionModal] = useState(null);
  const [gqTolerance, setGqTolerance] = useState(20);
  const [savedTolerance, setSavedTolerance] = useState(20);

  useEffect(() => {
    api('/settings').then((data) => { setGqTolerance(data.gq_tolerance); setSavedTolerance(data.gq_tolerance); }).catch((e) => alert(e.message));
  }, []);

  async function saveTolerance() {
    try {
      const value = Number(gqTolerance);
      const result = await api('/settings/gq-tolerance', { method: 'PUT', body: JSON.stringify({ gq_tolerance: value }) });
      setGqTolerance(result.gq_tolerance); setSavedTolerance(result.gq_tolerance);
      alert('GQ tolerance saved successfully.');
    } catch (e) { alert(e.message); }
  }

  async function addGrade() {
    if (!gradeName.trim()) return;
    try { await api('/grades', { method: 'POST', body: JSON.stringify({ name: gradeName.trim() }) }); setGradeName(''); load(); } catch (e) { alert(e.message); }
  }

  async function removeGrade(grade) {
    if (!window.confirm(`Remove ${grade.name}? It cannot be removed while active students are assigned to it.`)) return;
    try { await api(`/grades/${grade.id}`, { method: 'DELETE' }); load(); } catch (e) { alert(e.message); }
  }

  async function removeSection(section) {
    if (!window.confirm(`Remove section ${section.name}? It cannot be removed while active students are assigned to it.`)) return;
    try { await api(`/sections/${section.id}`, { method: 'DELETE' }); load(); } catch (e) { alert(e.message); }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage issue rules, grades and grade-specific sections." />
      <section className="panel">
        <div className="panel-heading"><div><h2>Issue Rules</h2><p>Set the permitted GQ difference between a student and a book.</p></div></div>
        <div className="tolerance-setting">
          <Field label="GQ Tolerance"><input type="number" min="0" max="500" step="1" value={gqTolerance} onChange={(e) => setGqTolerance(e.target.value)} /></Field>
          <div className="tolerance-example"><b>Current rule: ±{savedTolerance}</b><span>A student with GQ 250 can receive books from GQ {250 - Number(savedTolerance)} to {250 + Number(savedTolerance)}.</span></div>
          <button className="btn primary" disabled={Number(gqTolerance) === Number(savedTolerance)} onClick={saveTolerance}>Save Tolerance</button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Grades and Sections</h2><p>Add sections separately under each grade.</p></div></div>
        <div className="inline-create"><input value={gradeName} onChange={(e) => setGradeName(e.target.value)} placeholder="Enter new grade name" onKeyDown={(e) => { if (e.key === 'Enter') addGrade(); }} /><button className="btn primary" onClick={addGrade}>＋ Add Grade</button></div>
        <div className="grade-list">
          {grades.map((grade) => (
            <div className="grade-card" key={grade.id}>
              <div className="grade-card-head"><div><h3>{grade.name}</h3><span>{grade.sections.length} section{grade.sections.length === 1 ? '' : 's'}</span></div><div className="row-actions"><button className="btn small secondary" onClick={() => setSectionModal(grade)}>＋ Add Section</button><button className="icon-btn danger-icon" onClick={() => removeGrade(grade)}>×</button></div></div>
              <div className="section-tags">{grade.sections.map((section) => <span className="section-tag" key={section.id}>{section.name}<button title="Remove section" onClick={() => removeSection(section)}>×</button></span>)}{!grade.sections.length && <span className="muted">No sections added.</span>}</div>
            </div>
          ))}
          {!grades.length && <EmptyState title="No grades configured" text="Add the first grade, then create the sections that belong to it." />}
        </div>
      </section>
      {sectionModal && <AddSectionModal grade={sectionModal} onClose={() => setSectionModal(null)} onSaved={() => { setSectionModal(null); load(); }} />}
    </>
  );
}

function AddSectionModal({ grade, onClose, onSaved }) {
  const [name, setName] = useState('');
  async function save(event) {
    event.preventDefault();
    try { await api(`/grades/${grade.id}/sections`, { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); onSaved(); } catch (e) { alert(e.message); }
  }
  return <Modal title={`Add Section to ${grade.name}`} onClose={onClose}><form className="stack-form" onSubmit={save}><Field label="Section Name" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: A" required /></Field><div className="form-footer"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary">Add Section</button></div></form></Modal>;
}

function Field({ label, required, className = '', children }) {
  return <label className={`field ${className}`}><span>{label}{required && <em>*</em>}</span>{children}</label>;
}

function Modal({ title, onClose, children, large = false }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${large ? 'large' : ''}`}><div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div><div className="modal-body">{children}</div></div></div>;
}

function Table({ columns, children, empty }) {
  const hasChildren = React.Children.count(children) > 0;
  return <div className="table-scroll">{hasChildren ? <table><thead><tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr></thead><tbody>{children}</tbody></table> : empty}</div>;
}

function Status({ value }) {
  const normalized = String(value || '').toLowerCase();
  return <span className={`status status-${normalized.replaceAll(' ', '-')}`}>{value}</span>;
}
function GQ({ value }) { return <span className="gq-badge">GQ {value}</span>; }
function Loading() { return <div className="loading"><div className="spinner" /> Loading…</div>; }
function ErrorState({ message }) { return <div className="alert error-alert">{message}</div>; }
function EmptyState({ title, text, action }) { return <div className="empty-state"><div className="empty-icon">□</div><h3>{title}</h3><p>{text}</p>{action}</div>; }
function humanize(text) { return text.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }

function downloadCSV(rows, name) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map((row) => keys.map((key) => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}


const IMPORT_CONFIG = {
  books: {
    title: 'Bulk Upload Books',
    endpoint: '/books/bulk-import',
    required: ['book_id', 'title', 'gq', 'total_copies'],
    headers: ['book_id','isbn','title','subtitle','author','publisher','publication_year','edition','language','category','gq','registration_date','shelf_location','price','supplier','description','total_copies'],
    sample: ['GB-0001','','The Very Hungry Caterpillar','','Eric Carle','','1969','','English','Picture Book','25',today(),'GQ-0-50','','','Example import record','20'],
  },
  students: {
    title: 'Bulk Upload Students',
    endpoint: '/students/bulk-import',
    required: ['student_code', 'name', 'grade', 'section', 'gq'],
    headers: ['student_code','name','grade','section','gq','email','phone'],
    sample: ['STU-01A-001','Aarav Shah','Grade 1','A','25','',''],
  },
};

function parseImportCSV(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(value.trim()); value = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value.trim()); if (row.some((cell) => cell !== '')) rows.push(row); }
  if (rows.length < 2) return { headers: rows[0] || [], records: [] };
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const records = rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  return { headers, records };
}

function escapeCSV(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadTemplate(type) {
  const config = IMPORT_CONFIG[type];
  const csv = `${config.headers.join(',')}\n${config.sample.map(escapeCSV).join(',')}\n`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `${type}-import-template.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function BulkImportModal({ type, onClose, onImported }) {
  const config = IMPORT_CONFIG[type];
  const [fileName, setFileName] = useState('');
  const [records, setRecords] = useState([]);
  const [errors, setErrors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSummary(null);
    try {
      const parsed = parseImportCSV(await file.text());
      const missingHeaders = config.required.filter((header) => !parsed.headers.includes(header));
      if (missingHeaders.length) {
        setRecords([]);
        setErrors([`Missing required columns: ${missingHeaders.join(', ')}`]);
        return;
      }
      const rowErrors = [];
      parsed.records.forEach((record, index) => {
        const missing = config.required.filter((key) => String(record[key] ?? '').trim() === '');
        if (missing.length) rowErrors.push(`Row ${index + 2}: missing ${missing.join(', ')}`);
      });
      setRecords(parsed.records);
      setErrors(rowErrors);
    } catch (error) {
      setRecords([]);
      setErrors([error.message]);
    }
  }

  async function importRows() {
    if (!records.length || errors.length) return;
    setBusy(true);
    try {
      const result = await api(config.endpoint, { method: 'POST', body: JSON.stringify({ rows: records }) });
      setSummary(result);
      if (!result.failed) setTimeout(onImported, 700);
    } catch (error) {
      setErrors([error.message]);
    } finally { setBusy(false); }
  }

  return (
    <Modal title={config.title} onClose={onClose} large>
      <div className="bulk-import-box">
        <div className="import-instructions">
          <h3>1. Download the CSV template</h3>
          <p>Keep the column names unchanged. You may add as many rows as required.</p>
          <button className="btn secondary" onClick={() => downloadTemplate(type)}>↓ Download Template</button>
        </div>
        <div className="import-instructions">
          <h3>2. Select the completed CSV</h3>
          <label className="file-picker"><input type="file" accept=".csv,text/csv" onChange={chooseFile} /><span>{fileName || 'Choose CSV file'}</span></label>
        </div>
        {records.length > 0 && <div className="alert success-alert">{records.length} row{records.length === 1 ? '' : 's'} ready to import.</div>}
        {errors.length > 0 && <div className="alert error-alert"><b>Fix these issues before importing:</b><ul>{errors.slice(0, 12).map((error) => <li key={error}>{error}</li>)}</ul>{errors.length > 12 && <p>And {errors.length - 12} more.</p>}</div>}
        {summary && <div className={`alert ${summary.failed ? 'warning-alert' : 'success-alert'}`}><b>Import complete:</b> {summary.imported} imported, {summary.failed} failed out of {summary.total}.{summary.errors?.length > 0 && <ul>{summary.errors.slice(0, 12).map((item) => <li key={`${item.row}-${item.identifier}`}>Row {item.row} ({item.identifier || 'unnamed'}): {item.error}</li>)}</ul>}</div>}
        <div className="form-footer"><button className="btn secondary" onClick={onClose}>Close</button><button className="btn primary" disabled={!records.length || errors.length > 0 || busy} onClick={importRows}>{busy ? 'Importing…' : `Import ${records.length || ''} ${type === 'books' ? 'Books' : 'Students'}`}</button></div>
      </div>
    </Modal>
  );
}

createRoot(document.getElementById('root')).render(<App />);
