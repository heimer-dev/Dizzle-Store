const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dizzle-secret-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dizzle2024';

// Ensure directories exist
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Database setup
const db = new Database(path.join(DATA_DIR, 'dizzle.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    package_name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT DEFAULT 'Other',
    icon_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL,
    apk_path TEXT NOT NULL,
    apk_size INTEGER NOT NULL,
    changelog TEXT,
    download_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
  );
`);

// Multer storage for APKs
const apkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'apks');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const iconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'icons');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const uploadApk = multer({
  storage: apkStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.android.package-archive' ||
        file.originalname.endsWith('.apk')) {
      cb(null, true);
    } else {
      cb(new Error('Only APK files are allowed'));
    }
  }
});

const uploadIcon = multer({
  storage: iconStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, await bcrypt.hash(ADMIN_PASSWORD, 10))
    .then(() => password === ADMIN_PASSWORD);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
  res.json({ success: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// ─── APP ROUTES ─────────────────────────────────────────────────────────────

// Get all apps (public)
app.get('/api/apps', (req, res) => {
  const apps = db.prepare(`
    SELECT a.*, 
      (SELECT COUNT(*) FROM releases r WHERE r.app_id = a.id) as release_count,
      (SELECT r.version_name FROM releases r WHERE r.app_id = a.id ORDER BY r.created_at DESC LIMIT 1) as latest_version,
      (SELECT r.id FROM releases r WHERE r.app_id = a.id ORDER BY r.created_at DESC LIMIT 1) as latest_release_id,
      (SELECT SUM(r.download_count) FROM releases r WHERE r.app_id = a.id) as total_downloads
    FROM apps a
    ORDER BY a.updated_at DESC
  `).all();
  res.json(apps);
});

// Get single app (public)
app.get('/api/apps/:id', (req, res) => {
  const app = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM releases r WHERE r.app_id = a.id) as release_count,
      (SELECT SUM(r.download_count) FROM releases r WHERE r.app_id = a.id) as total_downloads
    FROM apps a WHERE a.id = ?
  `).get(req.params.id);
  if (!app) return res.status(404).json({ error: 'App not found' });

  const releases = db.prepare(
    'SELECT * FROM releases WHERE app_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  res.json({ ...app, releases });
});

// Create app (admin)
app.post('/api/apps', requireAuth, uploadIcon.single('icon'), (req, res) => {
  const { name, package_name, description, category } = req.body;
  if (!name || !package_name) {
    return res.status(400).json({ error: 'Name and package name are required' });
  }

  const id = uuidv4();
  const icon_path = req.file ? `/uploads/icons/${req.file.filename}` : null;

  try {
    db.prepare(`
      INSERT INTO apps (id, name, package_name, description, category, icon_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, package_name, description || '', category || 'Other', icon_path);

    const created = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Package name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update app (admin)
app.put('/api/apps/:id', requireAuth, uploadIcon.single('icon'), (req, res) => {
  const { name, description, category } = req.body;
  const existing = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'App not found' });

  const icon_path = req.file ? `/uploads/icons/${req.file.filename}` : existing.icon_path;

  db.prepare(`
    UPDATE apps SET name = ?, description = ?, category = ?, icon_path = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || existing.name, description ?? existing.description, category || existing.category, icon_path, req.params.id);

  res.json(db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id));
});

// Delete app (admin)
app.delete('/api/apps/:id', requireAuth, (req, res) => {
  const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'App not found' });

  // Delete associated files
  const releases = db.prepare('SELECT * FROM releases WHERE app_id = ?').all(req.params.id);
  releases.forEach(r => {
    const filePath = path.join(UPLOADS_DIR, 'apks', path.basename(r.apk_path));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  if (app.icon_path) {
    const iconPath = path.join(UPLOADS_DIR, 'icons', path.basename(app.icon_path));
    if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
  }

  db.prepare('DELETE FROM apps WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── RELEASE ROUTES ──────────────────────────────────────────────────────────

// Upload APK release (admin)
app.post('/api/apps/:id/releases', requireAuth, uploadApk.single('apk'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'APK file is required' });

  const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'App not found' });

  const { version_name, version_code, changelog } = req.body;
  if (!version_name || !version_code) {
    return res.status(400).json({ error: 'Version name and code are required' });
  }

  const id = uuidv4();
  const apk_path = `/uploads/apks/${req.file.filename}`;
  const apk_size = req.file.size;

  db.prepare(`
    INSERT INTO releases (id, app_id, version_name, version_code, apk_path, apk_size, changelog)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, version_name, parseInt(version_code), apk_path, apk_size, changelog || '');

  db.prepare('UPDATE apps SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

  res.status(201).json(db.prepare('SELECT * FROM releases WHERE id = ?').get(id));
});

// Delete release (admin)
app.delete('/api/releases/:id', requireAuth, (req, res) => {
  const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(req.params.id);
  if (!release) return res.status(404).json({ error: 'Release not found' });

  const filePath = path.join(UPLOADS_DIR, 'apks', path.basename(release.apk_path));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM releases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Download APK (public) - increments counter
app.get('/api/releases/:id/download', (req, res) => {
  const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(req.params.id);
  if (!release) return res.status(404).json({ error: 'Release not found' });

  const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(release.app_id);
  const filePath = path.join(UPLOADS_DIR, 'apks', path.basename(release.apk_path));

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  db.prepare('UPDATE releases SET download_count = download_count + 1 WHERE id = ?').run(req.params.id);

  const filename = `${app.name.replace(/\s+/g, '_')}_v${release.version_name}.apk`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.sendFile(filePath);
});

// Stats (admin)
app.get('/api/stats', requireAuth, (req, res) => {
  const stats = {
    total_apps: db.prepare('SELECT COUNT(*) as c FROM apps').get().c,
    total_releases: db.prepare('SELECT COUNT(*) as c FROM releases').get().c,
    total_downloads: db.prepare('SELECT SUM(download_count) as c FROM releases').get().c || 0,
    recent_apps: db.prepare('SELECT * FROM apps ORDER BY created_at DESC LIMIT 5').all()
  };
  res.json(stats);
});

// Catch-all: serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Dizzle Store running on http://localhost:${PORT}`);
  console.log(`   Admin: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});
