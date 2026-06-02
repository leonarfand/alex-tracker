let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch { return null; }
  }
  return audioCtx;
}

/**
 * Warm up the audio context on the first real user gesture.
 * Browsers/WebView start the AudioContext "suspended"; resume() is async, so the
 * very first sound after load is often dropped (its scheduled start time passes
 * before the context is actually running). Calling this on first pointer/key
 * input guarantees the context is "running" before any sound is requested —
 * which is what makes playback consistent instead of "sometimes it works".
 */
export function warmupAudio() {
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
}

export function isSoundEnabled() {
  return localStorage.getItem("settings.sound") !== "off";
}

export function setSoundEnabled(on: boolean) {
  localStorage.setItem("settings.sound", on ? "on" : "off");
}

function tone(c: AudioContext, t0: number, freq: number, duration: number, type: OscillatorType, volume: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume, t0 + 0.008); // tiny attack avoids clicks
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.connect(g); g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.02);
}

function slide(c: AudioContext, t0: number, fromFreq: number, toFreq: number, duration: number, volume: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(fromFreq, t0);
  o.frequency.exponentialRampToValueAtTime(toFreq, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.connect(g); g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.02);
}

/** Run a sound builder. Resumes the context synchronously-ish, then schedules
 *  everything against a fresh `currentTime` so notes never land in the past. */
function play(build: (c: AudioContext, base: number) => void) {
  if (!isSoundEnabled()) return;
  const c = ctx();
  if (!c) return;
  const fire = () => {
    try { build(c, c.currentTime + 0.02); } catch {}
  };
  if (c.state === "suspended") {
    // Resume first; schedule after it's actually running so nothing is dropped.
    c.resume().then(fire).catch(fire);
  } else {
    fire();
  }
}

// ── Alarm (for reminders) ─────────────────────────────
// An alarm is explicit, so it rings even if incidental UI sounds are muted.
let alarmTimer: number | null = null;

// Shared limiter bus so the alarm can be loud without clipping when notes overlap.
let alarmBus: DynamicsCompressorNode | null = null;
function getAlarmBus(c: AudioContext): AudioNode {
  if (!alarmBus) {
    alarmBus = c.createDynamicsCompressor();
    alarmBus.threshold.setValueAtTime(-10, c.currentTime);
    alarmBus.ratio.setValueAtTime(12, c.currentTime);
    alarmBus.attack.setValueAtTime(0.003, c.currentTime);
    alarmBus.release.setValueAtTime(0.25, c.currentTime);
    const makeup = c.createGain();
    makeup.gain.setValueAtTime(1.6, c.currentTime); // recover loudness post-compression
    alarmBus.connect(makeup);
    makeup.connect(c.destination);
  }
  return alarmBus;
}

// A warm bell note: two slightly-detuned sines + a soft overtone, bell-shaped decay.
function bell(c: AudioContext, t0: number, freq: number, vol: number) {
  const bus = getAlarmBus(c);
  const make = (f: number, v: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);   // soft attack
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9); // long bell tail
    o.connect(g); g.connect(bus);
    o.start(t0);
    o.stop(t0 + 0.95);
  };
  make(freq, vol);
  make(freq * 1.003, vol * 0.6);   // detune for warmth
  make(freq * 2, vol * 0.18);      // gentle overtone shimmer
}

// Gentle ascending arpeggio — pleasant but noticeable (C5–E5–G5–C6).
function alarmChime() {
  const c = ctx();
  if (!c) return;
  const fire = () => {
    try {
      const t = c.currentTime + 0.03;
      bell(c, t,        523.25, 0.42);
      bell(c, t + 0.16, 659.25, 0.42);
      bell(c, t + 0.32, 783.99, 0.42);
      bell(c, t + 0.50, 1046.5, 0.45);
    } catch {}
  };
  if (c.state === "suspended") c.resume().then(fire).catch(fire);
  else fire();
}

export function startAlarm() {
  stopAlarm();
  alarmChime();
  alarmTimer = window.setInterval(alarmChime, 2600);
  // Auto-silence after 30s so it isn't endless if you step away — the popup stays.
  window.setTimeout(stopAlarm, 30_000);
}

export function stopAlarm() {
  if (alarmTimer !== null) { clearInterval(alarmTimer); alarmTimer = null; }
}

/** Play the alarm chime once (for Settings preview). */
export function previewAlarm() { alarmChime(); }

export const sounds = {
  // Crisp "hit" — bright pop, great for ✓ checks
  hit() {
    play((c, t) => {
      tone(c, t, 880, 0.06, "triangle", 0.22);
      tone(c, t + 0.03, 1320, 0.10, "sine", 0.14);
    });
  },
  // Reverse for undoing
  unhit() {
    play((c, t) => slide(c, t, 660, 330, 0.12, 0.14));
  },
  // 3-note pleasant chord for adding things
  success() {
    play((c, t) => {
      tone(c, t, 523, 0.10, "sine", 0.15);
      tone(c, t + 0.07, 659, 0.10, "sine", 0.15);
      tone(c, t + 0.14, 784, 0.18, "sine", 0.16);
    });
  },
  // Subtle UI click
  click() {
    play((c, t) => tone(c, t, 1400, 0.025, "square", 0.05));
  },
  // Delete / discard
  pop() {
    play((c, t) => slide(c, t, 300, 120, 0.10, 0.12));
  },
};
