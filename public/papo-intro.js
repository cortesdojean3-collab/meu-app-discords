(() => {
  'use strict';
  const root = document.documentElement;
  const screen = document.getElementById('papo-intro');
  if (!root.classList.contains('papo-intro-pending') || !screen) return;

  const van = screen.querySelector('.intro-van');
  const soundButton = screen.querySelector('[data-intro-sound]');
  const skipButton = screen.querySelector('[data-intro-skip]');
  let context = null, nodes = [], finished = false;

  function stopSound() {
    nodes.splice(0).forEach(node => { try { node.stop(); } catch {} });
    if (context) { const old = context; context = null; old.close().catch(() => {}); }
    if (soundButton) { soundButton.textContent = '🄊 Tocar som do motor'; soundButton.setAttribute('aria-pressed', 'false'); }
  }

  async function toggleSound() {
    if (context) { stopSound(); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { soundButton.textContent = 'Som indisponível'; return; }
    try {
      context = new AudioContext();
      await context.resume();
      const t = context.currentTime, master = context.createGain(), filter = context.createBiquadFilter();
      master.gain.setValueAtTime(.0001, t); master.gain.linearRampToValueAtTime(.13, t + .22); master.gain.linearRampToValueAtTime(.09, t + 1.55); master.gain.linearRampToValueAtTime(.0001, t + 2.8);
      filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = .7; filter.connect(master); master.connect(context.destination);
      const rev = context.createOscillator(); rev.type = 'sawtooth'; rev.frequency.setValueAtTime(48, t); rev.frequency.linearRampToValueAtTime(91, t + 1.25); rev.frequency.linearRampToValueAtTime(56, t + 2.75); rev.connect(filter); rev.start(t); rev.stop(t + 2.85); nodes.push(rev);
      const pulse = context.createOscillator(), pulseGain = context.createGain(); pulse.type = 'square'; pulse.frequency.setValueAtTime(24, t); pulse.frequency.linearRampToValueAtTime(31, t + 1.2); pulse.frequency.linearRampToValueAtTime(22, t + 2.75); pulseGain.gain.value = .13; pulse.connect(pulseGain); pulseGain.connect(filter); pulse.start(t); pulse.stop(t + 2.85); nodes.push(pulse);
      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * .18;
      const noise = context.createBufferSource(), noiseGain = context.createGain(), noiseFilter = context.createBiquadFilter();
      noise.buffer = buffer; noise.loop = true; noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 170; noiseGain.gain.value = .16; noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(master); noise.start(t); noise.stop(t + 2.85); nodes.push(noise);
      soundButton.textContent = '🄇 Silenciar som'; soundButton.setAttribute('aria-pressed', 'true');
      setTimeout(() => { if (context && context.currentTime >= t + 2.75) stopSound(); }, 2900);
    } catch { stopSound(); soundButton.textContent = 'Não foi possível tocar o som'; }
  }

  function finish() {
    if (finished) return;
    finished = true; clearTimeout(fallback); stopSound(); root.classList.add('papo-intro-reveal'); screen.classList.add('papo-intro-out');
    setTimeout(() => { root.classList.remove('papo-intro-pending','papo-intro-reveal'); screen.remove(); }, 420);
  }

  const fallback = setTimeout(finish, 4000);
  van?.addEventListener('animationend', finish, { once: true });
  skipButton?.addEventListener('click', finish);
  soundButton?.addEventListener('click', toggleSound);
  skipButton?.focus({ preventScroll: true });
})();
