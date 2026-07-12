/* ============================================================
   BARCODE.JS
   Generates barcode SVGs using JsBarcode (loaded via CDN in
   index.html). Also handles printing the label sheet.
   ============================================================ */

const Barcode = (() => {

  function renderTo(svgEl, code, format = 'CODE128') {
    try {
      JsBarcode(svgEl, code, {
        format,
        width: 2,
        height: 46,
        displayValue: true,
        font: 'JetBrains Mono',
        fontSize: 13,
        margin: 8,
        background: '#ffffff',
        lineColor: '#0a1120'
      });
      return true;
    } catch (e) {
      console.error('Barcode render failed', e);
      return false;
    }
  }

  function makeSvgString(code, format = 'CODE128') {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    renderTo(svg, code, format);
    return svg.outerHTML;
  }

  function generateCode(prefix = 'LAB') {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const ts = Date.now().toString(36).toUpperCase().slice(-5);
    return `${prefix}-${ts}-${rand}`;
  }

  function printSheet() {
    const sheet = document.getElementById('labelSheet');
    if (!sheet || !sheet.innerHTML.trim()) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>LabTrack Labels</title>
      <style>
        body { font-family: sans-serif; margin: 20px; }
        .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .label { border: 1px dashed #999; border-radius: 8px; padding: 10px; text-align: center; page-break-inside: avoid; }
        .label svg { max-width: 100%; }
        .cap { font-family: monospace; font-size: 11px; margin-top: 4px; color: #333; }
      </style></head><body>
      <div class="sheet">${sheet.innerHTML}</div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  return { renderTo, makeSvgString, generateCode, printSheet };
})();
