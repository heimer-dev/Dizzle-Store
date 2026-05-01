/* ─── State ──────────────────────────────────────────────────────────────── */
let currentView = 'store';
let allApps = [];
let currentAppId = null;

/* ─── Init ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const loggedIn = await checkAuth();
  if (loggedIn) {
    showApp();
  } else {
    showLogin();
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      showView(item.dataset.view);
    });
  });

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    filterApps(e.target.value);
  });

  // Create app form
  document.getElementById('create-app-form').addEventListener('submit', handleCreateApp);

  // Icon file input label
  document.getElementById('icon-input').addEventListener('change', e => {
    const name = e.target.files[0]?.name || 'Kein Bild gewählt';
    document.getElementById('icon-filename').textContent = name;
  });
});

/* ─── Auth ───────────────────────────────────────────────────────────────── */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    return res.ok;
  } catch {
    return false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById('login-error');
  const btn = form.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Anmelden...';
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value
      })
    });

    const data = await res.json();
    if (res.ok) {
      showApp();
    } else {
      errorEl.textContent = data.error || 'Anmeldung fehlgeschlagen';
      errorEl.classList.remove('hidden');
    }
  } catch {
    errorEl.textContent = 'Verbindungsfehler';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Anmelden';
  }
}

async function handleLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  showLogin();
}

/* ─── Page Switching ─────────────────────────────────────────────────────── */
function showLogin() {
  document.getElementById('page-app').classList.add('hidden');
  document.getElementById('page-login').classList.remove('hidden');
}

function showApp() {
  document.getElementById('page-login').classList.add('hidden');
  document.getElementById('page-app').classList.remove('hidden');
  showView('store');
}

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) viewEl.classList.remove('hidden');

  const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navEl) navEl.classList.add('active');

  currentView = view;

  if (view === 'store') loadStoreApps();
  if (view === 'admin') loadAdminView();
  if (view === 'upload') resetCreateForm();
}

/* ─── Store ──────────────────────────────────────────────────────────────── */
async function loadStoreApps() {
  const grid = document.getElementById('apps-grid');
  grid.innerHTML = '<div class="loading">Apps werden geladen...</div>';

  try {
    const res = await fetch('/api/apps');
    allApps = await res.json();
    renderAppsGrid(allApps);
  } catch {
    grid.innerHTML = '<div class="loading">Fehler beim Laden der Apps</div>';
  }
}

