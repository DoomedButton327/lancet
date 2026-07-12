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
      const devices = await codeReader.listVideoInputDevices();
      // Prefer a rear/back camera on phones; otherwise fall back to the last listed device
      const rearCam = devices.find(d => /back|rear|environment/i.test(d.label));
      const deviceId = rearCam ? rearCam.deviceId : (devices.length ? devices[devices.length - 1].deviceId : undefined);
      
      // Get camera stream with autofocus capabilities
      const constraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: rearCam ? 'environment' : undefined
        }
      };

      // Try to get the stream with autofocus
      activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply autofocus if supported
      const videoTrack = activeStream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = videoTrack.getCapabilities();
          if (capabilities.focusMode) {
            const settings = {};
            if (capabilities.focusMode.includes('continuous')) {
              settings.focusMode = 'continuous';
            } else if (capabilities.focusMode.includes('auto')) {
              settings.focusMode = 'auto';
            }
            if (Object.keys(settings).length > 0) {
              await videoTrack.applyConstraints({ advanced: [settings] });
            }
          }
        } catch (focusErr) {
          console.warn('Autofocus not supported on this device:', focusErr);
        }
      }
      
      // Set the video element with autofocus stream
      videoEl.srcObject = activeStream;
      videoEl.setAttribute('autofocus', '');
      videoEl.setAttribute('playsinline', '');
      
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
      // Stop all camera tracks
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
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
