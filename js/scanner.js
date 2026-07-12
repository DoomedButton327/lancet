/* ============================================================
   SCANNER.JS
   Two scan input paths:
   1. Camera scanning via ZXing (@zxing/library, loaded via CDN)
   2. USB "keyboard wedge" barcode scanners — these type the code
      character-by-character very fast, then send Enter. We
      listen globally and detect that pattern so a scan works
      the instant the scanner fires, even without opening the
      scan modal, as long as no other text input is focused.
   ============================================================ */

const Scanner = (() => {
  let codeReader = null;
  let activeStream = null;
  let onResultCallback = null;

  // ---------- Camera scanning ----------
  async function startCamera(videoEl, onResult) {
    onResultCallback = onResult;
    if (!window.ZXing) {
      UI.toast('Camera scanning library failed to load — use manual entry.', 'error');
      return;
    }
    try {
      const ZXingLib = window.ZXing;
      codeReader = new ZXingLib.BrowserMultiFormatReader();
      const devices = await ZXingLib.BrowserCodeReader.listVideoInputDevices();
      const deviceId = devices.length ? devices[devices.length - 1].deviceId : undefined;
      codeReader.decodeFromVideoDevice(deviceId, videoEl, (result, err) => {
        if (result) {
          onResultCallback && onResultCallback(result.getText());
        }
      });
    } catch (e) {
      console.error('Camera init failed', e);
      const hint = document.getElementById('scannerHint');
      if (hint) hint.textContent = 'Camera unavailable — use a USB scanner or type the code manually below.';
    }
  }

  function stopCamera() {
    try {
      if (codeReader) {
        codeReader.reset();
        codeReader = null;
      }
    } catch (e) { /* noop */ }
  }

  // ---------- USB keyboard-wedge scanner ----------
  // Detects rapid sequential keystrokes terminated by Enter, which is
  // how virtually all USB/Bluetooth HID barcode scanners behave.
  let buffer = '';
  let lastKeyTime = 0;
  const MAX_INTERVAL_MS = 40; // scanners type far faster than humans

  function isTypingInField() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function initGlobalListener(onGlobalScan) {
    document.addEventListener('keydown', (e) => {
      const now = Date.now();
      const gap = now - lastKeyTime;
      lastKeyTime = now;

      // If the user is typing in a normal text field manually (slow typing),
      // don't hijack it — only intercept when NOT focused in an editable
      // field, OR when characters are arriving scanner-fast.
      const typingInField = isTypingInField();

      if (e.key === 'Enter') {
        if (buffer.length >= 4 && !typingInField) {
          onGlobalScan(buffer);
          e.preventDefault();
        }
        buffer = '';
        return;
      }

      if (e.key.length === 1) {
        if (typingInField && gap > MAX_INTERVAL_MS) {
          // Normal human typing in a field — don't buffer as a scan
          buffer = '';
          return;
        }
        if (gap > MAX_INTERVAL_MS && buffer.length > 0) {
          buffer = ''; // reset — too slow to be a scanner burst
        }
        buffer += e.key;
      }
    });
  }

  return { startCamera, stopCamera, initGlobalListener };
})();