function renderAppsGrid(apps) {
  const grid = document.getElementById('apps-grid');
  if (!apps.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📱</div>
        <p>Noch keine Apps vorhanden</p>
        <button class="btn btn-primary" onclick="showView('upload')">Erste App anlegen</button>
      </div>`;
    return;
  }

  grid.innerHTML = apps.map(app => `
    <div class="app-card" onclick="showAppDetail('${app.id}')">
      <div class="app-card-icon">
        ${app.icon_path
          ? `<img src="${app.icon_path}" alt="${escHtml(app.name)}" />`
          : '📱'}
      </div>
      <div class="app-card-name">${escHtml(app.name)}</div>
      <div class="app-card-package">${escHtml(app.package_name)}</div>
      <div class="app-card-meta">
        <span class="badge badge-category">${escHtml(app.category)}</span>
        ${app.latest_version ? `<span class="badge badge-version">v${escHtml(app.latest_version)}</span>` : ''}
        ${app.total_downloads ? `<span class="badge badge-downloads">⬇ ${app.total_downloads}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function filterApps(query) {
  const q = query.toLowerCase();
  const filtered = allApps.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.package_name.toLowerCase().includes(q) ||
    (a.description || '').toLowerCase().includes(q)
  );
  renderAppsGrid(filtered);
}

/* ─── App Detail ─────────────────────────────────────────────────────────── */
async function showAppDetail(appId) {
  currentAppId = appId;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-app-detail').classList.remove('hidden');

  const content = document.getElementById('app-detail-content');
  content.innerHTML = '<div class="loading">Wird geladen...</div>';

  try {
    const res = await fetch(`/api/apps/${appId}`);
    const app = await res.json();
    document.getElementById('detail-app-name').textContent = app.name;
    renderAppDetail(app);
  } catch {
    content.innerHTML = '<div class="loading">Fehler beim Laden</div>';
  }
}

function renderAppDetail(app) {
  const content = document.getElementById('app-detail-content');
  content.innerHTML = `
    <div class="app-detail-header">
      <div class="app-detail-icon">
        ${app.icon_path ? `<img src="${app.icon_path}" alt="${escHtml(app.name)}" />` : '📱'}
      </div>
      <div class="app-detail-info">
        <h3>${escHtml(app.name)}</h3>
        <div class="package">${escHtml(app.package_name)}</div>
        ${app.description ? `<div class="desc">${escHtml(app.description)}</div>` : ''}
        <div class="app-detail-actions">
          <span class="badge badge-category">${escHtml(app.category)}</span>
          <span class="badge badge-downloads">⬇ ${app.total_downloads || 0} Downloads</span>
          <button class="btn btn-ghost btn-sm" onclick="showEditAppModal('${app.id}')">✏️ Bearbeiten</button>
          <button class="btn btn-danger btn-sm" onclick="deleteApp('${app.id}')">🗑 Löschen</button>
        </div>
      </div>
    </div>

    <div class="releases-section">
      <div class="section-header">
        <h3>Releases (${app.releases.length})</h3>
        <button class="btn btn-primary btn-sm" onclick="showUploadApkModal('${app.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          APK hochladen
        </button>
      </div>
      ${app.releases.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📦</div><p>Noch keine Releases</p></div>`
        : app.releases.map(r => `
          <div class="release-row" id="release-${r.id}">
            <div class="release-meta">
              <span class="release-version">v${escHtml(r.version_name)}</span>
              <small>Version Code: ${r.version_code} · ${formatSize(r.apk_size)} · ${formatDate(r.created_at)} · ⬇ ${r.download_count}</small>
              ${r.changelog ? `<div class="release-changelog">${escHtml(r.changelog)}</div>` : ''}
            </div>
            <div class="release-actions">
              <a href="/api/releases/${r.id}/download" class="btn btn-success btn-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
              <button class="btn btn-danger btn-sm" onclick="deleteRelease('${r.id}', '${app.id}')">🗑</button>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
}

/* ─── Admin View ─────────────────────────────────────────────────────────── */
async function loadAdminView() {
  // Load stats
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('stat-apps').textContent = stats.total_apps;
    document.getElementById('stat-releases').textContent = stats.total_releases;
    document.getElementById('stat-downloads').textContent = stats.total_downloads;
  } catch {}

  // Load apps list
  const list = document.getElementById('admin-apps-list');
  list.innerHTML = '<div class="loading">Wird geladen...</div>';

  try {
    const res = await fetch('/api/apps');
    const apps = await res.json();

    if (!apps.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📱</div>
          <p>Noch keine Apps angelegt</p>
          <button class="btn btn-primary" onclick="showView('upload')">Erste App anlegen</button>
        </div>`;
      return;
    }

    list.innerHTML = apps.map(app => `
      <div class="admin-app-row">
        <div class="admin-app-icon">
          ${app.icon_path ? `<img src="${app.icon_path}" alt="${escHtml(app.name)}" />` : '📱'}
        </div>
        <div class="admin-app-info">
          <strong>${escHtml(app.name)}</strong>
          <small>${escHtml(app.package_name)} · ${app.release_count} Release(s) · ⬇ ${app.total_downloads || 0}</small>
        </div>
        <div class="admin-app-actions">
          ${app.latest_release_id
            ? `<a href="/api/releases/${app.latest_release_id}/download" class="btn btn-success btn-sm">⬇ APK</a>`
            : ''}
          <button class="btn btn-ghost btn-sm" onclick="showAppDetail('${app.id}')">Details</button>
          <button class="btn btn-primary btn-sm" onclick="showUploadApkModal('${app.id}')">+ APK</button>
          <button class="btn btn-danger btn-sm" onclick="deleteApp('${app.id}')">🗑</button>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="loading">Fehler beim Laden</div>';
  }
}

/* ─── Create App ─────────────────────────────────────────────────────────── */
function resetCreateForm() {
  document.getElementById('create-app-form').reset();
  document.getElementById('icon-filename').textContent = 'Kein Bild gewählt';
  document.getElementById('create-app-error').classList.add('hidden');
}

async function handleCreateApp(e) {
  e.preventDefault();
  const form = e.target;
  const errorEl = document.getElementById('create-app-error');
  const btn = form.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.textContent = 'Wird angelegt...';
  errorEl.classList.add('hidden');

  try {
    const formData = new FormData(form);
    const res = await fetch('/api/apps', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (res.ok) {
      showView('admin');
    } else {
      errorEl.textContent = data.error || 'Fehler beim Anlegen';
      errorEl.classList.remove('hidden');
    }
  } catch {
    errorEl.textContent = 'Verbindungsfehler';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'App anlegen';
  }
}

/* ─── Upload APK Modal ───────────────────────────────────────────────────── */
function showUploadApkModal(appId) {
  document.getElementById('modal-title').textContent = 'APK hochladen';
  document.getElementById('modal-body').innerHTML = `
    <form id="upload-apk-form" class="upload-apk-form">
      <div class="form-row">
        <div class="form-group">
          <label>Version Name *</label>
          <input type="text" name="version_name" placeholder="z.B. 1.0.0" required />
        </div>
        <div class="form-group">
          <label>Version Code *</label>
          <input type="number" name="version_code" placeholder="z.B. 1" min="1" required />
        </div>
      </div>
      <div class="form-group">
        <label>APK Datei *</label>
        <div class="apk-drop-zone" id="apk-drop-zone" onclick="document.getElementById('apk-file-input').click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p><strong>APK auswählen</strong> oder hierher ziehen</p>
          <p id="apk-filename" style="margin-top:0.5rem;font-size:0.8rem;color:var(--accent)"></p>
        </div>
        <input type="file" id="apk-file-input" name="apk" accept=".apk,application/vnd.android.package-archive" required style="display:none" />
      </div>
      <div class="form-group">
        <label>Changelog</label>
        <textarea name="changelog" rows="3" placeholder="Was ist neu in dieser Version?"></textarea>
      </div>
      <div id="upload-progress" class="hidden">
        <div class="progress-bar-wrap"><div class="progress-bar" id="progress-bar"></div></div>
        <small id="progress-text" style="color:var(--text-muted);font-size:0.8rem;margin-top:0.4rem;display:block">Wird hochgeladen...</small>
      </div>
      <div id="upload-error" class="error-msg hidden"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary" id="upload-btn">Hochladen</button>
      </div>
    </form>
  `;

  // File input change
  document.getElementById('apk-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) document.getElementById('apk-filename').textContent = `${file.name} (${formatSize(file.size)})`;
  });

  // Drag & drop
  const dropZone = document.getElementById('apk-drop-zone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.apk') || file.type === 'application/vnd.android.package-archive')) {
      const input = document.getElementById('apk-file-input');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      document.getElementById('apk-filename').textContent = `${file.name} (${formatSize(file.size)})`;
    }
  });

  // Form submit with XHR for progress
  document.getElementById('upload-apk-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const errorEl = document.getElementById('upload-error');
    const btn = document.getElementById('upload-btn');
    const progressWrap = document.getElementById('upload-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    errorEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Wird hochgeladen...';
    progressWrap.classList.remove('hidden');

    const formData = new FormData(form);

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/apps/${appId}/releases`);

        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = pct + '%';
            progressText.textContent = `${pct}% hochgeladen (${formatSize(e.loaded)} / ${formatSize(e.total)})`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).error || 'Upload fehlgeschlagen'));
            } catch {
              reject(new Error('Upload fehlgeschlagen'));
            }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler')));
        xhr.send(formData);
      });

      closeModal();
      // Refresh current view
      if (currentAppId === appId) {
        showAppDetail(appId);
      } else {
        loadAdminView();
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      progressWrap.classList.add('hidden');
      btn.disabled = false;
      btn.textContent = 'Hochladen';
    }
  });

  openModal();
}

/* ─── Edit App Modal ─────────────────────────────────────────────────────── */
async function showEditAppModal(appId) {
  const res = await fetch(`/api/apps/${appId}`);
  const app = await res.json();

  document.getElementById('modal-title').textContent = 'App bearbeiten';
  document.getElementById('modal-body').innerHTML = `
    <form id="edit-app-form" enctype="multipart/form-data">
      <div class="form-group">
        <label>App Name</label>
        <input type="text" name="name" value="${escHtml(app.name)}" required />
      </div>
      <div class="form-group">
        <label>Kategorie</label>
        <select name="category">
          ${['Other','Tools','Games','Social','Productivity','Entertainment','Finance','Health']
            .map(c => `<option ${c === app.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Beschreibung</label>
        <textarea name="description" rows="3">${escHtml(app.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Neues Icon (optional)</label>
        <div class="file-input-wrapper">
          <input type="file" name="icon" id="edit-icon-input" accept="image/*" />
          <label for="edit-icon-input" class="file-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Bild auswählen
          </label>
          <span id="edit-icon-filename">Kein neues Bild</span>
        </div>
      </div>
      <div id="edit-app-error" class="error-msg hidden"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary">Speichern</button>
      </div>
    </form>
  `;

  document.getElementById('edit-icon-input').addEventListener('change', e => {
    document.getElementById('edit-icon-filename').textContent = e.target.files[0]?.name || 'Kein neues Bild';
  });

  document.getElementById('edit-app-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const errorEl = document.getElementById('edit-app-error');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Speichern...';

    try {
      const formData = new FormData(form);
      const res = await fetch(`/api/apps/${appId}`, { method: 'PUT', body: formData });
      const data = await res.json();
      if (res.ok) {
        closeModal();
        showAppDetail(appId);
      } else {
        errorEl.textContent = data.error || 'Fehler';
        errorEl.classList.remove('hidden');
      }
    } catch {
      errorEl.textContent = 'Verbindungsfehler';
      errorEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Speichern';
    }
  });

  openModal();
}

/* ─── Delete ─────────────────────────────────────────────────────────────── */
async function deleteApp(appId) {
  if (!confirm('App und alle Releases wirklich löschen?')) return;
  try {
    const res = await fetch(`/api/apps/${appId}`, { method: 'DELETE' });
    if (res.ok) {
      showView('admin');
    } else {
      alert('Fehler beim Löschen');
    }
  } catch {
    alert('Verbindungsfehler');
  }
}

async function deleteRelease(releaseId, appId) {
  if (!confirm('Dieses Release wirklich löschen?')) return;
  try {
    const res = await fetch(`/api/releases/${releaseId}`, { method: 'DELETE' });
    if (res.ok) {
      showAppDetail(appId);
    } else {
      alert('Fehler beim Löschen');
    }
  } catch {
    alert('Verbindungsfehler');
  }
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
