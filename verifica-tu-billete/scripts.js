const year = new Date().getFullYear();
document.getElementById('footerYear').textContent = year + ' - v0.7.6';

const RANGES = {
  50: [[67250001,67700000],[69050001,69500000],[69500001,69950000],[69950001,70400000],
       [70400001,70850000],[70850001,71300000],[76310012,85139995],[86400001,86850000],
       [90900001,91350000],[91800001,92250000]],
  20: [[87280145,91646549],[96650001,97100000],[99800001,100250000],[100250001,100700000],
       [109250001,109700000],[110600001,111050000],[111050001,111500000],[111950001,112400000],
       [112400001,112850000],[112850001,113300000],[114200001,114650000],[114650001,115100000],
       [115100001,115550000],[118700001,119150000],[119150001,119600000],[120500001,120950000]],
  10: [[77100001,77550000],[78000001,78450000],[78900001,96350000],[96350001,96800000],
       [96800001,97250000],[98150001,98600000],[104900001,105350000],[105350001,105800000],
       [106700001,107150000],[107600001,108050000],[108050001,108500000],[109400001,109850000]]
};

const DENOM_LABEL = { 50: 'Bs. 50', 20: 'Bs. 20', 10: 'Bs. 10' };
const DENOM_CLASS = { 50: 'badge-bs50', 20: 'badge-bs20', 10: 'badge-bs10' };
let deferredPrompt = null;
let cameraActive = false;
let ocrWorking = false;
let lastDetectedSerial = null;
let selectedDenom = null;

// ── Denomination selector ──
function selectDenom(denom, btn) {
  selectedDenom = denom;
  const cls = 'bs' + denom;

  // Update buttons
  document.querySelectorAll('.denom-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Update input accent
  const inputEl = document.getElementById('serialInput');
  inputEl.classList.remove('bs10', 'bs20', 'bs50');
  inputEl.classList.add(cls);

  // Update verify button
  const btnVerify = document.getElementById('btnVerify');
  btnVerify.classList.remove('bs10', 'bs20', 'bs50');
  btnVerify.classList.add(cls);

  // Update color bar
  const bar = document.getElementById('denomBar');
  bar.className = 'denom-bar ' + cls;

  // Show serial card + section with animation
  document.getElementById('serialCard').style.display = '';
  const section = document.getElementById('serialSection');
  section.classList.remove('visible');
  requestAnimationFrame(() => section.classList.add('visible'));

  inputEl.value = '';
  setTimeout(() => inputEl.focus(), 100);
}

function detectDenom(serialNum) {
  const serial = typeof serialNum === 'string' ? parseInt(serialNum, 10) : serialNum;
  if (selectedDenom) {
    for (const [from, to] of RANGES[selectedDenom]) {
      if (serial >= from && serial <= to) return selectedDenom;
    }
    return null;
  }
  for (const denom of [50, 20, 10]) {
    for (const [from, to] of RANGES[denom]) {
      if (serial >= from && serial <= to) return denom;
    }
  }
  return null;
}

// ── PWA Install ──
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('installBanner').classList.add('visible');
});
window.addEventListener('appinstalled', () => {
  document.getElementById('installBanner').classList.remove('visible');
  gtag('event', 'app_installed', {
    'event_category': 'engagement',
    'event_label': 'pwa_installation'
  });
  deferredPrompt = null;
});
async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') document.getElementById('installBanner').classList.remove('visible');
  deferredPrompt = null;
}
function dismissInstall() { document.getElementById('installBanner').classList.remove('visible'); }

// ── Theme ──
let isLight = false;
function toggleTheme() {
  isLight = !isLight;
  document.body.classList.toggle('light', isLight);
  document.getElementById('themeToggle').textContent = isLight ? '🌙' : '☀️';
}

// ── Input ──
const inputEl = document.getElementById('serialInput');
inputEl.addEventListener('input', function() { this.value = this.value.replace(/\D/g, ''); });
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); verificar(); } });

// ── Verify ──
function verificar() {
  const raw = inputEl.value.replace(/\D/g, '').trim();
  if (!raw) { flashError(); return; }
  const serialNum = parseInt(raw, 10);
  if (isNaN(serialNum) || serialNum <= 0) { flashError(); return; }
  const matchedDenom = detectDenom(serialNum);
  // Registrar evento en GA4
  gtag('event', 'verificacion', {
    'event_category': 'billete',
    'event_label': 'verificacion_manual',
    'metodo': 'manual'
  });
  showAlert(matchedDenom !== null ? 'invalid' : 'valid', raw, matchedDenom);
}

function flashError() {
  inputEl.classList.add('error');
  setTimeout(() => inputEl.classList.remove('error'), 1200);
}

// ── Camera (sin modificar) ──
async function openCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const videoEl = document.getElementById('cameraPreview');
    videoEl.srcObject = stream;
    document.getElementById('cameraOverlay').classList.add('show');
    cameraActive = true;
    const startWhenReady = async () => {
      try { await videoEl.play(); } catch (_) {}
      startOCR();
    };
    videoEl.onloadedmetadata = startWhenReady;
    if (videoEl.readyState >= 1) { startWhenReady(); }
  } catch (err) {
    console.error('Camera error', err);
    alert('No se puede acceder a la cámara.');
  }
}

function closeCamera() {
  const videoEl = document.getElementById('cameraPreview');
  const stream = videoEl.srcObject;
  if (stream) { stream.getTracks().forEach(t => t.stop()); }
  videoEl.srcObject = null;
  document.getElementById('cameraOverlay').classList.remove('show');
  cameraActive = false;
  lastDetectedSerial = null;
  inputEl.blur(); // Ocultar teclado numérico
}

