(() => {
  'use strict';
  const root = document.documentElement;
  const screen = document.getElementById('papo-intro');
  const startup = window.PapoStartup;
  if (!startup || !screen || startup.mounted) return;
  startup.mounted = true;
  clearTimeout(startup.guard);
  if (!startup.active) { screen.remove(); return; }

  const van = screen.querySelector('.intro-van');
  const image = van?.querySelector('img');
  const audio = screen.querySelector('#papoMotorAudio');
  const soundButton = screen.querySelector('[data-intro-sound]');
  const soundText = soundButton?.querySelector('span');
  const skipButton = screen.querySelector('[data-intro-skip]');
  const status = screen.querySelector('#papoIntroStatus');
  const event = window.PapoEventBootstrap;
  const eventIntro = event?.active === true && event.features?.intro !== false;
  const eventImage = '/kombi-flowers.svg';
  let eventMessage = null;
  let eventMessageDone = !eventIntro || !startup.animate;
  if (eventIntro) {
    screen.classList.add('intro-anniversary');
    if (image) image.src = eventImage + (startup.animate ? '' : '#still');
    const brand = screen.querySelector('.intro-brand');
    if (brand) {
      eventMessage = document.createElement('div');
      eventMessage.className = 'intro-event-note';
      eventMessage.setAttribute('aria-live', 'polite');
      eventMessage.setAttribute('aria-hidden', 'true');
      const greeting = document.createElement('p');
      greeting.textContent = '3 anos desde que nossos caminhos se cruzaram. 💜';
      const name = document.createElement('strong');
      name.textContent = 'Nosso Pequeno Infinito';
      eventMessage.append(greeting, name);
      brand.append(eventMessage);
    }
    let effects = event.features?.decorations !== false && event.decorations?.petals !== false;
    try { effects = effects && JSON.parse(localStorage.getItem('papo.extras.v1') || '{}').easterEggs !== false; } catch {}
    if (startup.animate && !startup.reduced && effects) {
      const petals = document.createElement('div');
      petals.className = 'intro-event-petals';
      petals.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < 12; index++) {
        const petal = document.createElement('i');
        petal.style.setProperty('--petal-x', `${8 + (index * 23) % 86}%`);
        petal.style.setProperty('--petal-delay', `${(index % 5) * .23}s`);
        petal.style.setProperty('--petal-turn', `${95 + index * 17}deg`);
        petals.append(petal);
      }
      screen.append(petals);
    }
    if (!startup.animate) {
      screen.classList.add('intro-event-message');
      eventMessage?.setAttribute('aria-hidden', 'false');
    }
  }
  const timers = new Set(), listeners = [];
  const motion = van?.getAnimations?.().find(animation => animation.animationName === 'papo-drive');
  const motionElapsed = Number(motion?.currentTime) || 0;
  const startedAt = performance.now() - motionElapsed;
  const styles = getComputedStyle(screen);
  const duration = (name, fallback) => {
    const value = styles.getPropertyValue(name).trim();
    const amount = parseFloat(value);
    return Number.isFinite(amount) ? amount * (value.endsWith('ms') ? 1 : 1000) : fallback;
  };
  const driveDuration = duration('--intro-drive-duration', 3800);
  const driveDelay = duration('--intro-drive-delay', 200);
  const fadeDuration = startup.reduced ? 0 : duration('--intro-fade-duration', 450);
  let animationDone = !startup.animate || motion?.playState === 'finished', leaving = false, closed = false, fatal = false;
  let playAttempt = 0, playPending = false, soundBlocked = false, audioFailed = false, audioWanted = false;

  function later(callback, ms) {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms);
    timers.add(timer);
    return timer;
  }
  function listen(target, name, callback, options) {
    if (!target) return;
    target.addEventListener(name, callback, options);
    listeners.push(() => target.removeEventListener(name, callback, options));
  }
  function clearTimers() { for (const timer of timers) clearTimeout(timer); timers.clear(); }
  function soundState(label, playing = false) {
    if (soundText) soundText.textContent = label;
    if (soundButton) {
      soundButton.setAttribute('aria-label', label);
      soundButton.setAttribute('aria-pressed', String(playing));
    }
  }
  function stopSound() {
    playAttempt++;
    playPending = false;
    audioWanted = false;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch {}
    }
    soundState(audioFailed ? 'Motor indisponível' : 'Ouvir motor');
  }
  async function playSound(automatic = false) {
    if (!audio || audioFailed || closed || leaving || animationDone || playPending || !audio.paused) return;
    const attempt = ++playAttempt;
    playPending = true;
    audioWanted = true;
    try {
      const elapsed = Math.max(0, (performance.now() - startedAt - driveDelay) / 1000);
      if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(elapsed, Math.max(0, audio.duration - .1));
      await audio.play();
      if (attempt !== playAttempt || closed || leaving || animationDone) {
        if (!audioWanted || closed || leaving || animationDone) audio.pause();
        return;
      }
      const syncedTime = Math.max(0, (performance.now() - startedAt - driveDelay) / 1000);
      if (Number.isFinite(audio.duration) && Math.abs(audio.currentTime - syncedTime) > .2) {
        audio.currentTime = Math.min(syncedTime, Math.max(0, audio.duration - .1));
      }
      soundBlocked = false;
      soundState('Silenciar motor', true);
    } catch (error) {
      if (attempt !== playAttempt || closed || leaving || animationDone) return;
      audioWanted = false;
      soundBlocked = error.name === 'NotAllowedError';
      audioFailed = !soundBlocked;
      soundState(soundBlocked ? 'Ouvir motor' : 'Motor indisponível');
      if (soundButton) soundButton.disabled = audioFailed;
      if (!automatic || !soundBlocked) console.warn('[papo] Não foi possível tocar o motor da abertura:', error.name);
    } finally { if (attempt === playAttempt) playPending = false; }
  }
  function finishScreen(restoreFocus = true) {
    if (closed) return;
    closed = true;
    stopSound();
    clearTimers();
    listeners.splice(0).forEach(remove => remove());
    root.classList.remove('papo-intro-pending', 'papo-intro-reveal');
    screen.remove();
    startup.complete = true;
    if (restoreFocus && startup.entry === 'app') {
      const profile = document.getElementById('m1');
      const target = startup.outcome === 'app'
        ? document.getElementById(profile?.style.display === 'grid' ? 'pname' : 'cin')
        : document.getElementById('au');
      target?.focus({ preventScroll: true });
    }
  }
  function reveal() {
    if (closed || leaving || !startup.ready || !animationDone || !eventMessageDone) return;
    leaving = true;
    stopSound();
    clearTimers();
    screen.setAttribute('aria-busy', 'false');
    screen.classList.add('intro-ready', 'papo-intro-out');
    root.classList.add('papo-intro-reveal');
    later(() => finishScreen(), fadeDuration + 50);
  }
  function updateReady() {
    if (closed || leaving || fatal) return;
    if (startup.ready) {
      screen.classList.add('intro-ready');
      if (status) status.textContent = startup.outcome === 'offline'
        ? 'Vamos tentar conectar novamente.' : 'Tudo pronto para uma boa conversa.';
      reveal();
    } else if (status) status.textContent = startup.entry === 'app' ? 'Preparando sua conexão…' : 'Iniciando Papo…';
  }
  function showEventMessage(skipped = false) {
    if (!eventIntro || eventMessageDone) return;
    screen.classList.add('intro-event-message');
    eventMessage?.setAttribute('aria-hidden', 'false');
    if (skipped || !eventMessage) { eventMessageDone = true; return; }
    later(() => { eventMessageDone = true; updateReady(); }, 1400);
  }
  function finishAnimation(skipped = false) {
    if (closed || leaving || animationDone) return;
    animationDone = true;
    stopSound();
    if (soundButton) soundButton.disabled = true;
    if (skipButton && !startup.ready) { skipButton.disabled = true; skipButton.textContent = 'Conectando…'; }
    showEventMessage(skipped);
    updateReady();
  }
  function showFailure() {
    if (closed || leaving || startup.ready) return;
    fatal = true;
    animationDone = true;
    clearTimers();
    stopSound();
    root.dataset.papoMotion = 'reduced';
    if (image) image.src = eventIntro ? eventImage + '#still' : '/kombi.svg#still';
    eventMessageDone = true;
    screen.classList.remove('intro-event-message');
    screen.setAttribute('aria-busy', 'false');
    if (status) status.textContent = 'Não conseguimos iniciar o Papo. Recarregue para tentar de novo.';
    if (soundButton) soundButton.hidden = true;
    if (skipButton) { skipButton.hidden = false; skipButton.disabled = false; skipButton.textContent = 'Recarregar Papo'; }
  }

  if (!startup.animate) {
    if (image) image.src = eventIntro ? eventImage + '#still' : '/kombi.svg#still';
    if (soundButton) soundButton.hidden = true;
    if (skipButton) skipButton.hidden = true;
    screen.focus({ preventScroll: true });
  } else startup.markSeen();
  if (audio) { audio.volume = .45; audio.loop = false; }
  listen(van, 'animationend', event => {
    if (event.target === van && event.animationName === 'papo-drive') finishAnimation();
  });
  listen(skipButton, 'click', () => {
    if (fatal) { location.reload(); return; }
    root.dataset.papoMotion = 'reduced';
    if (image) image.src = eventIntro ? eventImage + '#still' : '/kombi.svg#still';
    if (animationDone && !eventMessageDone) {
      eventMessageDone = true;
      updateReady();
    } else finishAnimation(true);
  });
  listen(soundButton, 'click', () => {
    if (audio && (!audio.paused || playPending)) { soundBlocked = false; stopSound(); }
    else void playSound();
  });
  listen(screen, 'pointerdown', event => {
    if (soundBlocked && !event.target.closest('.intro-actions')) void playSound();
  });
  listen(audio, 'ended', () => soundState('Ouvir motor'));
  listen(audio, 'error', () => {
    audioFailed = true;
    stopSound();
    if (soundButton) soundButton.disabled = true;
    console.warn('[papo] O som do motor não pôde ser carregado.');
  });
  listen(document, 'papo:startup-ready', updateReady);
  listen(document, 'visibilitychange', () => { if (document.hidden) stopSound(); });
  listen(window, 'pagehide', () => finishScreen(false));
  listen(screen, 'keydown', event => {
    if (event.key === 'Escape' && startup.animate) { event.preventDefault(); skipButton?.click(); }
    if (event.key !== 'Tab') return;
    const buttons = [soundButton, skipButton].filter(button => button && !button.hidden && !button.disabled);
    if (!buttons.length) { event.preventDefault(); return; }
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  if (startup.animate && !animationDone) {
    later(finishAnimation, Math.max(0, driveDuration + driveDelay - motionElapsed) + 250);
    if (startup.sound) later(() => void playSound(true), Math.max(0, driveDelay - motionElapsed));
    later(() => {
      const fadingAt = performance.now();
      const fadeMotor = () => {
        if (!audio || closed || leaving || animationDone) return;
        const remaining = Math.max(0, 1 - (performance.now() - fadingAt) / 320);
        audio.volume = .45 * remaining;
        if (remaining > 0) later(fadeMotor, 25);
      };
      fadeMotor();
    }, Math.max(0, driveDuration + driveDelay - motionElapsed - 320));
    skipButton?.focus({ preventScroll: true });
  }
  if (eventIntro && animationDone && startup.animate) showEventMessage();
  later(() => {
    if (startup.ready) return;
    if (typeof startup.onTimeout === 'function') startup.onTimeout();
    if (!startup.ready) showFailure();
  }, 8500);
  updateReady();
})();
