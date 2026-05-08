const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  settings: null,
  dirty: new Map(), // field -> value
};

const NUMERIC_FIELDS = new Set([
  'smtp_secure', 'smtp_port', 'recently_added_count',
  'include_movies', 'include_tv', 'include_music', 'show_summaries',
  'enable_top_watched', 'enable_top_users', 'enable_stats',
  'stats_window_days', 'schedule_enabled', 'cloudinary_enabled'
]);

const BOOL_FIELDS = new Set([
  'smtp_secure', 'include_movies', 'include_tv', 'include_music',
  'show_summaries', 'enable_top_watched', 'enable_top_users',
  'enable_stats', 'schedule_enabled', 'cloudinary_enabled'
]);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body && !opts.headers?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {},
    ...opts
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); msg = j.error || j.message || msg; } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('Content-Type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

function applySettings(s) {
  state.settings = s;
  state.dirty.clear();
  updateSaveBtn();

  for (const el of $$('[data-field]')) {
    const k = el.dataset.field;
    const v = s[k];
    if (el.type === 'checkbox') {
      el.checked = !!Number(v);
    } else if (el.type === 'color') {
      el.value = String(v || '#e5a00d');
    } else {
      el.value = v ?? '';
    }
  }
  for (const el of $$('[data-field-pair]')) {
    el.value = String(s[el.dataset.fieldPair] || '#e5a00d');
  }
  $('#tz-name').textContent = window.__TZ__ || 'TZ';

  // Logo preview
  const logoPreview = $('#logo-preview');
  logoPreview.innerHTML = '';
  if (s.brand_logo_path) {
    const img = document.createElement('img');
    img.src = `/uploads/${s.brand_logo_path}?t=${Date.now()}`;
    img.alt = s.brand_name || 'logo';
    logoPreview.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = 'No logo uploaded';
    logoPreview.appendChild(span);
  }
}

function markDirty(field, value) {
  state.dirty.set(field, value);
  updateSaveBtn();
}

function updateSaveBtn() {
  $('#save-btn').disabled = state.dirty.size === 0;
  if (state.dirty.size === 0) {
    $('#save-status').textContent = '';
  } else {
    $('#save-status').textContent = `${state.dirty.size} unsaved change${state.dirty.size === 1 ? '' : 's'}`;
    $('#save-status').className = 'hint';
  }
}

async function loadSchedule() {
  try {
    const sched = await api('/api/schedule');
    window.__TZ__ = sched.tz;
    $('#tz-name').textContent = sched.tz;
    const pill = $('#schedule-pill');
    if (sched.enabled) {
      pill.textContent = `Schedule on (${sched.tz})`;
      pill.className = 'pill pill-active';
    } else {
      pill.textContent = 'Schedule off';
      pill.className = 'pill pill-muted';
    }
    if (sched.next) {
      const d = new Date(sched.next);
      $('#next-run').textContent = `Next run: ${d.toLocaleString()}`;
    } else {
      $('#next-run').textContent = sched.enabled ? 'Next run: (computing…)' : '';
    }
  } catch (err) {
    console.error('schedule fetch failed', err);
  }
}

async function loadRecipients() {
  const tbody = $('#recipients-table tbody');
  tbody.innerHTML = '';
  const recipients = await api('/api/recipients');
  if (recipients.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="muted" style="text-align:center;padding:24px;">No recipients yet — add one above.</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const r of recipients) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(r.name || '')}</td>
      <td><label class="checkbox" style="margin:0;"><input type="checkbox" data-active="${r.id}" ${r.active ? 'checked' : ''}/><span></span></label></td>
      <td class="row-actions"><button class="btn btn-danger" data-delete="${r.id}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  }
}

