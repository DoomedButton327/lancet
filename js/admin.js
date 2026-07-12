/* ============================================================
   ADMIN.JS
   Fully hidden root console. There is NO button, menu item, or
   visible link anywhere in the UI that opens this. It only opens
   via a secret gesture (see SECRET GESTURE below) and is then
   locked behind a passphrase you set yourself.

   >>> SET YOUR ADMIN PASSPHRASE <<<
   Change ADMIN_PASSPHRASE_DEFAULT below before you publish this
   site. On first unlock with the default, you'll be prompted to
   set a permanent one, which is then stored (hashed) in this
   browser's localStorage — not in this file — so you can change
   it later from inside the panel without editing code.

   >>> SECRET GESTURE TO OPEN THE ADMIN PANEL <<<
   Type the sequence:  admin  (five letters, anywhere on the
   page, not inside a text field) within 1.5 seconds total.
   You can change SECRET_SEQUENCE below to anything you like.
   ============================================================ */

const ADMIN_PASSPHRASE_DEFAULT = "changeme123"; // <-- change this before publishing, or set a new one on first unlock
const SECRET_SEQUENCE = "admin"; // <-- typed anywhere (not in a text field) to open the hidden console

const Admin = (() => {
  const LS_HASH_KEY = 'labtrack_admin_hash_v1';

  let seqBuffer = '';
  let seqTimer = null;
  let unlocked = false;

  // simple non-cryptographic hash — sufficient to avoid storing plaintext
  // in localStorage; this is a convenience lock, not a security boundary
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return 'h' + h.toString(36) + str.length;
  }

  function getStoredHash() {
    return localStorage.getItem(LS_HASH_KEY) || hash(ADMIN_PASSPHRASE_DEFAULT);
  }
  function setPassphrase(newPass) {
    localStorage.setItem(LS_HASH_KEY, hash(newPass));
  }

  function isTypingInField() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function initGesture() {
    document.addEventListener('keydown', (e) => {
      if (isTypingInField()) return;
      if (e.key.length !== 1) return;
      clearTimeout(seqTimer);
      seqBuffer += e.key.toLowerCase();
      if (seqBuffer.length > SECRET_SEQUENCE.length) {
        seqBuffer = seqBuffer.slice(-SECRET_SEQUENCE.length);
      }
      if (seqBuffer === SECRET_SEQUENCE) {
        openOverlay();
        seqBuffer = '';
      }
      seqTimer = setTimeout(() => { seqBuffer = ''; }, 1500);
    });
  }

  function openOverlay() {
    document.getElementById('adminOverlay').classList.add('show');
    if (unlocked) showContent();
    else showLock();
  }
  function closeOverlay() {
    document.getElementById('adminOverlay').classList.remove('show');
  }

  function showLock() {
    document.getElementById('adminLock').style.display = 'flex';
    document.getElementById('adminContent').style.display = 'none';
    document.getElementById('adminPassInput').value = '';
    setTimeout(() => document.getElementById('adminPassInput').focus(), 100);
  }

  function showContent() {
    document.getElementById('adminLock').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    renderOverview();
    renderRewriteTable();
    renderRawJson();
  }

  function tryUnlock() {
    const input = document.getElementById('adminPassInput').value;
    if (hash(input) === getStoredHash()) {
      unlocked = true;
      showContent();
      UI.toast('Root console unlocked', 'success');
    } else if (input === ADMIN_PASSPHRASE_DEFAULT && !localStorage.getItem(LS_HASH_KEY)) {
      unlocked = true;
      showContent();
    } else {
      UI.toast('Incorrect passphrase', 'error');
    }
  }

  function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.adminTab === tab));
    document.querySelectorAll('.admin-view').forEach(v => v.classList.toggle('active', v.id === `admin-${tab}`));
  }

  function renderOverview() {
    const stats = Store.getStats();
    const grid = document.getElementById('adminStatGrid');
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-label">Samples</div><div class="stat-value">${stats.total}</div></div>
      <div class="stat-card"><div class="stat-label">History Entries</div><div class="stat-value">${stats.historyCount}</div></div>
      <div class="stat-card"><div class="stat-label">People</div><div class="stat-value">${stats.people}</div></div>
      <div class="stat-card"><div class="stat-label">GitHub Sync</div><div class="stat-value" style="font-size:16px;">${GitHubSync.isConnected() ? 'Connected' : 'Off'}</div></div>
    `;
  }

  function renderRewriteTable() {
    const data = Store.get();
    const body = document.getElementById('adminHistoryBody');
    if (!data.history.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);">No history yet</td></tr>`;
      return;
    }
    body.innerHTML = data.history.map(h => `
      <tr data-hist-id="${h.id}">
        <td class="data-code" style="font-size:11.5px;">${UI.formatDate(h.ts)}</td>
        <td>${UI.esc(h.action)}</td>
        <td>${UI.esc(h.sampleName || '—')}</td>
        <td>${UI.esc(h.personName || '—')}</td>
        <td style="max-width:220px;">${UI.esc(h.details || '')}</td>
        <td><button class="btn-icon-inline" data-del-hist="${h.id}">✕</button></td>
      </tr>
    `).join('');

    body.querySelectorAll('[data-del-hist]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.delHist;
        const d = Store.get();
        d.history = d.history.filter(h => h.id !== id);
        Store.persist();
        renderRewriteTable();
        renderOverview();
        UI.toast('History entry deleted', 'success');
      });
    });
  }

  function renderRawJson() {
    document.getElementById('adminRawJson').value = JSON.stringify(Store.get(), null, 2);
  }

  function applyRawJson() {
    try {
      const parsed = JSON.parse(document.getElementById('adminRawJson').value);
      Store.replaceAll(parsed);
      Store.logHistory({ action: 'edited', details: 'Raw data store overwritten via root console', actor: 'ROOT' });
      UI.toast('Raw data applied', 'success');
      UI.renderAll();
      renderOverview();
    } catch (e) {
      UI.toast('Invalid JSON — not applied', 'error');
    }
  }

  function wipeSamples() {
    if (!confirm('Wipe ALL samples? This cannot be undone.')) return;
    const d = Store.get();
    d.samples = [];
    Store.logHistory({ action: 'edited', details: 'All samples wiped via root console', actor: 'ROOT' });
    Store.persist();
    UI.renderAll(); renderOverview();
    UI.toast('All samples wiped', 'success');
  }
  function wipeHistory() {
    if (!confirm('Wipe the ENTIRE history log? This cannot be undone.')) return;
    const d = Store.get();
    d.history = [];
    Store.persist();
    renderRewriteTable(); renderOverview();
    UI.toast('History wiped', 'success');
  }
  function factoryReset() {
    if (!confirm('Factory reset EVERYTHING — samples, people, locations, history? This cannot be undone.')) return;
    Store.replaceAll(Store.defaultData());
    UI.renderAll();
    renderOverview(); renderRewriteTable(); renderRawJson();
    UI.toast('Factory reset complete', 'success');
  }
  function changePassphrase() {
    const val = document.getElementById('adminNewPass').value;
    if (!val || val.length < 4) { UI.toast('Passphrase must be at least 4 characters', 'error'); return; }
    setPassphrase(val);
    document.getElementById('adminNewPass').value = '';
    UI.toast('Passphrase updated', 'success');
  }

  function init() {
    initGesture();

    document.getElementById('adminCloseBtn').addEventListener('click', closeOverlay);
    document.getElementById('adminUnlockBtn').addEventListener('click', tryUnlock);
    document.getElementById('adminPassInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchAdminTab(btn.dataset.adminTab));
    });

    document.getElementById('adminWipeSamples').addEventListener('click', wipeSamples);
    document.getElementById('adminWipeHistory').addEventListener('click', wipeHistory);
    document.getElementById('adminFactoryReset').addEventListener('click', factoryReset);
    document.getElementById('adminChangePass').addEventListener('click', changePassphrase);
    document.getElementById('adminApplyRaw').addEventListener('click', applyRawJson);
    document.getElementById('adminReloadRaw').addEventListener('click', renderRawJson);

    document.getElementById('adminOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'adminOverlay') closeOverlay();
    });
  }

  return { init, openOverlay, closeOverlay };
})();
