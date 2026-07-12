/* ============================================================
   STORE.JS
   Central data store. Everything lives in one JSON object,
   persisted to localStorage, and optionally synced to GitHub
   (see github.js). This is the single source of truth — every
   other module reads/writes through Store, never localStorage
   directly.
   ============================================================ */

const Store = (() => {
  const LS_KEY = 'labtrack_data_v1';
  const LS_SETTINGS_KEY = 'labtrack_settings_v1';

  const defaultData = () => ({
    samples: [],       // {id, name, barcode, type, fridge, row, slot, status, notes, holder, createdAt, updatedAt}
    people: [],         // {id, name, role, badge, createdAt}
    fridges: [],         // {id, name, rows: [{id, name, slots:[{id,name}]}]}
    history: [],         // {id, ts, action, sampleId, sampleName, personId, personName, details, actor}
    meta: { version: 1 }
  });

  let data = null;
  let listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      data = raw ? JSON.parse(raw) : defaultData();
      // backfill any missing top-level keys for forward-compat
      const d = defaultData();
      for (const k in d) if (!(k in data)) data[k] = d[k];
    } catch (e) {
      console.error('Store load failed, resetting', e);
      data = defaultData();
    }
    return data;
  }

  function persist() {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    listeners.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
    // Debounced push to GitHub if connected
    if (window.GitHubSync && GitHubSync.isConnected()) {
      GitHubSync.scheduleSync();
    }
  }

  function onChange(fn) { listeners.push(fn); }

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso() { return new Date().toISOString(); }

  // ---------- Settings (token etc, kept separate from synced data) ----------
  function getSettings() {
    try { return JSON.parse(localStorage.getItem(LS_SETTINGS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function setSettings(patch) {
    const s = { ...getSettings(), ...patch };
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(s));
    return s;
  }

  // ---------- History ----------
  function logHistory({ action, sampleId, sampleName, personId, personName, details, actor }) {
    data.history.unshift({
      id: uid('hist'),
      ts: nowIso(),
      action,
      sampleId: sampleId || null,
      sampleName: sampleName || null,
      personId: personId || null,
      personName: personName || null,
      details: details || '',
      actor: actor || 'user'
    });
    // Fire Discord webhook (fails silently if not configured)
    if (window.Webhook) Webhook.notify({ action, sampleName, personName, details });
  }

  // ---------- Samples ----------
  function addSample(sample) {
    const s = {
      id: uid('smp'),
      name: sample.name,
      barcode: sample.barcode || uid('bc').toUpperCase(),
      type: sample.type || '',
      fridge: sample.fridge || '',
      row: sample.row || '',
      slot: sample.slot || '',
      status: sample.status || 'in',
      notes: sample.notes || '',
      holder: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    data.samples.push(s);
    logHistory({
      action: 'created',
      sampleId: s.id,
      sampleName: s.name,
      details: `Sample created — ${locationString(s)}`
    });
    persist();
    return s;
  }

  function updateSample(id, patch, opts = {}) {
    const s = data.samples.find(x => x.id === id);
    if (!s) return null;
    Object.assign(s, patch, { updatedAt: nowIso() });
    if (!opts.silent) {
      logHistory({
        action: 'edited',
        sampleId: s.id,
        sampleName: s.name,
        details: opts.details || 'Sample details updated'
      });
    }
    persist();
    return s;
  }

  function deleteSample(id) {
    const s = data.samples.find(x => x.id === id);
    data.samples = data.samples.filter(x => x.id !== id);
    persist();
    return s;
  }

  function checkoutSample(id, personId, note) {
    const s = data.samples.find(x => x.id === id);
    const p = data.people.find(x => x.id === personId);
    if (!s || !p) return null;
    s.status = 'out';
    s.holder = p.id;
    s.updatedAt = nowIso();
    logHistory({
      action: 'checkout',
      sampleId: s.id,
      sampleName: s.name,
      personId: p.id,
      personName: p.name,
      details: note || `Taken from ${locationString(s)}`
    });
    persist();
    return s;
  }

  function checkinSample(id, personId, note) {
    const s = data.samples.find(x => x.id === id);
    const p = data.people.find(x => x.id === personId);
    if (!s) return null;
    s.status = 'in';
    s.holder = null;
    s.updatedAt = nowIso();
    logHistory({
      action: 'checkin',
      sampleId: s.id,
      sampleName: s.name,
      personId: p ? p.id : null,
      personName: p ? p.name : null,
      details: note || `Returned to ${locationString(s)}`
    });
    persist();
    return s;
  }

  function moveSample(id, { fridge, row, slot }, personId, note) {
    const s = data.samples.find(x => x.id === id);
    const p = data.people.find(x => x.id === personId);
    if (!s) return null;
    const from = locationString(s);
    s.fridge = fridge; s.row = row; s.slot = slot;
    s.updatedAt = nowIso();
    logHistory({
      action: 'moved',
      sampleId: s.id,
      sampleName: s.name,
      personId: p ? p.id : null,
      personName: p ? p.name : null,
      details: note || `Moved from ${from} to ${locationString(s)}`
    });
    persist();
    return s;
  }

  function disposeSample(id, personId, note) {
    const s = data.samples.find(x => x.id === id);
    const p = data.people.find(x => x.id === personId);
    if (!s) return null;
    s.status = 'disposed';
    s.holder = null;
    s.updatedAt = nowIso();
    logHistory({
      action: 'disposed',
      sampleId: s.id,
      sampleName: s.name,
      personId: p ? p.id : null,
      personName: p ? p.name : null,
      details: note || 'Sample disposed'
    });
    persist();
    return s;
  }

  function addNote(id, personId, note) {
    const s = data.samples.find(x => x.id === id);
    const p = data.people.find(x => x.id === personId);
    if (!s || !note) return null;
    logHistory({
      action: 'note',
      sampleId: s.id,
      sampleName: s.name,
      personId: p ? p.id : null,
      personName: p ? p.name : null,
      details: note
    });
    persist();
    return s;
  }

  function locationString(s) {
    const parts = [s.fridge, s.row, s.slot].filter(Boolean);
    return parts.length ? parts.join(' / ') : 'Unassigned';
  }

  // ---------- People ----------
  function addPerson(p) {
    const person = {
      id: uid('per'),
      name: p.name,
      role: p.role || '',
      badge: p.badge || '',
      createdAt: nowIso()
    };
    data.people.push(person);
    persist();
    return person;
  }
  function updatePerson(id, patch) {
    const p = data.people.find(x => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    persist();
    return p;
  }
  function deletePerson(id) {
    data.people = data.people.filter(x => x.id !== id);
    persist();
  }

  // ---------- Fridges / storage locations ----------
  function addFridge(name) {
    const f = { id: uid('fr'), name, rows: [] };
    data.fridges.push(f);
    persist();
    return f;
  }
  function deleteFridge(id) {
    data.fridges = data.fridges.filter(f => f.id !== id);
    persist();
  }

  // ---------- Derived / queries ----------
  function findByBarcode(code) {
    return data.samples.find(s => s.barcode.toLowerCase() === (code || '').toLowerCase());
  }
  function findPersonByBadge(code) {
    return data.people.find(p => p.badge && p.badge.toLowerCase() === (code || '').toLowerCase());
  }
  function getStats() {
    const total = data.samples.length;
    const out = data.samples.filter(s => s.status === 'out').length;
    const disposed = data.samples.filter(s => s.status === 'disposed').length;
    const inStorage = data.samples.filter(s => s.status === 'in').length;
    return { total, out, disposed, inStorage, people: data.people.length, historyCount: data.history.length };
  }

  function replaceAll(newData) {
    data = newData;
    const d = defaultData();
    for (const k in d) if (!(k in data)) data[k] = d[k];
    persist();
  }

  function get() { return data; }

  load();

  return {
    get, onChange, persist, uid, nowIso, locationString,
    getSettings, setSettings,
    addSample, updateSample, deleteSample, checkoutSample, checkinSample, moveSample, disposeSample, addNote,
    addPerson, updatePerson, deletePerson,
    addFridge, deleteFridge,
    findByBarcode, findPersonByBadge, getStats,
    logHistory, replaceAll, defaultData
  };
})();