function renderSkippedImports(skipped) {
  const block = $('#skipped-imports');
  const list = $('#skipped-list');
  list.innerHTML = '';
  if (!skipped || skipped.length === 0) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  for (const u of skipped) {
    const row = document.createElement('div');
    row.className = 'skipped-row';
    row.innerHTML = `
      <div class="skipped-meta">
        <strong>${escapeHtml(u.name || u.username)}</strong>
        <span class="username">@${escapeHtml(u.username)}</span>
      </div>
      <input type="email" placeholder="email@example.com" />
      <button class="btn btn-primary" type="button">Add</button>
    `;
    const input = row.querySelector('input');
    const addBtn = row.querySelector('button');
    addBtn.addEventListener('click', async () => {
      const email = (input.value || '').trim();
      if (!email || !/^.+@.+\..+$/.test(email)) {
        input.focus();
        input.style.borderColor = 'var(--danger)';
        return;
      }
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      try {
        await api('/api/recipients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: u.name || u.username })
        });
        row.classList.add('done');
        addBtn.textContent = 'Added';
        await loadRecipients();
      } catch (err) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add';
        input.style.borderColor = 'var(--danger)';
        alert(err.message);
      }
    });
    input.addEventListener('input', () => { input.style.borderColor = ''; });
    list.appendChild(row);
  }
}

