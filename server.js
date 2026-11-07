const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 3000;
const U = process.env.BASIC_USER, P = process.env.BASIC_PASS;

const db = new Database(process.env.DB_FILE || path.join(__dirname, 'faces.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT DEFAULT '',
    descriptor TEXT NOT NULL, photo TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT, name TEXT NOT NULL,
    role TEXT DEFAULT '', conf INTEGER, ts INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
`);

const app = express();
app.use(express.json({ limit: '2mb' }));

// حماية اختيارية بكلمة مرور (مهمة جدًا عند النشر على الإنترنت)
if (U && P) app.use((req, res, next) => {
  const s = Buffer.from((req.headers.authorization || '').slice(6), 'base64').toString();
  const i = s.indexOf(':');
  if (s.slice(0, i) === U && s.slice(i + 1) === P) return next();
  res.set('WWW-Authenticate', 'Basic realm="face-system"').status(401).send('Authentication required');
});

const toPerson = r => ({ id: r.id, name: r.name, role: r.role, desc: JSON.parse(r.descriptor), photo: r.photo, created_at: r.created_at });

app.get('/api/people', (req, res) => {
  res.json(db.prepare('SELECT * FROM people ORDER BY created_at').all().map(toPerson));
});
app.post('/api/people', (req, res) => {
  const p = req.body || {};
  if (!p.id || !p.name || !Array.isArray(p.desc) || p.desc.length !== 128) return res.status(400).json({ error: 'bad data' });
  db.prepare('INSERT OR REPLACE INTO people VALUES (?,?,?,?,?,?)')
    .run(String(p.id), String(p.name).slice(0, 100), String(p.role || '').slice(0, 100), JSON.stringify(p.desc), p.photo || null, p.created_at || Date.now());
  res.json({ ok: true });
});
app.delete('/api/people/:id', (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
app.delete('/api/people', (req, res) => {
  db.prepare('DELETE FROM people').run();
  res.json({ ok: true });
});

app.get('/api/logs', (req, res) => {
  res.json(db.prepare('SELECT person_id, name, role, conf, ts FROM logs ORDER BY ts DESC LIMIT 1000').all());
});
app.post('/api/logs', (req, res) => {
  const l = req.body || {};
  if (!l.name || typeof l.ts !== 'number') return res.status(400).json({ error: 'bad data' });
  db.prepare('INSERT INTO logs (person_id, name, role, conf, ts) VALUES (?,?,?,?,?)')
    .run(l.person_id || null, String(l.name).slice(0, 100), String(l.role || '').slice(0, 100), Math.round(l.conf) || 0, l.ts);
  res.json({ ok: true });
});
app.delete('/api/logs', (req, res) => {
  db.prepare('DELETE FROM logs').run();
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`النظام يعمل على http://localhost:${PORT}`));
