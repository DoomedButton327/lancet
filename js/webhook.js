/* ============================================================
   WEBHOOK.JS
   Sends a Discord notification for every logged action
   (created, checkout, checkin, moved, disposed, note, edited).

   >>> PUT YOUR DISCORD WEBHOOK URL ON THE LINE BELOW <<<
   There is intentionally NO settings UI for this — it's meant
   to stay hidden from anyone using the site. Paste your webhook
   URL into DISCORD_WEBHOOK_URL and it starts firing immediately.

   How to get a webhook URL: In Discord, go to the target channel
   → Edit Channel → Integrations → Webhooks → New Webhook → Copy
   Webhook URL.
   ============================================================ */

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1525856311185637396/qsAv0uvOfy0pagGwWV9ClRnnXlfg02kVoVBcFuuwa98xnx93oTHQHEN7RF8yzwlQLiQy"; // <-- PASTE YOUR DISCORD WEBHOOK URL HERE

const Webhook = (() => {

  const ACTION_META = {
    created:  { emoji: '🧪', color: 0x62c3f5, label: 'Sample created' },
    checkout: { emoji: '📤', color: 0xf5b942, label: 'Checked out' },
    checkin:  { emoji: '📥', color: 0x52e6a0, label: 'Checked in' },
    moved:    { emoji: '📦', color: 0x33a8e0, label: 'Moved' },
    edited:   { emoji: '✏️', color: 0x9fb4cc, label: 'Edited' },
    disposed: { emoji: '🗑️', color: 0xff5c6c, label: 'Disposed' },
    note:     { emoji: '📝', color: 0x5be3d8, label: 'Note added' }
  };

  async function notify({ action, sampleName, personName, details }) {
    if (!DISCORD_WEBHOOK_URL) return; // silently no-op until a URL is set
    const meta = ACTION_META[action] || { emoji: 'ℹ️', color: 0x9fb4cc, label: action };

    const embed = {
      title: `${meta.emoji} ${meta.label}`,
      color: meta.color,
      fields: [],
      timestamp: new Date().toISOString(),
      footer: { text: 'LabTrack' }
    };
    if (sampleName) embed.fields.push({ name: 'Sample', value: String(sampleName), inline: true });
    if (personName) embed.fields.push({ name: 'Person', value: String(personName), inline: true });
    if (details) embed.fields.push({ name: 'Details', value: String(details).slice(0, 1000) });

    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      });
    } catch (e) {
      // Fail silently — a blocked/misconfigured webhook should never break the app
      console.warn('Discord webhook failed', e);
    }
  }

  return { notify };
})();
