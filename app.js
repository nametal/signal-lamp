// ===== Signal Lamp App =====

const overlay    = document.getElementById('lamp-overlay');
const lampBody   = document.getElementById('lamp-body');
const lampLens   = document.getElementById('lamp-lens');
const lampGlow   = document.getElementById('lamp-glow');
const lampFila   = document.getElementById('lamp-filament');
const statusDot  = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const btnToggle  = document.getElementById('btn-toggle');
const toggleLabel= document.getElementById('toggle-label');
const btnFull    = document.getElementById('btn-fullscreen');
const btnMute    = document.getElementById('btn-mute');
const iconSoundOn  = document.getElementById('icon-sound-on');
const iconSoundOff = document.getElementById('icon-sound-off');
const speedSlider= document.getElementById('speed-slider');
const speedValue = document.getElementById('speed-value');
const modeBtns   = document.querySelectorAll('.mode-btn');

// ===== State =====
let active = false;
let mode   = 'blink';    // 'blink' | 'sos' | 'steady'
let bpm    = 60;
let intervalId = null;
let wakeLock   = null;
let lampIsOn   = false;

// ===== Audio =====
let audioCtx   = null;
let soundMuted = false;

// SOS pattern: · · · — — — · · · (short short short long long long short short short)
const SOS_PATTERN = [200,200,200,200,200,200,600,200,600,200,600,200,200,200,200,200,200,600];

// ===== Computed timing =====
function halfPeriod() {
  // bpm = blinks per minute, each blink = on + off
  return Math.round((60 / bpm) * 1000 / 2);
}

// ===== Sound synthesis =====
function playClick(phase) {
  if (!audioCtx || soundMuted) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime;
  const dur = 0.045;

  // Noise burst (click texture)
  const bufSize = audioCtx.sampleRate * dur | 0;
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(phase === 'off' ? 0.55 : 0.75, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start(now);
  noise.stop(now + dur);

  // Low thump (mechanical resonance)
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(phase === 'off' ? 110 : 130, now);
  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(phase === 'off' ? 0.45 : 0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

// ===== Lamp on/off =====
function setLamp(on) {
  lampIsOn = on;
  overlay.classList.toggle('flash-on', on);
  lampBody.classList.toggle('lamp-on', on);
  lampLens.classList.toggle('lamp-on', on);
  lampGlow.classList.toggle('lamp-on', on);
  lampFila.classList.toggle('lamp-on', on);
  if (active && mode !== 'steady') playClick(on ? 'on' : 'off');
}

// ===== Status UI =====
function setStatus(text, isActive) {
  statusText.textContent = text;
  statusText.classList.toggle('active', isActive);
  statusDot.classList.toggle('active', isActive);
}

// ===== Blink engine =====
function startBlink() {
  if (mode === 'steady') {
    setLamp(true);
    setStatus('STEADY', true);
    return;
  }

  if (mode === 'sos') {
    startSOS();
    return;
  }

  // Standard blink
  let lampOn = false;
  setLamp(true);
  lampOn = true;

  intervalId = setInterval(() => {
    lampOn = !lampOn;
    setLamp(lampOn);
  }, halfPeriod());

  setStatus('BLINKING', true);
}

function stopBlink() {
  clearInterval(intervalId);
  intervalId = null;
  stopSOS();
  setLamp(false);
  setStatus('OFF', false);
}

// ===== SOS engine =====
let sosIndex = 0;
let sosTimeout = null;

function startSOS() {
  sosIndex = 0;
  setStatus('SOS ···---···', true);
  runSOS();
}

function runSOS() {
  if (!active) return;

  const i = sosIndex % SOS_PATTERN.length;
  const on = (sosIndex % 2 === 0);
  setLamp(on);
  sosTimeout = setTimeout(() => {
    sosIndex++;
    // Small pause between full SOS repeats
    if (sosIndex >= SOS_PATTERN.length) {
      sosIndex = 0;
      sosTimeout = setTimeout(runSOS, 600);
    } else {
      runSOS();
    }
  }, SOS_PATTERN[i]);
}

function stopSOS() {
  clearTimeout(sosTimeout);
  sosTimeout = null;
  sosIndex = 0;
}

// ===== Toggle =====
function toggle() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  active = !active;
  btnToggle.classList.toggle('active', active);
  toggleLabel.textContent = active ? 'SIGNALLING — TAP TO STOP' : 'TAP TO SIGNAL';

  if (active) {
    startBlink();
    requestWakeLock();
  } else {
    stopBlink();
    releaseWakeLock();
  }
}

// ===== Speed slider =====
speedSlider.addEventListener('input', () => {
  bpm = parseInt(speedSlider.value, 10);
  speedValue.textContent = bpm + ' BPM';

  // Restart blink with new speed if active & blink mode
  if (active && mode === 'blink') {
    clearInterval(intervalId);
    intervalId = null;
    startBlink();
  }
});

// ===== Mode selector =====
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;

    // Restart if active
    if (active) {
      stopBlink();
      startBlink();
    }
  });
});

// ===== Toggle button =====
btnToggle.addEventListener('click', toggle);

// ===== Mute =====
btnMute.addEventListener('click', () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  soundMuted = !soundMuted;
  btnMute.classList.toggle('muted', soundMuted);
  btnMute.setAttribute('aria-pressed', soundMuted);
  iconSoundOn.style.display  = soundMuted ? 'none' : '';
  iconSoundOff.style.display = soundMuted ? ''     : 'none';
});

// ===== Fullscreen =====
btnFull.addEventListener('click', () => {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    (document.documentElement.requestFullscreen?.() ||
     document.documentElement.webkitRequestFullscreen?.());
  } else {
    (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
  }
});

// ===== Screen Wake Lock =====
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    console.warn('Wake lock not available:', e);
  }
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

// Re-acquire wake lock when page becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && active) {
    requestWakeLock();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
});

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ===== Init =====
setStatus('OFF', false);
speedValue.textContent = bpm + ' BPM';
