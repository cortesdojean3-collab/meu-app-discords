/* A voluntary celebration. Calendar access is always authorized by the server. */
(() => {
  'use strict';
  if (window.PapoEvent) return;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = [], timers = new Set(), effects = new Set(), effectTimers = new Set(), requests = new Set();
  let state = null, clockAt = 0, clockBase = 0, disposed = false, polling = 0, pending = null;
  let preferences = {}, panel = null, letterPanel = null, returnFocus = null, letterFocus = null;
  let navigation = null, heartButton = null, adminButton = null, effectsHost = null;
  let savedInert = [], heartClicks = 0, heartAt = 0, selectedStars = new Set();
  let lastRender = '', activeView = 'home', requestSequence = 0, effectAt = new Map();
  const blossom = '<svg viewBox="0 0 100 132" aria-hidden="true"><path class="pe-stem" d="M50 128Q44 95 50 49M48 101Q30 78 20 89M49 113Q67 89 78 98" fill="none" stroke="#9acda9" stroke-width="3" stroke-linecap="round"/><path d="M47 101Q30 80 20 89Q25 101 47 101M49 113Q64 94 78 98Q72 113 49 113" fill="#74a992"/><g class="pe-petals"><path d="M50 58C29 69 12 49 29 36C17 15 41 8 50 26C59 8 83 15 71 36C88 49 71 69 50 58Z" fill="currentColor" stroke="#fff9" stroke-width="1.3"/><path d="M50 56C37 61 32 49 39 40C34 29 45 27 50 36C55 27 66 29 61 40C68 49 63 61 50 56Z" fill="#fffb"/><circle cx="50" cy="44" r="6" fill="#e7cfa1"/></g></svg>';
  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S2 14 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 7-10 13-10 13Z" fill="currentColor"/></svg>';
  const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1 2.5 8.5L23 12l-8.5 2.5L12 23l-2.5-8.5L1 12l8.5-2.5Z" fill="currentColor"/></svg>';

  function flowerArt(id) {
    const stem = '<path class="pe-stem" d="M50 128Q46 93 50 57M48 99Q32 82 23 91M49 111Q66 93 76 100" fill="none" stroke="#9acda9" stroke-width="3" stroke-linecap="round"/><path d="M48 99Q32 83 23 91Q29 100 48 99M49 111Q65 95 76 100Q68 112 49 111" fill="#74a992"/>';
    const heads = {
      'flower-rose': '<g class="pe-petals"><path d="M50 62C31 69 17 54 22 41C14 25 31 14 42 20C52 7 69 16 70 27C87 30 83 51 71 56C67 69 57 69 50 62Z" fill="currentColor" stroke="#f2dcff9c" stroke-width="1.2"/><path d="M30 43C21 29 40 20 49 27C60 18 74 30 68 42C77 54 59 64 50 55C36 63 27 52 30 43Z" fill="#e7cbf5" fill-opacity=".6"/><path d="M36 40C34 29 51 28 55 35C69 33 69 48 58 50C50 61 35 52 36 40Z" fill="currentColor" stroke="#f6e5ffb3" stroke-width="1.2"/><path d="M46 38C54 33 61 40 56 46C51 52 43 46 46 41C50 38 54 41 52 44" fill="none" stroke="#f5e1ffc7" stroke-width="1.7" stroke-linecap="round"/></g>',
      'flower-daisy': '<g class="pe-petals" fill="currentColor" stroke="#fff8" stroke-width=".7"><ellipse cx="50" cy="24" rx="5.3" ry="13"/><ellipse cx="50" cy="24" rx="5.3" ry="13" transform="rotate(45 50 41)"/><ellipse cx="50" cy="24" rx="5.3" ry="13" transform="rotate(90 50 41)"/><ellipse cx="50" cy="24" rx="5.3" ry="13" transform="rotate(135 50 41)"/><ellipse cx="50" cy="24" rx="5.3" ry="13" transform="rotate(180 50 41)"/><ellipse cx="50" cy="24" rx="5.3" ry="13" transform="rotate(225 50 41)"/><ellipse cx="50" cy="24" rx="5.3" ry="13" transform="rotate(270 50 41)"/><ellipse cx="50" cy="24" rx="5.3" ry="13" transform="rotate(315 50 41)"/><circle cx="50" cy="41" r="9.5" fill="#e6c779" stroke="#f3dca8"/><circle cx="47" cy="38" r="2" fill="#fff2c899"/><path d="M49 45h1m4-5h1m-8 1h1" stroke="#b8994e" stroke-width="1.5" stroke-linecap="round"/></g>',
      'flower-tulip': '<g class="pe-petals"><path d="M25 25Q43 26 50 44Q57 26 75 25C76 50 67 65 50 65C33 65 24 50 25 25Z" fill="currentColor" stroke="#ffd5e3b3" stroke-width="1.3"/><path d="M50 13C39 25 35 42 42 58Q50 69 58 58C65 42 61 25 50 13Z" fill="#f4c5dc" stroke="#ffe5ee99" stroke-width="1.1"/><path d="M25 25Q34 41 44 54Q50 64 50 65C34 65 24 50 25 25Z" fill="#d88baa" fill-opacity=".65"/><path d="M75 25Q66 42 56 54Q50 64 50 65C65 65 76 50 75 25Z" fill="currentColor"/><path d="M48 28Q42 40 46 51" fill="none" stroke="#fff0f29c" stroke-width="1.7" stroke-linecap="round"/></g>',
      'flower-lavender': '<g class="pe-petals"><path d="M50 63V17M50 55L40 32M50 57L61 37" fill="none" stroke="#8fb6a2" stroke-width="2" stroke-linecap="round"/><g fill="currentColor" stroke="#e9dcff8c" stroke-width=".7"><ellipse cx="50" cy="14" rx="4" ry="6"/><ellipse cx="45" cy="23" rx="5" ry="4" transform="rotate(28 45 23)"/><ellipse cx="55" cy="24" rx="5" ry="4" transform="rotate(-28 55 24)"/><ellipse cx="45" cy="33" rx="5.5" ry="4" transform="rotate(28 45 33)"/><ellipse cx="55" cy="34" rx="5.5" ry="4" transform="rotate(-28 55 34)"/><ellipse cx="45" cy="44" rx="5.5" ry="4" transform="rotate(28 45 44)"/><ellipse cx="55" cy="45" rx="5.5" ry="4" transform="rotate(-28 55 45)"/><ellipse cx="38" cy="29" rx="3" ry="4.5" transform="rotate(-20 38 29)"/><ellipse cx="40" cy="38" rx="4.5" ry="3.3" transform="rotate(28 40 38)"/><ellipse cx="62" cy="33" rx="3" ry="4.5" transform="rotate(20 62 33)"/><ellipse cx="60" cy="42" rx="4.5" ry="3.3" transform="rotate(-28 60 42)"/></g><path d="M48 52l-6-5m10 6 6-5" fill="none" stroke="#cabcfa" stroke-width="2" stroke-linecap="round"/></g>',
      'flower-gold': '<g class="pe-petals"><path d="M50 11Q60 26 58 33Q75 26 82 30Q80 46 69 48Q80 61 76 69Q59 68 56 58Q52 76 43 77Q33 63 39 54Q20 58 17 50Q24 35 35 37Q27 20 34 15Q47 20 50 31Z" fill="currentColor" stroke="#fff0c8a6" stroke-width="1.1"/><path d="M50 22L50 44M72 34L50 44M69 60L50 44M45 67L50 44M27 48L50 44M37 25L50 44" stroke="#fff4d390" stroke-width="1.4" stroke-linecap="round"/><circle cx="50" cy="44" r="8" fill="#c3a565" stroke="#f7e4b5" stroke-width="1.4"/><circle cx="48" cy="41" r="2.5" fill="#fff1c5"/></g>'
    };
    if (!heads[id]) return blossom;
    return `<svg viewBox="0 0 100 132" aria-hidden="true">${stem}${heads[id]}</svg>`;
  }

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function button(className, label, action) {
    const result = node('button', className, label); result.type = 'button';
    if (action) result.dataset.peAction = action;
    return result;
  }
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function later(fn, delay) {
    const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, delay);
    timers.add(id); return id;
  }
  function cancel(id) { clearTimeout(id); timers.delete(id); }
  function config() { return state?.config || {}; }
  function feature(name) { return config().features?.[name] !== false; }
  function active() { return state?.status === 'active'; }
  function memories() { return state?.status === 'ended' && config().allowMemories === true; }
  function accessible() { return active() || memories(); }
  function still() { return media.matches || preferences.reduceMotion === true || preferences.animations === false; }
  function eggs() { return preferences.extras !== false && preferences.easterEggs !== false; }
  function serverTime() { return clockBase + Math.max(0, performance.now() - clockAt); }
  function loadPreferences(detail) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('papo.extras.v1') || '{}') || {}; } catch {}
    preferences = { ...saved, ...(detail || {}) };
    document.documentElement.classList.toggle('pe-reduced', still());
    panel?.classList.toggle('pe-no-eggs', !eggs());
    if (!eggs() || still()) clearEffects();
    const finalVan = letterPanel?.querySelector('.pe-final-van'); if (finalVan) finalVan.src = still() ? '/kombi-flowers.svg#still' : '/kombi-flowers.svg';
    if (state) {
      syncNavigation();
      if (panel) {
        const focused = document.activeElement?.dataset?.peFocus, scroll = panel.querySelector('.pe-scroll')?.scrollTop || 0;
        renderPanel(); panel.querySelector('.pe-scroll').scrollTop = scroll;
        if (focused) [...panel.querySelectorAll('[data-pe-focus]')].find(item => item.dataset.peFocus === focused)?.focus({ preventScroll: true });
      }
    }
  }
  function color(value, fallback) { return /^#[\da-f]{6}$/i.test(value || '') ? value : fallback; }
  function applyColors(target) {
    target.style.setProperty('--pe-purple', color(config().colors?.primary, '#aa91e8'));
    target.style.setProperty('--pe-pink', color(config().colors?.pink, '#ecc0da'));
    target.style.setProperty('--pe-gold', color(config().colors?.gold, '#edd2a2'));
  }
  function apiMessage(error) { return error?.message || 'Não foi possível abrir esta lembrança. Tente novamente.'; }
  async function api(url, options = {}) {
    const controller = new AbortController(), id = later(() => controller.abort(), 8000);
    requests.add(controller);
    try {
      const response = await fetch(url, { credentials: 'same-origin', ...options, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.erro || body.error || body.message || (response.status === 401 ? 'Entre na sua conta para participar.' : 'O jardim está indisponível por um instante.'));
        error.status = response.status; throw error;
      }
      return body;
    } finally { cancel(id); requests.delete(controller); }
  }
  function scheduleRefresh(delay = 30000) {
    cancel(polling); polling = later(() => { polling = 0; refresh(); }, delay);
  }
  async function refresh() {
    if (disposed) return null;
    if (pending) return pending;
    pending = api('/api/event').then(next => { applyState(next); return next; }).catch(error => {
      if (error.status === 401) { close(); state = null; syncNavigation(); clearEffects(); }
      if (panel) announce(apiMessage(error));
      return null;
    }).finally(() => { pending = null; if (!disposed) scheduleRefresh(document.hidden ? 60000 : 30000); });
    return pending;
  }
  function applyState(next) {
    if (disposed || !next || typeof next !== 'object') return;
    state = next; clockBase = Date.parse(next.serverNow); clockAt = performance.now();
    if (!Number.isFinite(clockBase)) clockBase = 0;
    syncNavigation();
    const signature = JSON.stringify([next.revision, next.status, next.day, next.lettersReleased, next.discoveries, next.finaleAvailable, next.canAdmin]);
    if (panel && signature !== lastRender) {
      const focused = document.activeElement?.dataset?.peFocus;
      const scroll = panel.querySelector('.pe-scroll')?.scrollTop || 0;
      renderPanel(); panel.querySelector('.pe-scroll').scrollTop = scroll;
      if (focused) [...panel.querySelectorAll('[data-pe-focus]')].find(item => item.dataset.peFocus === focused)?.focus({ preventScroll: true });
    }
    lastRender = signature; updateCountdown();
    if (!active()) clearEffects();
    document.dispatchEvent(new CustomEvent('papo:event-state', { detail: next }));
  }
  function syncNavigation() {
    const side = document.querySelector('#side'), title = side?.querySelector('h3');
    const visible = active() || memories() || ['upcoming', 'future'].includes(state?.status);
    document.documentElement.classList.toggle('papo-event-active', active() && feature('decorations'));
    if (!navigation && side) {
      navigation = button('pe-nav', '', 'open'); navigation.id = 'papoEventNav';
      const emblem = node('span', 'pe-nav-flower'); emblem.innerHTML = blossom;
      const text = node('span', 'pe-nav-text'); text.append(node('strong', '', 'Nosso Pequeno Infinito'), node('small', '', 'Um jardim para nossa história'));
      const badge = node('span', 'pe-nav-badge'); badge.setAttribute('aria-label', 'Cartas disponíveis');
      navigation.append(emblem, text, badge); navigation.addEventListener('click', open);
      side.insertBefore(navigation, document.querySelector('#chs'));
    }
    if (navigation) {
      navigation.hidden = !visible; applyColors(navigation);
      const released = feature('letters') ? Number(state?.lettersReleased || 0) : 0;
      const badge = navigation.querySelector('.pe-nav-badge'); badge.textContent = released ? String(released) : '✦';
      navigation.title = active() ? `${released} cartas disponíveis — abrir evento` : 'Conheça a próxima comemoração';
    }
    if (!heartButton && title) {
      heartButton = button('pe-hud-heart', '', 'heart'); heartButton.id = 'papoEventHeart'; heartButton.innerHTML = heart;
      heartButton.setAttribute('aria-label', 'Coração comemorativo'); heartButton.title = 'Um pequeno coração guarda um segredo';
      heartButton.addEventListener('click', clickHeart); title.append(heartButton);
    }
    if (heartButton) heartButton.hidden = !(active() && feature('heart') && eggs());
    if (!adminButton && side) {
      adminButton = button('pe-admin-nav', 'Configurar comemoração', 'admin'); adminButton.id = 'papoEventAdminNav';
      adminButton.addEventListener('click', () => window.PapoEventAdmin?.open());
      side.insertBefore(adminButton, document.querySelector('#chs'));
    }
    if (adminButton) adminButton.hidden = !state?.canAdmin;
    const delivery = document.querySelector('#papoEventDeliveryHeart');
    if (delivery) delivery.hidden = !(active() && feature('delivery') && eggs());
  }
  function rememberInert() {
    savedInert = [...document.body.children].filter(child => child !== panel && child !== effectsHost && !['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)).map(child => [child, child.inert]);
    for (const [child] of savedInert) child.inert = true;
  }
  function restoreInert() { for (const [child, value] of savedInert) child.inert = value; savedInert = []; }
  async function open() {
    if (disposed || panel) return;
    if (!state) await refresh();
    if (!state || !(accessible() || ['upcoming', 'future'].includes(state.status))) return;
    returnFocus = document.activeElement;
    panel = node('div', 'pe-overlay'); panel.id = 'papoEventPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'peTitle');
    document.body.append(panel); rememberInert(); renderPanel();
    panel.querySelector('[data-pe-action="close"]')?.focus({ preventScroll: true });
  }
  function close() {
    if (!panel) return;
    closeLetter(false); panel.remove(); panel = null; restoreInert(); selectedStars = new Set();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null; clearEffects();
  }
  function section(id, eyebrow, titleText, subtitle) {
    const result = node('section', 'pe-section'); result.id = id;
    const heading = node('div', 'pe-section-heading');
    heading.append(node('span', 'pe-eyebrow', eyebrow), node('h2', '', titleText));
    if (subtitle) heading.append(node('p', '', subtitle));
    result.append(heading); return result;
  }
  function renderPanel() {
    if (!panel) return;
    applyColors(panel); panel.classList.toggle('pe-no-eggs', !eggs());
    panel.classList.toggle('pe-undecorated', !feature('decorations'));
    panel.classList.toggle('pe-no-decorative-flowers', config().decorations?.flowers === false);
    panel.classList.toggle('pe-no-decorative-stars', config().decorations?.stars === false);
    const frame = node('div', 'pe-frame');
    const header = node('header', 'pe-header');
    const brand = button('pe-brand', '', 'home'); brand.innerHTML = '<span class="pe-brand-mark">✦</span>'; brand.append(node('span', '', 'Papo'), node('small', '', 'edição de aniversário'));
    const exit = button('pe-close', '×', 'close'); exit.title = 'Voltar ao Papo'; exit.setAttribute('aria-label', 'Fechar evento e voltar ao Papo');
    header.append(brand, node('span', 'pe-header-note', 'Uma pequena celebração. Um carinho infinito.'));
    if (active() && feature('heart') && eggs()) { const eventHeart = button('pe-hud-heart pe-header-heart', '', 'heart'); eventHeart.innerHTML = heart; eventHeart.setAttribute('aria-label', 'Coração do evento'); eventHeart.title = 'Alguns segredos precisam de três pequenos carinhos'; header.append(eventHeart); }
    header.append(exit); frame.append(header);
    const scroll = node('div', 'pe-scroll'); const main = node('main', 'pe-content');
    const hero = node('section', 'pe-hero'); hero.id = 'peHome';
    const heroArt = node('div', 'pe-hero-art'); heroArt.setAttribute('aria-hidden', 'true');
    const heroCopy = node('div', 'pe-hero-copy');
    heroCopy.append(node('span', 'pe-eyebrow pe-pill', '✧  Edição especial • 3 anos'));
    const title = node('h1', '', config().title || 'Nosso Pequeno Infinito — 3 Anos de Nós'); title.id = 'peTitle'; heroCopy.append(title);
    heroCopy.append(node('p', 'pe-hero-subtitle', config().subtitle || 'Há três anos, duas histórias se encontraram. E desde então, o mundo ganhou um pouquinho mais de cor.'));
    const names = config().names;
    if (names && (names.you || names.partner)) heroCopy.append(node('p', 'pe-dedication', [names.you, names.partner].filter(Boolean).join('  &  ')));
    const actions = node('div', 'pe-hero-actions');
    if (active() && feature('garden')) actions.append(button('pe-button pe-button-primary', 'Entrar no jardim  ↗', 'garden'));
    if (active() && feature('letters')) actions.append(button('pe-button pe-button-quiet', 'Abrir uma carta  ♡', 'letters'));
    heroCopy.append(actions);
    const countdown = node('div', 'pe-countdown'); countdown.append(node('span', 'pe-countdown-label'), node('strong', 'pe-countdown-value'), node('small', 'pe-countdown-date'));
    heroCopy.append(countdown); hero.append(heroArt, heroCopy); main.append(hero);
    if (!accessible()) {
      const waiting = node('div', 'pe-waiting'); waiting.append(node('span', '', state.status === 'ended' ? '✧' : '❀'), node('h2', '', state.status === 'ended' ? 'Este jardim floresceu em uma data especial.' : 'Nosso jardim está preparando suas flores.'), node('p', '', state.status === 'ended' ? 'A comemoração terminou e o Papo voltou à sua aparência habitual. As configurações e lembranças continuam guardadas.' : 'As cartas e as surpresas estarão disponíveis quando a comemoração começar.'));
      main.append(waiting);
    } else {
      const story = node('section', 'pe-story');
      story.append(node('div', 'pe-story-mark', '∞'), node('span', 'pe-eyebrow', 'Alguns encontros mudam tudo'));
      story.append(node('p', 'pe-story-text', config().mainText || 'Feliz três anos desde que nossos caminhos se cruzaram. 💜'));
      const stats = node('div', 'pe-stats');
      for (const [key, label] of [['days', 'dias para guardar carinho'], ['letters', 'cartas que já floresceram'], ['flowers', 'flores descobertas']]) {
        const stat = node('div', 'pe-stat'); stat.append(node('strong', `pe-stat-${key}`), node('span', '', label)); stats.append(stat);
      }
      story.append(stats);
      if (config().meetingDate) story.append(node('p', 'pe-meeting', meetingElapsed(config().meetingDate)));
      main.append(story);
      if (active() && feature('garden')) main.append(gardenSection());
      if (feature('letters')) main.append(letterSection());
      if (active() && feature('constellation') && eggs()) main.append(skySection());
      if (active() && feature('finale')) main.append(finaleSection());
    }
    const footer = node('footer', 'pe-footer');
    footer.append(node('span', '', 'Feito de encontros, flores e pequenas lembranças.'), node('span', '', 'Papo  ♡'));
    const deliveryHeart = button('pe-delivery-secret', '♡', 'delivery'); deliveryHeart.id = 'papoEventDeliveryHeart'; deliveryHeart.title = 'Há carinho escondido nos detalhes'; deliveryHeart.setAttribute('aria-label', 'Pequeno coração entre as lembranças');
    deliveryHeart.hidden = !(active() && feature('delivery') && eggs()); footer.append(deliveryHeart); main.append(footer);
    scroll.append(main); frame.append(scroll);
    const status = node('div', 'pe-announcement'); status.id = 'peAnnouncement'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); frame.append(status);
    panel.replaceChildren(frame); updateCountdown();
    if (activeView !== 'home') panel.querySelector(`#pe${activeView[0].toUpperCase()}${activeView.slice(1)}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function dateLabel(value, withTime = false) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('pt-BR', { timeZone: state?.timeZone || 'America/Sao_Paulo', day: '2-digit', month: 'long', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)); } catch { return ''; }
  }
  function meetingElapsed(value) {
    const timestamp = Date.parse(`${value}T00:00:00-03:00`);
    const days = Math.max(0, Math.floor((serverTime() - timestamp) / 86400000));
    return Number.isFinite(days) ? `${days.toLocaleString('pt-BR')} dias desde que dois caminhos se encontraram. ♡` : '';
  }
  function updateCountdown() {
    if (!panel || !state) return;
    const end = Date.parse(active() ? state.endsAt : state.startsAt);
    const remaining = Math.max(0, end - serverTime());
    const countdown = panel.querySelector('.pe-countdown');
    if (countdown) {
      countdown.hidden = !Number.isFinite(end) || state.status === 'ended';
      countdown.querySelector('.pe-countdown-label').textContent = active() ? 'Cada instante é uma pequena lembrança' : 'Nos encontramos neste jardim em';
      const days = Math.floor(remaining / 86400000), hours = Math.floor(remaining / 3600000) % 24, minutes = Math.floor(remaining / 60000) % 60;
      countdown.querySelector('.pe-countdown-value').textContent = `${days}d  ${String(hours).padStart(2, '0')}h  ${String(minutes).padStart(2, '0')}min`;
      countdown.querySelector('.pe-countdown-date').textContent = `${active() ? 'Até' : 'A partir de'} ${dateLabel(active() ? state.endsAt : state.startsAt, true)} • Brasília`;
    }
    const values = { days: state.daysRemaining || 0, letters: state.lettersReleased || 0, flowers: discoveredFlowers().length };
    for (const key of Object.keys(values)) { const item = panel.querySelector(`.pe-stat-${key}`); if (item) item.textContent = String(values[key]).padStart(2, '0'); }
    // Client time never unlocks a letter. A trusted monotonic deadline restores
    // the normal theme even if the connection is lost at the end of the month.
    if (Number.isFinite(end) && remaining === 0 && state.status !== 'ended') {
      if (active()) { closeLetter(false); applyState({ ...state, status: 'ended', serverNow: new Date(serverTime()).toISOString(), finaleAvailable: false }); }
      scheduleRefresh(100);
    }
  }
  function discoveredFlowers() { return (state?.discoveries || []).filter(id => id === 'special' || String(id).startsWith('flower-')); }
  function gardenSection() {
    const sectionNode = section('peGarden', '01 / Um lugar para florescer', 'O Jardim dos Três Anos', 'Toque em uma flor. Cada uma guarda um jeito diferente de dizer carinho.');
    const garden = node('div', 'pe-garden');
    const scene = node('div', 'pe-garden-scene'); scene.setAttribute('aria-hidden', 'true'); garden.append(scene);
    const instruction = node('span', 'pe-garden-label', 'Um pequeno infinito floresce aqui'); garden.append(instruction);
    const colors = ['#c7a4ec', '#fff7ee', '#eeb2d3', '#bcb2f5', '#edd39c'];
    (config().flowers || []).forEach((flower, index) => {
      const item = button(`pe-flower pe-flower-${index + 1}`, '', 'flower'); item.dataset.flower = flower.id; item.dataset.peFocus = flower.id;
      item.style.setProperty('--flower-color', colors[index % colors.length]); item.title = flower.name;
      item.setAttribute('aria-label', `Desabrochar ${flower.name}`); item.setAttribute('aria-pressed', String((state.discoveries || []).includes(flower.id)));
      const image = node('span', 'pe-flower-art'); image.innerHTML = flowerArt(flower.id); item.append(image, node('span', 'pe-flower-name', flower.name));
      if ((state.discoveries || []).includes(flower.id)) item.classList.add('pe-bloomed'); garden.append(item);
    });
    if (feature('special') && eggs()) {
      const special = button('pe-special-flower', '', 'special'); special.innerHTML = blossom; special.dataset.peFocus = 'special'; special.title = 'Uma flor um pouco diferente'; special.setAttribute('aria-label', 'Uma pequena flor dourada escondida'); garden.append(special);
    }
    const note = node('div', 'pe-garden-note'); note.id = 'peGardenNote'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
    note.append(node('span', '', '❀'), node('p', '', 'Há palavras que só um jardim sabe guardar.'));
    sectionNode.append(garden, note); return sectionNode;
  }
  function letterSection() {
    const result = section('peLetters', '02 / Pequenas palavras, todos os dias', '30 Dias de Carinho', 'Um envelope por dia. As cartas abertas continuam aqui, para quando der vontade de lembrar.');
    const grid = node('div', 'pe-letter-grid');
    const letters = config().letters || state?.letters || [];
    letters.forEach(letter => {
      const item = button(`pe-envelope ${letter.unlocked ? 'pe-unlocked' : 'pe-locked'}`, '', 'letter'); item.dataset.day = String(letter.day); item.dataset.peFocus = `letter-${letter.day}`;
      const body = node('span', 'pe-envelope-art'); body.setAttribute('aria-hidden', 'true'); body.append(node('span', 'pe-envelope-paper'), node('span', 'pe-envelope-fold'), node('span', 'pe-envelope-seal', letter.unlocked ? '♡' : '·'));
      item.append(body, node('strong', '', `Dia ${String(letter.day).padStart(2, '0')}`), node('small', '', letter.unlocked ? 'Um carinho para você' : dateLabel(letter.availableAt)));
      item.setAttribute('aria-label', letter.unlocked ? `Abrir carta do dia ${letter.day}` : `Carta do dia ${letter.day}, disponível em ${dateLabel(letter.availableAt, true)}`);
      grid.append(item);
    });
    result.append(grid, node('p', 'pe-calendar-note', '✦ As cartas seguem o calendário do evento, no horário de Brasília.')); return result;
  }
  function skySection() {
    const result = section('peConstellation', '03 / Um segredo escrito lá em cima', 'Constelação de Corações', 'Existem três estrelas que se reconhecem. Encontre-as e deixe o céu contar uma lembrança.');
    const sky = node('div', 'pe-sky');
    const lines = node('div', 'pe-sky-lines'); lines.innerHTML = '<svg viewBox="0 0 600 260" preserveAspectRatio="none" aria-hidden="true"><path d="M300 207C257 184 163 115 205 74C245 30 290 58 300 82C310 58 355 30 395 74C437 115 343 184 300 207Z"/></svg>'; sky.append(lines);
    const positions = [[34.167, 28.462], [65.833, 28.462], [50, 79.615], [19, 64], [79, 67], [48, 18], [88, 23], [11, 29]];
    positions.forEach(([x, y], index) => {
      const item = button('pe-star', '', 'star'); item.style.left = `${x}%`; item.style.top = `${y}%`; item.dataset.star = String(index); item.dataset.peFocus = `star-${index}`;
      item.innerHTML = star; item.setAttribute('aria-label', `Estrela ${index + 1}`); item.setAttribute('aria-pressed', String(selectedStars.has(index))); item.classList.toggle('pe-selected', selectedStars.has(index)); sky.append(item);
    });
    if ((state.discoveries || []).includes('constellation')) sky.classList.add('pe-connected');
    const note = node('p', 'pe-sky-note', (state.discoveries || []).includes('constellation') ? config().messages?.constellation : 'O céu também guarda pequenos segredos.'); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite'); sky.append(note);
    result.append(sky); return result;
  }
  function finaleSection() {
    const result = node('section', 'pe-finale-entry'); result.id = 'peFinale';
    const icon = node('span', 'pe-finale-icon', '∞');
    const copy = node('div'); copy.append(node('span', 'pe-eyebrow', 'Uma última carta. Muitas páginas pela frente.'), node('h2', '', 'E se essa história fosse só o começo?'), node('p', '', state.finaleAvailable ? 'O último buquê está esperando. Abra quando quiser guardar mais uma lembrança.' : 'No último dia, este jardim guarda uma surpresa de despedida.'));
    const action = button('pe-button pe-button-quiet', state.finaleAvailable ? 'Abrir a última lembrança  ↗' : 'Disponível no último dia', 'finale'); action.disabled = !state.finaleAvailable;
    result.append(icon, copy, action); return result;
  }
  function announce(text) { const target = document.querySelector('#peAnnouncement'); if (target) target.textContent = text; }
  async function discover(kind) {
    const next = await api('/api/event/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) });
    applyState(next); return next;
  }
  async function bloom(item) {
    if (!active() || !feature('garden')) return;
    const flower = (config().flowers || []).find(value => value.id === item.dataset.flower); if (!flower) return;
    item.classList.add('pe-bloomed'); item.setAttribute('aria-pressed', 'true');
    const note = document.querySelector('#peGardenNote p'); if (note) note.textContent = flower.text;
    try { await discover(flower.id); const current = document.querySelector('#peGardenNote p'); if (current) current.textContent = flower.text; } catch (error) { announce(apiMessage(error)); }
  }
  async function openLetter(day) {
    if (!accessible() || !feature('letters')) return;
    const letter = (config().letters || state?.letters || []).find(item => Number(item.day) === day);
    if (!letter?.unlocked) { announce(`Esta carta floresce em ${dateLabel(letter?.availableAt, true)}. ♡`); return; }
    const request = ++requestSequence;
    try {
      const result = await api(`/api/event/letter/${day}`);
      if (!disposed && panel && accessible() && feature('letters') && request === requestSequence) showLetter(`Dia ${String(day).padStart(2, '0')} • 30 Dias de Carinho`, 'Um carinho para guardar', result.text, 'daily');
    } catch (error) { announce(apiMessage(error)); }
  }
  function showLetter(eyebrow, titleText, text, type = 'special') {
    closeLetter(false); letterFocus = document.activeElement;
    letterPanel = node('div', `pe-letter-overlay pe-letter-${type}`); letterPanel.id = 'papoEventLetter'; letterPanel.setAttribute('role', 'dialog'); letterPanel.setAttribute('aria-modal', 'true'); letterPanel.setAttribute('aria-labelledby', 'peLetterTitle');
    applyColors(letterPanel);
    const card = node('article', 'pe-letter-card');
    const exit = button('pe-close pe-letter-close', '×', 'close-letter'); exit.setAttribute('aria-label', 'Fechar carta');
    card.append(exit);
    if (type === 'finale') {
      const scene = node('div', 'pe-finale-scene');
      for (let i = 0; i < 3; i++) { const bloomNode = node('span', 'pe-final-flower'); bloomNode.innerHTML = blossom; bloomNode.style.setProperty('--flower-delay', `${i * .65}s`); scene.append(bloomNode); }
      const finalHeart = node('span', 'pe-final-heart'); finalHeart.innerHTML = heart;
      const van = node('img', 'pe-final-van'); van.src = still() ? '/kombi-flowers.svg#still' : '/kombi-flowers.svg'; van.alt = 'A Kombi do Papo entrega um último buquê'; scene.append(finalHeart, van); card.append(scene);
    } else if (type === 'daily') {
      const envelope = node('img', 'pe-letter-envelope'); envelope.src = '/papo-event-envelope.svg'; envelope.alt = ''; card.append(envelope);
    } else {
      const ornament = node('div', 'pe-letter-ornament'); ornament.innerHTML = blossom; card.append(ornament);
    }
    card.append(node('span', 'pe-eyebrow', eyebrow));
    const title = node('h2', '', titleText); title.id = 'peLetterTitle'; card.append(title, node('div', 'pe-letter-body', text || ''), node('div', 'pe-letter-signature', 'Com carinho, nosso pequeno infinito. ♡'));
    letterPanel.append(card); document.body.append(letterPanel);
    if (panel) panel.inert = true;
    exit.focus({ preventScroll: true });
  }
  function closeLetter(restore = true) {
    if (!letterPanel) return;
    letterPanel.remove(); letterPanel = null; if (panel) panel.inert = false;
    if (restore) {
      if (letterFocus?.isConnected) letterFocus.focus({ preventScroll: true });
      else panel?.querySelector('[data-pe-action="close"]')?.focus({ preventScroll: true });
    }
    letterFocus = null;
  }
  async function special() {
    if (!active() || !feature('special') || !feature('garden') || !eggs()) return;
    try { await discover('special'); } catch (error) { announce(apiMessage(error)); return; }
    if (!panel) return;
    showLetter('Uma flor que escolheu você', 'Algumas pessoas merecem um jardim inteiro.', config().messages?.special, 'special');
    if (!still()) petals(true);
  }
  async function chooseStar(item) {
    if (!active() || !feature('constellation') || !eggs()) return;
    const index = Number(item.dataset.star);
    if (selectedStars.has(index)) selectedStars.delete(index); else selectedStars.add(index);
    item.classList.toggle('pe-selected', selectedStars.has(index)); item.setAttribute('aria-pressed', String(selectedStars.has(index)));
    if (![0, 1, 2].every(value => selectedStars.has(value))) return;
    try { await discover('constellation'); if (!still()) petals(false, 9); } catch (error) { announce(apiMessage(error)); }
  }
  function ensureEffects() {
    if (!effectsHost) { effectsHost = node('div', 'pe-effects'); effectsHost.id = 'papoEventEffects'; effectsHost.setAttribute('aria-hidden', 'true'); document.body.append(effectsHost); }
    applyColors(effectsHost); return effectsHost;
  }
  function effect(item, duration) {
    if (!active() || !eggs() || disposed) return;
    ensureEffects().append(item); effects.add(item);
    const timer = later(() => { item.remove(); effects.delete(item); effectTimers.delete(timer); }, duration); effectTimers.add(timer);
  }
  function clearEffects() { for (const item of effects) item.remove(); effects.clear(); for (const id of effectTimers) cancel(id); effectTimers.clear(); }
  function canEffect(kind, delay = 6000) {
    if (!active() || !eggs()) return false;
    const current = performance.now(), previous = effectAt.get(kind);
    if (previous !== undefined && current - previous < delay) return false;
    effectAt.set(kind, current); return true;
  }
  function petals(gold = false, count = 18) {
    if (still() || !eggs() || !feature('decorations') || config().decorations?.petals === false) return;
    for (let index = 0; index < count; index++) {
      const item = node('i', `pe-falling-petal${gold ? ' pe-gold-petal' : ''}`);
      item.style.left = `${(index * 47) % 100}%`; item.style.setProperty('--petal-delay', `${index * .08}s`); item.style.setProperty('--petal-drift', `${index % 2 ? -60 : 80}px`); effect(item, 5700);
    }
  }
  function effectMessage(text, className = '') {
    const message = node('div', `pe-effect-message ${className}`, text); effect(message, 5500);
  }
  function clickHeart() {
    if (!active() || !feature('heart') || !eggs()) return;
    const now = performance.now(); if (now - heartAt > 2200) heartClicks = 0;
    heartAt = now; heartClicks++;
    if (heartClicks < 3) return; heartClicks = 0;
    if (!canEffect('heart')) return;
    discover('heart').then(() => {
      if (!active()) return;
      if (!still()) { const glow = node('div', 'pe-lilac-glow'); effect(glow, 5300); petals(); }
      const bloomNode = node('div', 'pe-heart-bloom'); bloomNode.innerHTML = blossom; effect(bloomNode, 5300);
      effectMessage(config().messages?.heart || '', 'pe-heart-message');
    }).catch(error => announce(apiMessage(error)));
  }
  function delivery() {
    if (!feature('delivery') || !canEffect('delivery', 8500)) return;
    discover('delivery').then(() => {
      if (!active()) return;
      const van = node('div', `pe-delivery${still() ? ' pe-delivery-still' : ''}`); const image = node('img'); image.src = still() ? '/kombi-flowers.svg#still' : '/kombi-flowers.svg'; image.alt = ''; van.append(image); effect(van, 6800);
      const timer = later(() => { effectTimers.delete(timer); effectMessage(config().messages?.delivery || '', 'pe-delivery-message'); }, still() ? 0 : 2000); effectTimers.add(timer);
    }).catch(error => announce(apiMessage(error)));
  }
  function showFinale() {
    if (!active() || !feature('finale') || !state.finaleAvailable) return;
    showLetter('A história continua', 'E se essa história fosse só o começo?', config().messages?.finale, 'finale');
  }
  function go(view) {
    activeView = view;
    const id = `pe${view[0].toUpperCase()}${view.slice(1)}`;
    panel?.querySelector(`#${id}`)?.scrollIntoView({ behavior: still() ? 'instant' : 'smooth', block: 'start' });
  }
  function handleClick(event) {
    const item = event.target.closest?.('[data-pe-action]');
    if (item && (panel?.contains(item) || letterPanel?.contains(item))) {
      const action = item.dataset.peAction;
      if (action === 'close') close(); else if (action === 'close-letter') closeLetter();
      else if (action === 'home' || action === 'garden' || action === 'letters') go(action);
      else if (action === 'flower') bloom(item); else if (action === 'letter') openLetter(Number(item.dataset.day));
      else if (action === 'special') special(); else if (action === 'star') chooseStar(item);
      else if (action === 'heart') clickHeart(); else if (action === 'delivery') delivery(); else if (action === 'finale') showFinale();
    } else if (event.target === letterPanel) closeLetter(); else if (event.target === panel) close();
  }
  function keyboard(event) {
    const dialog = letterPanel || panel; if (!dialog) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (letterPanel) closeLetter(); else close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(item => !item.disabled && !item.hidden && item.getClientRects().length);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
  function tick() { if (disposed) return; if (panel) updateCountdown(); later(tick, 10000); }
  function dispose() {
    if (disposed) return; close(); disposed = true;
    for (const controller of requests) controller.abort(); requests.clear();
    for (const id of timers) clearTimeout(id); timers.clear();
    for (const remove of listeners) remove(); listeners.length = 0;
    navigation?.remove(); heartButton?.remove(); adminButton?.remove(); effectsHost?.remove();
    document.documentElement.classList.remove('papo-event-active', 'pe-reduced');
    requestSequence++;
  }
  window.PapoEvent = { refresh, open, close, getState: () => state, applyState, dispose };
  loadPreferences();
  listen(document, 'click', handleClick);
  listen(document, 'keydown', keyboard, true);
  listen(document, 'papo:preferences-changed', event => loadPreferences(event.detail));
  listen(media, 'change', () => loadPreferences());
  listen(document, 'visibilitychange', () => { if (!document.hidden) refresh(); });
  listen(window, 'pagehide', dispose);
  // Authentication can complete after this deferred module was loaded.
  listen(document, 'papo:startup-ready', refresh);
  listen(document, 'papo:authenticated', refresh);
  refresh(); tick();
})();