async function startOCR() {
  if (!cameraActive || ocrWorking) return;
  const videoEl = document.getElementById('cameraPreview');
  if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
    document.getElementById('ocrStatus').textContent = 'Inicializando cámara...';
    setTimeout(startOCR, 500);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth * 0.5;
  canvas.height = videoEl.videoHeight * 0.5;
  const ctx = canvas.getContext('2d');
  let consecutiveMatches = 0;
  const processFrame = async () => {
    if (!cameraActive) return;
    ocrWorking = true;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    try {
      const result = await Tesseract.recognize(canvas, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            document.getElementById('ocrStatus').textContent = `OCR: ${progress}%`;
          }
        }
      });
      const text = result.data.text.toUpperCase();
      const clean = text.replace(/[^0-9A-Z ]/g, ' ').trim();
      const serialMatch = extractSerialNumber(clean);
      if (serialMatch) {
        const { serialStr } = serialMatch;
        if (lastDetectedSerial !== serialStr) {
          lastDetectedSerial = serialStr; consecutiveMatches = 1;
        } else { consecutiveMatches++; }
        if (consecutiveMatches >= 2) {
          inputEl.value = serialStr;
          document.getElementById('ocrStatus').textContent = `✓ ${serialStr}${serialMatch.series ? ' ' + serialMatch.series : ''} - Verificando...`;
          // Registrar evento en GA4
          gtag('event', 'verificacion', {
            'event_category': 'billete',
            'event_label': 'verificacion_camara',
            'metodo': 'camara_ocr'
          });
          await new Promise(r => setTimeout(r, 800));
          closeCamera();
          verificar();
        } else {
          document.getElementById('ocrStatus').textContent = `Confirmando: ${serialStr}${serialMatch.series ? ' ' + serialMatch.series : ''}...`;
        }
      } else {
        consecutiveMatches = 0; lastDetectedSerial = null;
        document.getElementById('ocrStatus').textContent = 'Enfoque el número de serie...';
      }
    } catch (err) {
      console.error('OCR error:', err);
      document.getElementById('ocrStatus').textContent = 'Error en OCR';
    }
    ocrWorking = false;
    if (cameraActive) { setTimeout(processFrame, 300); }
  };
  processFrame();
}

function extractSerialNumber(text) {
  const pattern = /(\d{7,9})(?: +([A-Z]))?/;
  const match = text.match(pattern);
  if (match) {
    const serialStr = match[1];
    const series = match[2] || null;
    return { serialStr, series };
  }
  return null;
}

// ── Alert ──
function showAlert(type, serial, denom) {
  inputEl.blur(); // Ocultar teclado numérico
  const serEl = document.getElementById('alertSerial');
  serEl.style.display = '';
  serEl.textContent = 'Serie: ' + serial;
  _resetBadgeStyles();

  if (type === 'invalid') {
    document.getElementById('alertIcon').textContent  = '✗';
    document.getElementById('alertIcon').className    = 'alert-icon pulse-wrap invalid';
    document.getElementById('alertDenom').textContent = '⚠ ' + DENOM_LABEL[denom] + ' — Billete observado';
    document.getElementById('alertDenom').className   = 'alert-denom-badge ' + DENOM_CLASS[denom];
    document.getElementById('alertTitle').textContent = 'No lo reciba';
    document.getElementById('alertTitle').className   = 'alert-title invalid';
    document.getElementById('alertSub').textContent   = 'Este número de serie pertenece a los rangos de la Serie B declarados sin valor legal por el Banco Central de Bolivia.';
    document.getElementById('alertBtn').className     = 'btn-close-alert invalid';
  } else {
    document.getElementById('alertIcon').textContent  = '✓';
    document.getElementById('alertIcon').className    = 'alert-icon pulse-wrap valid';
    document.getElementById('alertDenom').textContent = '✔ Fuera de rangos observados';
    document.getElementById('alertDenom').className   = 'alert-denom-badge';
    document.getElementById('alertDenom').style.background = 'rgba(0,230,118,.12)';
    document.getElementById('alertDenom').style.color      = 'var(--valid)';
    document.getElementById('alertDenom').style.border     = '1px solid rgba(0,230,118,.3)';
    document.getElementById('alertTitle').textContent = 'Billete Válido';
    document.getElementById('alertTitle').className   = 'alert-title valid';
    document.getElementById('alertSub').innerHTML     = 'Este número <strong>no está en los rangos observados</strong><br><br>Si tiene dudas, verifique que el número esté escrito correctamente.';
    document.getElementById('alertBtn').className     = 'btn-close-alert valid';
  }
  document.getElementById('alertOverlay').classList.add('show');
}

function _resetBadgeStyles() {
  const b = document.getElementById('alertDenom');
  b.style.background = ''; b.style.color = ''; b.style.border = '';
}

function closeAlert() {
  inputEl.blur(); // Asegurar que el teclado se oculta
  document.getElementById('alertOverlay').classList.remove('show');
  _resetBadgeStyles();
}

function resetAll() {
  inputEl.value = '';
  inputEl.classList.remove('bs10', 'bs20', 'bs50');
  document.getElementById('btnVerify').classList.remove('bs10', 'bs20', 'bs50');
  document.querySelectorAll('.denom-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('serialSection').classList.remove('visible');
  document.getElementById('serialCard').style.display = 'none';
  selectedDenom = null;
  closeAlert();
}

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW error:', err));
}
