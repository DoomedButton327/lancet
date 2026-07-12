/* ============================================================
   UI.JS
   Rendering + interaction logic for all normal (non-admin) views.
   ============================================================ */

const UI = (() => {

  const STATUS_LABEL = { in: 'In storage', out: 'Checked out', depleted: 'Depleted', disposed: 'Disposed' };
  const ACTION_LABEL = {
    created: 'created', checkout: 'checked out', checkin: 'checked in',
    moved: 'moved', edited: 'edited', disposed: 'disposed', note: 'noted on'
  };

  // ---------- Toast ----------
  function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('closing');
      setTimeout(() => el.remove(), 320);
    }, 3200);
  }

  // ---------- Modal helpers ----------
  function openModal(id) {
    document.getElementById('modalBackdrop').classList.add('show');
    document.getElementById(id).classList.add('show');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('show');
    const anyOpen = document.querySelectorAll('.modal.show').length > 0;
    if (!anyOpen) document.getElementById('modalBackdrop').classList.remove('show');
    if (id === 'scannerModal') Scanner.stopCamera();
  }
  function closeAllModals() {
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    document.getElementById('modalBackdrop').classList.remove('show');
    Scanner.stopCamera();
  }

  // ---------- Tabs ----------
  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tab}`));
    renderAll();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const stats = Store.getStats();
    const grid = document.getElementById('statGrid');
    grid.innerHTML = `
      ${statCard('Total Samples', stats.total, '')}
      ${statCard('Currently Out', stats.out, 'warn')}
      ${statCard('In Storage', stats.inStorage, 'accent')}
      ${statCard('People', stats.people, '')}
    `;

    const data = Store.get();
    const out = data.samples.filter(s => s.status === 'out');
    document.getElementById('checkedOutCount').textContent = out.length;
    const list = document.getElementById('checkedOutList');
    if (!out.length) {
      list.innerHTML = `<div class="empty-state">Nothing checked out. All samples are home.</div>`;
    } else {
      list.innerHTML = out.map(s => {
        const holder = data.people.find(p => p.id === s.holder);
        return `<div class="timeline-card" style="margin-bottom:10px;">
          <div class="timeline-main"><strong>${esc(s.name)}</strong> — held by ${holder ? esc(holder.name) : 'Unknown'}</div>
          <div class="timeline-detail">${esc(Store.locationString(s))} · <span class="data-code">${esc(s.barcode)}</span></div>
        </div>`;
      }).join('');
    }

    const recentList = document.getElementById('recentActivityList');
    const recent = data.history.slice(0, 8);
    if (!recent.length) {
      recentList.innerHTML = `<div class="empty-state">No activity yet.</div>`;
    } else {
      recentList.innerHTML = recent.map(h => historyItemHtml(h, true)).join('');
    }
  }

  function statCard(label, value, accentClass) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value ${accentClass}">${value}</div></div>`;
  }

  // ---------- Samples table ----------
  function renderSamples() {
    const data = Store.get();
    const search = (document.getElementById('sampleSearch').value || '').toLowerCase();
    const statusF = document.getElementById('statusFilter').value;
    const rowF = document.getElementById('rowFilter').value;

    // populate row filter options
    const rowSel = document.getElementById('rowFilter');
    const rows = [...new Set(data.samples.map(s => s.row).filter(Boolean))];
    const currentRowVal = rowSel.value;
    rowSel.innerHTML = `<option value="">All rows</option>` + rows.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    rowSel.value = currentRowVal;

    let list = data.samples.filter(s => {
      if (statusF && s.status !== statusF) return false;
      if (rowF && s.row !== rowF) return false;
      if (search) {
        const hay = `${s.name} ${s.barcode} ${s.fridge} ${s.row} ${s.slot} ${s.type}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const tbody = document.getElementById('samplesTableBody');
    const emptyState = document.getElementById('samplesEmptyState');
    if (!list.length) {
      tbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    tbody.innerHTML = list.map(s => {
      const holder = data.people.find(p => p.id === s.holder);
      return `<tr data-sample-id="${s.id}">
        <td class="cell-code">${esc(s.barcode)}</td>
        <td class="cell-name">${esc(s.name)}</td>
        <td>${esc(Store.locationString(s))}</td>
        <td><span class="pill pill-${s.status}">${STATUS_LABEL[s.status]}</span></td>
        <td>${holder ? esc(holder.name) : '—'}</td>
        <td class="data-code" style="font-size:11.5px;">${timeAgo(s.updatedAt)}</td>
        <td>
          <div class="row-actions">
            <button data-action="view" title="View / manage">${iconEye()}</button>
            <button data-action="delete" title="Delete">${iconTrash()}</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        const id = tr.dataset.sampleId;
        if (btn && btn.dataset.action === 'delete') {
          e.stopPropagation();
          if (confirm('Delete this sample? This cannot be undone (history is kept).')) {
            Store.deleteSample(id);
            toast('Sample deleted', 'success');
            renderAll();
          }
          return;
        }
        openSampleDetail(id);
      });
    });
  }

  // ---------- Sample add/edit modal ----------
  function openSampleModal(existing) {
    document.getElementById('sampleModalTitle').textContent = existing ? 'Edit Sample' : 'New Sample';
    document.getElementById('sampleId').value = existing ? existing.id : '';
    document.getElementById('sampleName').value = existing ? existing.name : '';
    document.getElementById('sampleBarcode').value = existing ? existing.barcode : '';
    document.getElementById('sampleType').value = existing ? existing.type : '';
    document.getElementById('sampleFridge').value = existing ? existing.fridge : '';
    document.getElementById('sampleRow').value = existing ? existing.row : '';
    document.getElementById('sampleSlot').value = existing ? existing.slot : '';
    document.getElementById('sampleStatus').value = existing ? existing.status : 'in';
    document.getElementById('sampleNotes').value = existing ? existing.notes : '';
    openModal('sampleModal');
  }

  function saveSampleFromForm() {
    const id = document.getElementById('sampleId').value;
    const name = document.getElementById('sampleName').value.trim();
    if (!name) { toast('Sample name is required', 'error'); return; }
    let barcode = document.getElementById('sampleBarcode').value.trim();
    if (!barcode) barcode = Barcode.generateCode(document.getElementById('genPrefix').value || 'LAB');

    const payload = {
      name,
      barcode,
      type: document.getElementById('sampleType').value.trim(),
      fridge: document.getElementById('sampleFridge').value.trim(),
      row: document.getElementById('sampleRow').value.trim(),
      slot: document.getElementById('sampleSlot').value.trim(),
      status: document.getElementById('sampleStatus').value,
      notes: document.getElementById('sampleNotes').value.trim()
    };

    if (id) {
      Store.updateSample(id, payload);
      toast('Sample updated', 'success');
    } else {
      const dup = Store.findByBarcode(barcode);
      if (dup) { toast('That barcode is already in use', 'error'); return; }
      Store.addSample(payload);
      toast('Sample created', 'success');
    }
    closeModal('sampleModal');
    renderAll();
  }

  // ---------- Sample detail modal ----------
  function openSampleDetail(id) {
    const data = Store.get();
    const s = data.samples.find(x => x.id === id);
    if (!s) return;
    const holder = data.people.find(p => p.id === s.holder);

    document.getElementById('detailModalTitle').textContent = s.name;
    const body = document.getElementById('detailModalBody');

    const peopleOptions = data.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    const fridgeOptions = data.fridges.map(f => `<option value="${esc(f.name)}" ${f.name === s.fridge ? 'selected' : ''}>${esc(f.name)}</option>`).join('');

    body.innerHTML = `
      <div class="detail-top">
        <div class="detail-barcode-box"><svg id="detailBarcodeSvg"></svg></div>
        <div class="detail-info">
          <h3>${esc(s.name)}</h3>
          <div class="detail-meta">
            <span class="pill pill-${s.status}">${STATUS_LABEL[s.status]}</span>
            ${s.type ? `<span class="pill" style="background:var(--glass-fill-soft);color:var(--text-secondary);border:1px solid var(--glass-border);">${esc(s.type)}</span>` : ''}
          </div>
          <div class="detail-loc">📍 ${esc(Store.locationString(s))}</div>
          ${holder ? `<div class="detail-loc">🖐️ Held by ${esc(holder.name)}</div>` : ''}
          ${s.notes ? `<div class="detail-loc" style="margin-top:8px;color:var(--text-tertiary);">${esc(s.notes)}</div>` : ''}
        </div>
      </div>

      <div class="detail-actions">
        ${s.status === 'in' ? `
          <div class="form-row" style="flex:1;min-width:180px;">
            <label>Who is taking it?</label>
            <select id="checkoutPerson"><option value="">Select person...</option>${peopleOptions}</select>
          </div>
          <button class="btn btn-primary" id="doCheckout" style="align-self:flex-end;">Check Out</button>
        ` : s.status === 'out' ? `
          <div class="form-row" style="flex:1;min-width:180px;">
            <label>Returning as</label>
            <select id="checkinPerson"><option value="">Select person...</option>${peopleOptions}</select>
          </div>
          <button class="btn btn-primary" id="doCheckin" style="align-self:flex-end;">Check In</button>
        ` : ''}
        <button class="btn btn-ghost" id="doEdit">Edit</button>
      </div>

      <div class="detail-section-title">Move To New Location</div>
      <div class="form-grid">
        <div class="form-row">
          <label>Fridge</label>
          <input type="text" id="moveFridge" list="fridgeListOptions" value="${esc(s.fridge)}">
          <datalist id="fridgeListOptions">${data.fridges.map(f => `<option value="${esc(f.name)}">`).join('')}</datalist>
        </div>
        <div class="form-row">
          <label>Row</label>
          <input type="text" id="moveRow" value="${esc(s.row)}">
        </div>
        <div class="form-row">
          <label>Slot</label>
          <input type="text" id="moveSlot" value="${esc(s.slot)}">
        </div>
        <div class="form-row">
          <label>Moved by</label>
          <select id="movePerson"><option value="">Select person...</option>${peopleOptions}</select>
        </div>
      </div>
      <button class="btn btn-ghost full-width" id="doMove" style="margin-top:8px;">Log Move</button>

      <div class="detail-section-title">Add Note</div>
      <div class="form-grid">
        <div class="form-row span-2">
          <textarea id="detailNoteText" rows="2" placeholder="e.g. Contamination checked, looks fine"></textarea>
        </div>
        <div class="form-row">
          <select id="notePerson"><option value="">Noted by...</option>${peopleOptions}</select>
        </div>
        <div class="form-row">
          <button class="btn btn-ghost full-width" id="doAddNote">Add Note</button>
        </div>
      </div>

      <div class="detail-section-title">Danger Zone</div>
      <button class="btn btn-danger-ghost full-width" id="doDispose">Mark as Disposed</button>

      <div class="detail-section-title">Chain of Custody</div>
      <div class="timeline" id="detailTimeline" style="padding-left:24px;"></div>
    `;

    Barcode.renderTo(document.getElementById('detailBarcodeSvg'), s.barcode);

    const sampleHistory = data.history.filter(h => h.sampleId === s.id);
    const tl = document.getElementById('detailTimeline');
    tl.innerHTML = sampleHistory.length
      ? sampleHistory.map(h => historyItemHtml(h, false)).join('')
      : `<div class="empty-state">No history yet.</div>`;

    // wire actions
    const doCheckout = document.getElementById('doCheckout');
    if (doCheckout) doCheckout.addEventListener('click', () => {
      const pid = document.getElementById('checkoutPerson').value;
      if (!pid) { toast('Select who is taking it', 'error'); return; }
      Store.checkoutSample(s.id, pid);
      toast('Checked out', 'success');
      openSampleDetail(s.id); renderAll();
    });
    const doCheckin = document.getElementById('doCheckin');
    if (doCheckin) doCheckin.addEventListener('click', () => {
      const pid = document.getElementById('checkinPerson').value;
      Store.checkinSample(s.id, pid || s.holder);
      toast('Checked in', 'success');
      openSampleDetail(s.id); renderAll();
    });
    document.getElementById('doEdit').addEventListener('click', () => {
      closeModal('detailModal');
      openSampleModal(s);
    });
    document.getElementById('doMove').addEventListener('click', () => {
      const fridge = document.getElementById('moveFridge').value.trim();
      const row = document.getElementById('moveRow').value.trim();
      const slot = document.getElementById('moveSlot').value.trim();
      const pid = document.getElementById('movePerson').value;
      if (!pid) { toast('Select who moved it', 'error'); return; }
      Store.moveSample(s.id, { fridge, row, slot }, pid);
      toast('Move logged', 'success');
      openSampleDetail(s.id); renderAll();
    });
    document.getElementById('doAddNote').addEventListener('click', () => {
      const text = document.getElementById('detailNoteText').value.trim();
      const pid = document.getElementById('notePerson').value;
      if (!text) { toast('Write a note first', 'error'); return; }
      Store.addNote(s.id, pid, text);
      toast('Note added', 'success');
      openSampleDetail(s.id); renderAll();
    });
    document.getElementById('doDispose').addEventListener('click', () => {
      if (!confirm('Mark this sample as disposed? It will remain in history.')) return;
      Store.disposeSample(s.id, s.holder);
      toast('Sample marked disposed', 'success');
      closeModal('detailModal'); renderAll();
    });

    openModal('detailModal');
  }

  // ---------- People ----------
  function renderPeople() {
    const data = Store.get();
    const grid = document.getElementById('peopleGrid');
    if (!data.people.length) {
      grid.innerHTML = `<div class="empty-state">No people added yet. Add lab members so you can log who handles each sample.</div>`;
      return;
    }
    grid.innerHTML = data.people.map(p => {
      const held = data.samples.filter(s => s.holder === p.id).length;
      const actions = data.history.filter(h => h.personId === p.id).length;
      const initials = p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      return `<div class="person-card" data-person-id="${p.id}">
        <div class="person-card-top">
          <div class="person-avatar">${initials}</div>
          <div>
            <div class="person-name">${esc(p.name)}</div>
            <div class="person-role">${esc(p.role || 'No role set')}</div>
          </div>
        </div>
        <div class="person-stats">
          <span>${held} checked out</span>
          <span>${actions} actions logged</span>
        </div>
        <div class="person-actions">
          <button class="btn btn-ghost" data-action="edit">Edit</button>
          <button class="btn btn-danger-ghost" data-action="delete">Remove</button>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.person-card').forEach(card => {
      const id = card.dataset.personId;
      card.querySelector('[data-action="edit"]').addEventListener('click', () => openPersonModal(data.people.find(p => p.id === id)));
      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (confirm('Remove this person? History entries referencing them are kept.')) {
          Store.deletePerson(id);
          toast('Person removed', 'success');
          renderAll();
        }
      });
    });
  }

  function openPersonModal(existing) {
    document.getElementById('personModalTitle').textContent = existing ? 'Edit Person' : 'Add Person';
    document.getElementById('personId').value = existing ? existing.id : '';
    document.getElementById('personName').value = existing ? existing.name : '';
    document.getElementById('personRole').value = existing ? existing.role : '';
    document.getElementById('personBadge').value = existing ? existing.badge : '';
    openModal('personModal');
  }

  function savePersonFromForm() {
    const id = document.getElementById('personId').value;
    const name = document.getElementById('personName').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const payload = {
      name,
      role: document.getElementById('personRole').value.trim(),
      badge: document.getElementById('personBadge').value.trim()
    };
    if (id) { Store.updatePerson(id, payload); toast('Person updated', 'success'); }
    else { Store.addPerson(payload); toast('Person added', 'success'); }
    closeModal('personModal');
    renderAll();
  }

  // ---------- Storage map ----------
  function renderStorage() {
    const data = Store.get();
    const container = document.getElementById('storageMapContainer');
    if (!data.fridges.length) {
      container.innerHTML = `<div class="empty-state">No storage locations yet. Click "Manage Locations" to add a fridge.</div>`;
      return;
    }
    container.innerHTML = data.fridges.map(f => {
      const samplesHere = data.samples.filter(s => s.fridge === f.name);
      const rows = [...new Set(samplesHere.map(s => s.row).filter(Boolean))];
      return `<div class="fridge-block">
        <div class="fridge-head">
          <h3>🧊 ${esc(f.name)}</h3>
          <span class="pill" style="background:var(--glass-fill-soft);border:1px solid var(--glass-border);color:var(--text-secondary);">${samplesHere.length} samples</span>
        </div>
        <div class="fridge-rows">
          ${rows.length ? rows.map(r => {
            const slotSamples = samplesHere.filter(s => s.row === r);
            return `<div class="row-strip">
              <span class="row-label">${esc(r)}</span>
              ${slotSamples.map(s => `<span class="slot-chip ${s.status === 'out' ? 'chip-out' : ''}" data-sample-id="${s.id}" title="${esc(s.name)}">${esc(s.slot || s.barcode)}</span>`).join('')}
            </div>`;
          }).join('') : `<div class="empty-state" style="padding:16px;">No samples assigned to a row in this fridge yet.</div>`}
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.slot-chip').forEach(chip => {
      chip.addEventListener('click', () => openSampleDetail(chip.dataset.sampleId));
    });
  }

  function renderStorageManage() {
    const data = Store.get();
    const el = document.getElementById('fridgeListManage');
    if (!data.fridges.length) {
      el.innerHTML = `<div class="empty-state">No fridges yet.</div>`;
      return;
    }
    el.innerHTML = data.fridges.map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--glass-border);">
        <span>🧊 ${esc(f.name)}</span>
        <button class="btn-icon-inline" data-fridge-id="${f.id}" title="Delete">${iconTrash()}</button>
      </div>
    `).join('');
    el.querySelectorAll('[data-fridge-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this fridge? Samples assigned to it will keep the name as free text.')) {
          Store.deleteFridge(btn.dataset.fridgeId);
          renderStorageManage();
          renderAll();
        }
      });
    });
  }

  // ---------- History ----------
  function renderHistory() {
    const data = Store.get();
    const search = (document.getElementById('historySearch').value || '').toLowerCase();
    const actionF = document.getElementById('historyActionFilter').value;
    const dateF = document.getElementById('historyDateFilter').value;

    let list = data.history.filter(h => {
      if (actionF && h.action !== actionF) return false;
      if (dateF) {
        const d = new Date(h.ts).toISOString().slice(0, 10);
        if (d !== dateF) return false;
      }
      if (search) {
        const hay = `${h.sampleName || ''} ${h.personName || ''} ${h.details || ''} ${h.action}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const tl = document.getElementById('historyTimeline');
    if (!list.length) {
      tl.innerHTML = `<div class="empty-state">No matching history entries.</div>`;
      return;
    }
    tl.innerHTML = list.map(h => historyItemHtml(h, false)).join('');
  }

  function historyItemHtml(h, compact) {
    const verb = ACTION_LABEL[h.action] || h.action;
    return `<div class="timeline-item action-${h.action}">
      <div class="timeline-card">
        <div class="timeline-time">${formatDate(h.ts)}</div>
        <div class="timeline-main">
          ${h.personName ? `<strong>${esc(h.personName)}</strong>` : `<strong>System</strong>`}
          ${verb}
          ${h.sampleName ? `<strong>${esc(h.sampleName)}</strong>` : ''}
        </div>
        ${h.details && !compact ? `<div class="timeline-detail">${esc(h.details)}</div>` : ''}
      </div>
    </div>`;
  }

  function exportHistoryCsv() {
    const data = Store.get();
    const rows = [['Timestamp', 'Action', 'Sample', 'Person', 'Details']];
    data.history.forEach(h => rows.push([h.ts, h.action, h.sampleName || '', h.personName || '', (h.details || '').replace(/\n/g, ' ')]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `labtrack-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Generate labels ----------
  function renderGenerateOptions() {
    const data = Store.get();
    const sel = document.getElementById('genExistingSample');
    sel.innerHTML = data.samples.map(s => `<option value="${s.id}">${esc(s.name)} (${esc(s.barcode)})</option>`).join('');
  }

  function buildLabelSheet() {
    const sourceType = document.getElementById('genSourceType').value;
    const format = document.getElementById('genFormat').value;
    const sheet = document.getElementById('labelSheet');
    sheet.innerHTML = '';

    if (sourceType === 'existing') {
      const id = document.getElementById('genExistingSample').value;
      const s = Store.get().samples.find(x => x.id === id);
      if (!s) { toast('No sample selected', 'error'); return; }
      appendLabel(sheet, s.barcode, format, s.name);
      return;
    }

    const count = Math.max(1, Math.min(60, parseInt(document.getElementById('genCount').value) || 1));
    const prefix = document.getElementById('genPrefix').value.trim() || 'LAB';
    for (let i = 0; i < count; i++) {
      const code = Barcode.generateCode(prefix);
      appendLabel(sheet, code, format, '');
    }
  }

  function appendLabel(sheet, code, format, caption) {
    const card = document.createElement('div');
    card.className = 'label-card';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    card.appendChild(svg);
    if (caption) {
      const cap = document.createElement('div');
      cap.className = 'label-caption';
      cap.textContent = caption;
      card.appendChild(cap);
    }
    sheet.appendChild(card);
    Barcode.renderTo(svg, code, format);
  }

  // ---------- Utilities ----------
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }
  function iconEye() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }
  function iconTrash() { return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`; }

  function renderAll() {
    renderDashboard();
    renderSamples();
    renderStorage();
    renderPeople();
    renderHistory();
    renderGenerateOptions();
  }

  return {
    toast, openModal, closeModal, closeAllModals, switchTab,
    renderDashboard, renderSamples, openSampleModal, saveSampleFromForm, openSampleDetail,
    renderPeople, openPersonModal, savePersonFromForm,
    renderStorage, renderStorageManage,
    renderHistory, exportHistoryCsv,
    renderGenerateOptions, buildLabelSheet,
    renderAll, esc, formatDate
  };
})();
