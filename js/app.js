/* ============================================================
   APP.JS
   Boot sequence + global event wiring.
   ============================================================ */

(function () {

  // ---------- Ambient frost particles (canvas) ----------
  function initParticles() {
    const canvas = document.getElementById('particleCanvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let w, h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const COUNT = window.innerWidth < 700 ? 26 : 55;
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.4,
        vy: Math.random() * 0.18 + 0.04,
        vx: (Math.random() - 0.5) * 0.06,
        alpha: Math.random() * 0.35 + 0.08
      });
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#9fdcff';
      particles.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(tick);
    }
  }

  // ---------- Wiring ----------
  function wireTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => UI.switchTab(btn.dataset.tab));
    });
  }

  function wireModalCloses() {
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => UI.closeModal(btn.dataset.closeModal));
    });
    document.getElementById('modalBackdrop').addEventListener('click', UI.closeAllModals);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { UI.closeAllModals(); Admin.closeOverlay(); }
    });
  }

  function wireSamples() {
    document.getElementById('quickAddBtn').addEventListener('click', () => UI.openSampleModal(null));
    document.getElementById('addSampleBtn2').addEventListener('click', () => UI.openSampleModal(null));
    document.getElementById('saveSampleBtn').addEventListener('click', UI.saveSampleFromForm);

    document.getElementById('sampleSearch').addEventListener('input', UI.renderSamples);
    document.getElementById('statusFilter').addEventListener('change', UI.renderSamples);
    document.getElementById('rowFilter').addEventListener('change', UI.renderSamples);

    document.getElementById('genBarcodeField').addEventListener('click', () => {
      document.getElementById('sampleBarcode').value = Barcode.generateCode('LAB');
    });
  }

  function wirePeople() {
    document.getElementById('addPersonBtn').addEventListener('click', () => UI.openPersonModal(null));
    document.getElementById('savePersonBtn').addEventListener('click', UI.savePersonFromForm);
  }

  function wireStorage() {
    document.getElementById('manageStorageBtn').addEventListener('click', () => {
      UI.renderStorageManage();
      UI.openModal('storageModal');
    });
    document.getElementById('addFridgeBtn').addEventListener('click', () => {
      const input = document.getElementById('newFridgeName');
      const name = input.value.trim();
      if (!name) return;
      Store.addFridge(name);
      input.value = '';
      UI.renderStorageManage();
      UI.renderAll();
      UI.toast('Fridge added', 'success');
    });
  }

  function wireHistory() {
    document.getElementById('historySearch').addEventListener('input', UI.renderHistory);
    document.getElementById('historyActionFilter').addEventListener('change', UI.renderHistory);
    document.getElementById('historyDateFilter').addEventListener('change', UI.renderHistory);
    document.getElementById('exportHistoryBtn').addEventListener('click', UI.exportHistoryCsv);
  }

  function wireGenerate() {
    document.getElementById('genSourceType').addEventListener('change', (e) => {
      const isExisting = e.target.value === 'existing';
      document.getElementById('genExistingRow').style.display = isExisting ? 'flex' : 'none';
      document.getElementById('genPrefixRow').style.display = isExisting ? 'none' : 'flex';
    });
    document.getElementById('genBuildBtn').addEventListener('click', UI.buildLabelSheet);
    document.getElementById('genPrintBtn').addEventListener('click', Barcode.printSheet);
  }

  function wireScanner() {
    function openScanner(onFound) {
      UI.openModal('scannerModal');
      const video = document.getElementById('scannerVideo');
      Scanner.startCamera(video, (text) => {
        UI.closeModal('scannerModal');
        onFound(text);
      });
    }

    document.getElementById('scanBtn').addEventListener('click', () => {
      openScanner((code) => handleScanResult(code));
    });

    document.getElementById('scanIntoField').addEventListener('click', () => {
      openScanner((code) => { document.getElementById('sampleBarcode').value = code; });
    });

    document.getElementById('manualScanInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        const code = e.target.value.trim();
        e.target.value = '';
        UI.closeModal('scannerModal');
        handleScanResult(code);
      }
    });

    // Global USB scanner listener — works from anywhere except inside text fields
    Scanner.initGlobalListener((code) => {
      // If the sample-barcode field exists and modal is open, prefer filling it
      const barcodeField = document.getElementById('sampleBarcode');
      const sampleModalOpen = document.getElementById('sampleModal').classList.contains('show');
      if (sampleModalOpen) {
        barcodeField.value = code;
        return;
      }
      handleScanResult(code);
    });
  }

  function handleScanResult(code) {
    const sample = Store.findByBarcode(code);
    if (sample) {
      UI.openSampleDetail(sample.id);
    } else {
      UI.toast(`No sample found for barcode "${code}" — create it?`, 'info');
      UI.openSampleModal(null);
      document.getElementById('sampleBarcode').value = code;
    }
  }

  function wireSettings() {
    document.getElementById('settingsBtn').addEventListener('click', () => {
      const s = Store.getSettings();
      document.getElementById('ghToken').value = s.ghToken || '';
      document.getElementById('ghRepo').value = s.ghRepo || '';
      document.getElementById('ghBranch').value = s.ghBranch || 'main';
      document.getElementById('ghPath').value = s.ghPath || 'labtrack-data.json';
      updateGhStatusNote();
      UI.openModal('settingsModal');
    });

    function updateGhStatusNote() {
      const note = document.getElementById('ghStatusNote');
      if (GitHubSync.isConnected()) {
        note.textContent = 'Connected — changes sync automatically a couple seconds after each edit.';
        note.className = 'settings-note ok';
      } else {
        note.textContent = 'Not connected — data is saved to this browser only.';
        note.className = 'settings-note';
      }
    }

    document.getElementById('ghConnectBtn').addEventListener('click', async () => {
      const token = document.getElementById('ghToken').value.trim();
      const repo = document.getElementById('ghRepo').value.trim();
      const branch = document.getElementById('ghBranch').value.trim() || 'main';
      const path = document.getElementById('ghPath').value.trim() || 'labtrack-data.json';
      if (!token || !repo) { UI.toast('Token and repo are required', 'error'); return; }
      try {
        await GitHubSync.connectAndPull({ token, repo, branch, path });
        UI.toast('Connected to GitHub', 'success');
        UI.renderAll();
        updateGhStatusNote();
      } catch (e) {
        console.error(e);
        UI.toast('Connection failed — check token/repo', 'error');
        updateGhStatusNote();
      }
    });

    document.getElementById('ghPushBtn').addEventListener('click', async () => {
      try {
        await GitHubSync.push();
        UI.toast('Pushed to GitHub', 'success');
      } catch (e) {
        console.error(e);
        UI.toast('Push failed', 'error');
      }
    });

    document.getElementById('ghDisconnectBtn').addEventListener('click', () => {
      GitHubSync.disconnect();
      UI.toast('Disconnected from GitHub', 'info');
      updateGhStatusNote();
    });

    document.getElementById('exportLocalBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(Store.get(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `labtrack-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('importLocalBtn').addEventListener('click', () => {
      document.getElementById('importLocalInput').click();
    });
    document.getElementById('importLocalInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          Store.replaceAll(parsed);
          UI.renderAll();
          UI.toast('Backup imported', 'success');
        } catch (err) {
          UI.toast('Invalid backup file', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  function seedDemoDataIfEmpty() {
    const data = Store.get();
    if (data.samples.length || data.people.length || data.fridges.length) return;
    // Only seed on a totally fresh install so the UI isn't empty on first load
    Store.addFridge('Fridge 1');
    Store.addFridge('Fridge 2');
    const p1 = Store.addPerson({ name: 'Dr. Naledi Khumalo', role: 'Lab Supervisor', badge: '' });
    Store.addPerson({ name: 'Sipho Radebe', role: 'Lab Technician', badge: '' });
    Store.addSample({ name: 'Serum Batch 14 — Cohort A', type: 'Serum', fridge: 'Fridge 1', row: 'Row 1', slot: 'Slot 3', status: 'in', notes: 'Handle with gloves.' });
    Store.addSample({ name: 'Tissue Sample 22-B', type: 'Tissue', fridge: 'Fridge 1', row: 'Row 2', slot: 'Slot 1', status: 'in' });
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    wireTabs();
    wireModalCloses();
    wireSamples();
    wirePeople();
    wireStorage();
    wireHistory();
    wireGenerate();
    wireScanner();
    wireSettings();
    Admin.init();

    GitHubSync.initStatusOnLoad();
    seedDemoDataIfEmpty();
    UI.renderAll();

    // If GitHub is already configured from a previous session, pull latest on load
    if (GitHubSync.isConnected()) {
      GitHubSync.pull().then(remote => {
        if (remote) { Store.replaceAll(remote); UI.renderAll(); }
      }).catch(e => console.warn('Initial pull failed', e));
    }
  });

})();
