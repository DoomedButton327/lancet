# LabTrack

A sample chain-of-custody tracker for a lab — who has what, where it lives (fridge / row / slot), barcode generation + scanning, and a full timestamped history of every action. Built as a static site so it runs directly on GitHub Pages.

## Features

- **Dashboard** — live counts, everything currently checked out, recent activity feed
- **Samples** — searchable/filterable table, full detail view per sample
- **Storage Map** — visual layout of fridges → rows → slots
- **People** — everyone authorized to handle samples, with per-person activity stats
- **History** — full chain-of-custody timeline, filterable, exportable to CSV
- **Generate Labels** — create and print barcode label sheets (CODE128 / CODE39 / EAN13)
- **Scanning** — works with a webcam/phone camera *and* any USB/Bluetooth barcode scanner (which just types into the page)
- **GitHub sync** — optional; if configured, every change pushes to a JSON file in a repo you choose, so the data isn't stuck in one browser
- **Hidden admin console** — see below
- **Discord webhook** — see below

## Getting it live on GitHub Pages

1. Create a new GitHub repo (public or private).
2. Upload everything in this folder (`index.html`, `css/`, `js/`) to the repo root.
3. Repo → Settings → Pages → Source: deploy from branch → `main` → `/ (root)`.
4. Wait a minute, then visit the URL GitHub gives you.

That's it — no build step, no dependencies to install.

## Setting up GitHub sync (optional but recommended)

Since GitHub Pages only serves static files, LabTrack keeps its data in your browser by default (localStorage). If you want the data to persist across devices/browsers, or survive clearing browser data, connect it to a GitHub repo:

1. In GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.**
2. Give it access to **only** the repo you want to store data in.
3. Under **Repository permissions**, set **Contents: Read and write**.
4. Copy the token (starts with `github_pat_...`).
5. In LabTrack, click the **gear icon (Settings)** top-right → paste the token, the repo as `owner/repo` (can be the same repo the site is hosted in, or a separate private one — a private data repo is recommended), branch (`main`), and file path (defaults to `labtrack-data.json`).
6. Click **Connect & Pull**.

From then on, every change auto-syncs a couple seconds after you make it. The token is stored only in your browser's localStorage — it is never written into any file in the repo.

**Recommendation:** use a **separate private repo** just for data storage, different from the repo hosting the public site, so your data file isn't publicly readable.

## Barcode scanning

- **Camera:** click **Scan** top-right, allow camera access, point a barcode at it.
- **USB/Bluetooth scanner:** just scan — these devices act like a keyboard typing very fast followed by Enter. LabTrack listens for that pattern globally, so you can scan a sample straight from the Dashboard or Samples table without opening anything first. If a sample matches, it opens; if not, it offers to create one with that code pre-filled.

## The hidden admin console

There is **no visible menu item, button, or link** anywhere in the UI for this — that's intentional.

**To open it:** click anywhere on the page (so you're not focused in a text field) and type:

```
admin
```

five letters, at a normal typing pace. It pops up a lock screen.

**Default passphrase:** `changeme123`

**Change this before you publish the site** — open `js/admin.js` and edit:

```js
const ADMIN_PASSPHRASE_DEFAULT = "changeme123";
const SECRET_SEQUENCE = "admin";
```

You can also change the passphrase later from inside the console itself (Danger Zone tab → Change Passphrase) without touching code — it's stored (hashed) in your browser.

You can also change `SECRET_SEQUENCE` to any word/sequence you like if you don't want it to be the literal word "admin".

Inside the console:
- **Overview** — system-wide stats
- **Rewrite History** — edit or delete any individual history/log entry
- **Danger Zone** — wipe all samples, wipe all history, full factory reset, change passphrase
- **Raw Data** — view/edit the entire underlying JSON store directly

Every action taken in the admin console is itself logged to history, attributed to `ROOT`, so there's still a record that something was changed.

## The hidden Discord webhook

Every logged action (sample created, checked out, checked in, moved, edited, disposed, note added) can post to a Discord channel automatically. There is **no settings UI for this on purpose** — it's meant to stay invisible to anyone using the site.

**To enable it:** open `js/webhook.js` and paste your webhook URL here:

```js
const DISCORD_WEBHOOK_URL = ""; // <-- PASTE YOUR DISCORD WEBHOOK URL HERE
```

**To get a webhook URL:** in Discord, go to the channel you want notifications in → **Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL.**

Until you paste a URL in, this module silently does nothing — it won't error or show anything in the UI.

## File structure

```
labtrack/
├── index.html              All views, modals, and the hidden admin panel markup
├── css/
│   ├── theme.css            Color/type tokens, glass surface variables
│   ├── layout.css           Page structure, header, tabs, grids
│   ├── components.css       Buttons, cards, tables, modals, timeline
│   ├── animations.css       Keyframes and motion
│   └── admin.css            Hidden admin console styling
├── js/
│   ├── store.js              Central data model (samples, people, fridges, history)
│   ├── github.js             GitHub Contents API sync
│   ├── webhook.js            Hidden Discord webhook — put your URL here
│   ├── barcode.js            Barcode generation (JsBarcode) + print
│   ├── scanner.js            Camera scanning (ZXing) + USB scanner detection
│   ├── ui.js                 Rendering for all normal views
│   ├── admin.js              Hidden admin console logic
│   └── app.js                Boot sequence, event wiring
└── README.md
```

## Notes

- Everything runs client-side; there's no backend/server component.
- The admin passphrase lock is a convenience gate, not bank-grade security — anyone with access to your browser's localStorage or the page source could bypass it if they tried hard enough. Don't store anything you wouldn't want an determined user of the same machine to see.
- If you connect a GitHub PAT, remember it's stored in that browser's localStorage. Don't paste it into a shared/public computer's browser.