async function loadHistory() {
  const tbody = $('#history-table tbody');
  tbody.innerHTML = '';
  const log = await api('/api/sendlog');
  if (log.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="muted" style="text-align:center;padding:24px;">No sends yet.</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const r of log) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.sent_at + 'Z').toLocaleString()}</td>
      <td>${r.recipient_count}</td>
      <td class="status-${r.status}">${r.status}</td>
      <td>${(r.duration_ms / 1000).toFixed(1)}s</td>
      <td class="muted">${escapeHtml(r.message || '')}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function refreshPreview() {
  const frame = $('#preview-frame');
  frame.src = `/api/preview?ts=${Date.now()}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindFieldHandlers() {
  for (const el of $$('[data-field]')) {
    const k = el.dataset.field;
    const handler = () => {
      let v;
      if (el.type === 'checkbox') v = el.checked ? 1 : 0;
      else if (NUMERIC_FIELDS.has(k)) v = Number(el.value);
      else v = el.value;
      markDirty(k, v);
      // sync color text + picker
      if (k === 'brand_accent') {
        for (const peer of $$(`[data-field-pair="${k}"]`)) peer.value = el.value;
      }
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  }
  for (const el of $$('[data-field-pair]')) {
    el.addEventListener('input', () => {
      const k = el.dataset.fieldPair;
      const peer = $(`[data-field="${k}"]`);
      if (peer) {
        peer.value = el.value;
        markDirty(k, el.value);
      }
    });
  }
}

async function saveChanges() {
  if (state.dirty.size === 0) return;
  const patch = Object.fromEntries(state.dirty);
  $('#save-status').textContent = 'Saving…';
  try {
    const updated = await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    applySettings(updated);
    $('#save-status').textContent = 'Saved.';
    $('#save-status').className = 'hint success';
    setTimeout(() => { $('#save-status').textContent = ''; }, 2500);
    loadSchedule();
  } catch (err) {
    $('#save-status').textContent = `Save failed: ${err.message}`;
    $('#save-status').className = 'hint error';
  }
}

function bindNav() {
  for (const link of $$('.nav-link')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.target;
      const el = document.getElementById(target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $$('.nav-link').forEach((n) => n.classList.toggle('active', n === link));
        $('#page-title').textContent = link.textContent.trim();
      }
    });
  }
  // Highlight on scroll
  const sections = $$('.card');
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const id = e.target.id;
        const link = $(`.nav-link[data-target="${id}"]`);
        if (link) {
          $$('.nav-link').forEach((n) => n.classList.toggle('active', n === link));
          $('#page-title').textContent = link.textContent.trim();
        }
      }
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach((s) => observer.observe(s));
}

function bindActions() {
  $('#save-btn').addEventListener('click', saveChanges);

  // Logo upload
  $('#logo-upload-btn').addEventListener('click', () => $('#logo-input').click());
  $('#logo-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await fetch('/api/upload/logo', { method: 'POST', body: fd });
      const s = await api('/api/settings');
      applySettings(s);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    }
    e.target.value = '';
  });
  $('#logo-remove-btn').addEventListener('click', async () => {
    if (!state.settings?.brand_logo_path) return;
    if (!confirm('Remove the current logo?')) return;
    await fetch('/api/upload/logo', { method: 'DELETE' });
    const s = await api('/api/settings');
    applySettings(s);
  });

  // Test buttons
  bindTest('#test-tautulli-btn', '#test-tautulli-status', '/api/test/tautulli');
  bindTest('#test-smtp-btn', '#test-smtp-status', '/api/test/smtp');

  $('#test-send-btn').addEventListener('click', async () => {
    const email = $('#test-email').value.trim();
    if (!email) { alert('Enter an email first'); return; }
    setStatus('#send-status', 'Sending test…');
    try {
      const r = await api('/api/test/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      setStatus('#send-status', r.ok ? `Test sent to ${email} (${r.durationMs}ms)` : `Failed: ${(r.errors || []).join('; ')}`, r.ok ? 'success' : 'error');
    } catch (err) {
      setStatus('#send-status', `Failed: ${err.message}`, 'error');
    }
  });

  $('#send-now-btn').addEventListener('click', async () => {
    if (!confirm('Send the newsletter to all active recipients now?')) return;
    setStatus('#send-status', 'Sending…');
    try {
      const r = await api('/api/send-now', { method: 'POST' });
      setStatus('#send-status',
        r.ok ? `Sent to ${r.sent} recipient${r.sent === 1 ? '' : 's'} (${r.durationMs}ms)` : `Sent ${r.sent}, failed ${r.failed}: ${(r.errors || []).slice(0,2).join('; ')}`,
        r.ok ? 'success' : 'error');
      loadHistory();
    } catch (err) {
      setStatus('#send-status', `Failed: ${err.message}`, 'error');
    }
  });

  $('#preview-btn').addEventListener('click', refreshPreview);

  // Schedule presets
  for (const btn of $$('.presets [data-cron]')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cron = btn.dataset.cron;
      const input = $('[data-field="schedule_cron"]');
      input.value = cron;
      input.dispatchEvent(new Event('input'));
    });
  }

  // Recipients
  $('#add-recipient-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#new-recipient-email').value.trim();
    const name = $('#new-recipient-name').value.trim();
    try {
      await api('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });
      $('#new-recipient-email').value = '';
      $('#new-recipient-name').value = '';
      loadRecipients();
    } catch (err) {
      alert(err.message);
    }
  });
  $('#import-plex-btn').addEventListener('click', async () => {
    const btn = $('#import-plex-btn');
    const status = $('#import-plex-status');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing…';
    status.textContent = '';
    status.className = 'hint';
    try {
      const r = await api('/api/recipients/import-from-plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false })
      });
      const parts = [];
      if (r.imported) parts.push(`${r.imported} imported`);
      if (r.skippedExisting) parts.push(`${r.skippedExisting} already added`);
      if (r.skippedNoEmail) parts.push(`${r.skippedNoEmail} skipped (no email)`);
      status.textContent = parts.length > 0 ? parts.join(' · ') : 'Nothing to import.';
      status.className = `hint ${r.imported > 0 ? 'success' : ''}`;
      renderSkippedImports(r.skippedNoEmailList || []);
      await loadRecipients();
    } catch (err) {
      status.textContent = `Import failed: ${err.message}`;
      status.className = 'hint error';
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  $('#recipients-table').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) {
      const id = del.dataset.delete;
      if (!confirm('Delete this recipient?')) return;
      await api(`/api/recipients/${id}`, { method: 'DELETE' });
      loadRecipients();
    }
  });
  $('#recipients-table').addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-active]');
    if (cb) {
      const id = cb.dataset.active;
      await api(`/api/recipients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: cb.checked })
      });
    }
  });
}

function bindTest(btnSel, statusSel, endpoint) {
  $(btnSel).addEventListener('click', async () => {
    const status = $(statusSel);
    status.textContent = 'Testing…';
    status.className = 'hint';
    try {
      const r = await api(endpoint, { method: 'POST' });
      status.textContent = r.message || (r.ok ? 'OK' : 'Failed');
      status.className = `hint ${r.ok ? 'success' : 'error'}`;
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
      status.className = 'hint error';
    }
  });
}

function setStatus(sel, text, kind = '') {
  const el = $(sel);
  el.textContent = text;
  el.className = `hint ${kind}`;
}

(async function init() {
  bindNav();
  bindFieldHandlers();
  bindActions();
  try {
    const s = await api('/api/settings');
    applySettings(s);
    await loadSchedule();
    await loadRecipients();
    await loadHistory();
    refreshPreview();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<pre style="padding:24px;color:#f87171;">Failed to load: ${escapeHtml(err.message)}</pre>`;
  }
})();
