/* ============================================================
   SCANNER.JS
   Two scan input paths:
   1. Camera scanning via ZXing (@zxing/library, loaded via CDN)
   2. USB "keyboard wedge" barcode scanners — these type the code
      character-by-character very fast, then send Enter. We
      listen globally and detect that pattern so a scan works
      the instant the scanner fires, even without opening the
      scan modal, as long as no other text input is focused.

   Added:
   - Continuous autofocus (if supported)
   - Highest supported camera resolution
   - Automatic zoom (if supported)
   - Proper stream cleanup
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

      // Prefer rear camera on phones
      const rearCam = devices.find(d =>
        /back|rear|environment/i.test(d.label)
      );

      const deviceId = rearCam
        ? rearCam.deviceId
        : (devices.length
            ? devices[devices.length - 1].deviceId
            : undefined);

      codeReader.decodeFromVideoDevice(
        deviceId,
        videoEl,
        async (result, err) => {

          // Apply autofocus/settings once
          if (!activeStream && videoEl.srcObject) {
            activeStream = videoEl.srcObject;

            try {
              const track = activeStream.getVideoTracks()[0];

              if (track) {
                const capabilities = track.getCapabilities();
                const constraints = {};

                // Highest supported resolution
                if (capabilities.width && capabilities.height) {
                  constraints.width = capabilities.width.max;
                  constraints.height = capabilities.height.max;
                }

                // Continuous autofocus
                if (
                  capabilities.focusMode &&
                  capabilities.focusMode.includes("continuous")
                ) {
                  constraints.advanced = [
                    { focusMode: "continuous" }
                  ];
                }

                // Max zoom (helps barcode scanning)
                if (capabilities.zoom) {
                  constraints.advanced = [
                    ...(constraints.advanced || []),
                    { zoom: capabilities.zoom.max }
                  ];
                }

                // Enable torch if available (optional)
                if (capabilities.torch) {
                  constraints.advanced = [
                    ...(constraints.advanced || []),
                    { torch: true }
                  ];
                }

                if (Object.keys(constraints).length) {
                  await track.applyConstraints(constraints);
                  console.log("Camera constraints applied:", constraints);
                }

                console.log("Camera capabilities:", capabilities);
              }
            } catch (e) {
              console.log("Camera doesn't support autofocus/zoom:", e);
            }
          }

          if (result) {
            onResultCallback && onResultCallback(result.getText());
          }
        }
      );

    } catch (e) {
      console.error("Camera init failed", e);

      const hint = document.getElementById("scannerHint");
      if (hint) {
        hint.textContent =
          "Camera unavailable — use a USB scanner or type the code manually below.";
      }
    }
  }

  function stopCamera() {
    try {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }

      if (codeReader) {
        codeReader.reset();
        codeReader = null;
      }
    } catch (e) {
      // noop
    }
  }

  // ---------- USB keyboard-wedge scanner ----------
  let buffer = '';
  let lastKeyTime = 0;
  const MAX_INTERVAL_MS = 40;

  function isTypingInField() {
    const el = document.activeElement;
    if (!el) return false;

    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      el.isContentEditable
    );
  }

  function initGlobalListener(onGlobalScan) {
    document.addEventListener('keydown', (e) => {
      const now = Date.now();
      const gap = now - lastKeyTime;
      lastKeyTime = now;

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
          buffer = '';
          return;
        }

        if (gap > MAX_INTERVAL_MS && buffer.length > 0) {
          buffer = '';
        }

        buffer += e.key;
      }
    });
  }

  return {
    startCamera,
    stopCamera,
    initGlobalListener
  };
})();
