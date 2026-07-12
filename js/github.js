/* ============================================================
   GITHUB.JS
   Syncs Store's data object to a JSON file in a GitHub repo via
   the Contents API, using a fine-grained Personal Access Token.
   The PAT is stored in localStorage only (never in code, never
   committed) and only ever sent directly to api.github.com.
   ============================================================ */

const GitHubSync = (() => {
  let syncTimer = null;
  let syncing = false;

  function config() {
    const s = Store.getSettings();
    return {
      token: s.ghToken || '',
      repo: s.ghRepo || '',
      branch: s.ghBranch || 'main',
      path: s.ghPath || 'labtrack-data.json'
    };
  }

  function isConnected() {
    const c = config();
    return !!(c.token && c.repo);
  }

  function setStatus(state, label) {
    const dot = document.getElementById('syncDot');
    const lbl = document.getElementById('syncLabel');
    if (!dot || !lbl) return;
    dot.className = 'sync-dot' + (state ? ' ' + state : '');
    lbl.textContent = label;
  }

  function apiUrl() {
    const c = config();
    return `https://api.github.com/repos/${c.repo}/contents/${encodeURIComponent(c.path)}`;
  }

  async function pull() {
    const c = config();
    if (!c.token || !c.repo) throw new Error('Not configured');
    setStatus('syncing', 'Pulling...');
    const res = await fetch(`${apiUrl()}?ref=${encodeURIComponent(c.branch)}`, {
      headers: {
        Authorization: `Bearer ${c.token}`,
        Accept: 'application/vnd.github+json'
      }
    });
    if (res.status === 404) {
      // File doesn't exist yet — that's fine, we'll create it on first push
      setStatus('connected', 'Connected (new file)');
      return null;
    }
    if (!res.ok) {
      setStatus('error', 'Pull failed');
      throw new Error(`GitHub pull failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    const content = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
    const parsed = JSON.parse(content);
    Store.setSettings({ ghSha: json.sha });
    setStatus('connected', 'Connected');
    return parsed;
  }

  async function push() {
    const c = config();
    if (!c.token || !c.repo) throw new Error('Not configured');
    if (syncing) return;
    syncing = true;
    setStatus('syncing', 'Syncing...');
    try {
      const s = Store.getSettings();
      const body = {
        message: `LabTrack sync — ${new Date().toISOString()}`,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(Store.get(), null, 2)))),
        branch: c.branch
      };
      if (s.ghSha) body.sha = s.ghSha;

      const res = await fetch(apiUrl(), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${c.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        // 409/422 sha mismatch — try to re-pull sha and retry once
        if (res.status === 409 || res.status === 422) {
          const fresh = await fetch(`${apiUrl()}?ref=${encodeURIComponent(c.branch)}`, {
            headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json' }
          });
          if (fresh.ok) {
            const fj = await fresh.json();
            Store.setSettings({ ghSha: fj.sha });
            body.sha = fj.sha;
            const retry = await fetch(apiUrl(), {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${c.token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(body)
            });
            if (retry.ok) {
              const rj = await retry.json();
              Store.setSettings({ ghSha: rj.content.sha });
              setStatus('connected', 'Synced');
              syncing = false;
              return;
            }
          }
        }
        setStatus('error', 'Sync failed');
        throw new Error(`GitHub push failed: ${res.status} ${errText}`);
      }
      const rj = await res.json();
      Store.setSettings({ ghSha: rj.content.sha });
      setStatus('connected', 'Synced');
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    if (!isConnected()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      push().catch(err => console.error(err));
    }, 2500);
  }

  async function connectAndPull({ token, repo, branch, path }) {
    Store.setSettings({ ghToken: token, ghRepo: repo, ghBranch: branch || 'main', ghPath: path || 'labtrack-data.json', ghSha: null });
    const remote = await pull();
    if (remote) {
      Store.replaceAll(remote);
    } else {
      // no remote file yet — push current local data to create it
      await push();
    }
    return remote;
  }

  function disconnect() {
    Store.setSettings({ ghToken: '', ghRepo: '', ghSha: null });
    setStatus('', 'Local only');
  }

  function initStatusOnLoad() {
    if (isConnected()) setStatus('connected', 'Connected');
    else setStatus('', 'Local only');
  }

  return { isConnected, pull, push, scheduleSync, connectAndPull, disconnect, config, initStatusOnLoad };
})();
