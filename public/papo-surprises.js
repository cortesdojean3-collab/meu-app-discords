(() => {
  'use strict';
  if (window.PapoSurprises) return;

  const preferenceKey = 'papo.extras.v1';
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = [], timers = new Set(), effects = new Set(), lastEffect = new Map();
  const messages = [
    'Até os dias nublados merecem flores.',
    'Que bom que você apareceu por aqui!',
    'Uma flor pequena também pode carregar muito carinho.',
    'Seu sorriso combina com este jardim.',
    'Às vezes, as coisas mais bonitas estão escondidas nos detalhes.'
  ];
  const flowerSvg = '<svg viewBox="0 0 80 112" aria-hidden="true"><path class="stem" d="M40 47Q36 72 40 105M39 79Q26 65 18 75M39 87Q53 71 62 79" fill="none" stroke="#81c99f" stroke-width="3" stroke-linecap="round"/><g class="flower-head"><path d="M40 43C23 42 17 24 28 22C33 10 48 10 51 23C64 22 64 38 50 44C54 57 43 64 36 54C24 58 18 44 30 40Z" fill="#c4a0e9" stroke="#f1deff" stroke-width="1.5"/><circle cx="40" cy="39" r="6" fill="#f5dfa0"/></g><path d="M39 79Q27 67 21 75Q28 83 39 79M40 88Q51 74 59 79Q51 89 40 88" fill="#7cba96"/></svg>';
  const flowerButtonSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12v10m0-5c-5-4-7-1-7-1 2 3 5 3 7 1" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 11C5 13 3 8 7 6 4 2 10 0 12 4c2-4 8-2 5 2 4 2 2 7-5 5Z" fill="#b998dd" fill-opacity=".75"/><circle cx="12" cy="7.5" r="2" fill="#dfcfab"/></svg>';
  const pixelFlower = '<svg viewBox="0 0 24 38" aria-hidden="true" shape-rendering="crispEdges"><path d="M11 15h3v22h-3zM5 24h7v3H5zM14 21h6v3h-6z" fill="#4d996c"/><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z" fill="currentColor"/><path d="M10 9h5v5h-5z" fill="#f4dca8"/></svg>';
  const heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S2 14 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 7-10 13-10 13Z"/></svg>';
  let preferences = {}, disposed = false, host = null, corner = null, gardenPanel = null;
  let gardenFocus = null, messageNode = null, messageTimer = 0, planted = 0, messageIndex = 0;
  let logoCount = 0, logoAt = 0;

  function loadPreferences(detail) {
    let saved = {};
    try { const parsed = JSON.parse(localStorage.getItem(preferenceKey) || '{}'); if (parsed && typeof parsed === 'object') saved = parsed; } catch {}
    preferences = { ...saved, ...(detail && typeof detail === 'object' ? detail : {}) };
  }
  function enabled() { return !disposed && preferences.extras !== false && preferences.easterEggs !== false; }
  function still() { return preferences.reduceMotion === true || preferences.animations === false || media.matches; }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }
  function later(fn, milliseconds) {
    const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, milliseconds);
    timers.add(id); return id;
  }
  function cancelTimer(id) { clearTimeout(id); timers.delete(id); }
  function ensureHost() {
    if (!host) {
      host = document.createElement('div'); host.id = 'papoSurprisesEffects'; host.setAttribute('aria-hidden', 'true');
      document.body.append(host);
    }
    host.classList.toggle('papo-surprises-still', still());
    return host;
  }
  function effect(node, duration) {
    ensureHost().append(node); effects.add(node);
    const timer = later(() => { node.remove(); effects.delete(node); }, duration);
    return { node, timer };
  }
  function canRun(kind, interval = 750) {
    if (!enabled()) return false;
    const now = Date.now(), previous = lastEffect.get(kind);
    if (previous !== undefined && now - previous < interval) return false;
    lastEffect.set(kind, now); return true;
  }
  function position(anchor) {
    const rect = anchor?.getBoundingClientRect?.();
    return { x: Math.max(40, Math.min(innerWidth - 40, rect ? rect.left + rect.width / 2 : innerWidth / 2)),
      y: Math.max(90, Math.min(innerHeight - 45, rect ? rect.top + rect.height / 2 : innerHeight * .62)) };
  }
  function message(text, className = '') {
    if (!enabled()) return;
    cancelTimer(messageTimer); messageNode?.remove();
    messageNode = document.createElement('div'); messageNode.id = 'papoSurpriseMessage';
    if (className) messageNode.classList.add(className);
    messageNode.classList.toggle('papo-surprises-still', still());
    messageNode.setAttribute('role', 'status'); messageNode.setAttribute('aria-live', 'polite');
    messageNode.textContent = text; document.body.append(messageNode);
    messageTimer = later(() => { messageNode?.remove(); messageNode = null; }, 4200);
  }
  function burst(at, count = 7) {
    if (still()) return;
    for (let i = 0; i < count; i++) {
      const petal = document.createElement('i'); petal.className = 'papo-surprise-petal burst';
      petal.style.left = `${at.x + (i - count / 2) * 4}px`; petal.style.top = `${at.y - 44}px`;
      petal.style.setProperty('--petal-drift', `${(i - (count - 1) / 2) * 15}px`);
      petal.style.setProperty('--fall-delay', `${i * .035}s`); effect(petal, 2200);
    }
  }
  function flower(anchor) {
    if (!canRun('flower')) return false;
    const at = position(anchor || corner?.querySelector('[data-papo-surprise="flower"]'));
    const bloom = document.createElement('div'); bloom.className = 'papo-surprise-bloom'; bloom.innerHTML = flowerSvg;
    bloom.style.left = `${at.x}px`; bloom.style.top = `${at.y}px`; effect(bloom, 2800); burst(at);
    message('Uma florzinha para deixar seu dia mais bonito. 🌸');
    const path = corner?.querySelector('.papo-garden-path'); if (path) path.hidden = false;
    return true;
  }
  function setGardenMessage(text) {
    const note = gardenPanel?.querySelector('.papo-garden-note'); if (note) note.textContent = text;
  }
  function closeGarden(restoreFocus = true) {
    if (!gardenPanel) return;
    const hadFocus = gardenPanel.contains(document.activeElement);
    gardenPanel.remove(); gardenPanel = null; planted = 0;
    if (restoreFocus && hadFocus && gardenFocus?.isConnected) gardenFocus.focus({ preventScroll: true });
    gardenFocus = null;
  }
  function plant() {
    if (!gardenPanel || !enabled()) return;
    const bed = gardenPanel.querySelector('.papo-garden-sprouts');
    if (planted >= 6) { bed.replaceChildren(); planted = 0; }
    const blossom = document.createElement('span'); blossom.innerHTML = pixelFlower;
    blossom.style.color = ['#b99cfa', '#f1dfff', '#dba3d5', '#c4b5ff', '#ebe5ff', '#c999f0'][planted];
    bed.append(blossom); planted++;
    gardenPanel.querySelector('.papo-garden-count').textContent = `${planted} ${planted === 1 ? 'flor plantada' : 'flores plantadas'}`;
    gardenPanel.querySelector('.papo-garden-plot').setAttribute('aria-label', 'Plantar mais uma flor');
    setGardenMessage(messages[messageIndex++ % messages.length]);
  }
  function garden(anchor) {
    if (!enabled()) return false;
    if (gardenPanel) { gardenPanel.querySelector('.papo-garden-close').focus(); return true; }
    gardenFocus = anchor?.focus ? anchor : document.activeElement;
    gardenPanel = document.createElement('section'); gardenPanel.className = 'papo-garden'; gardenPanel.id = 'papoSecretGarden';
    gardenPanel.classList.toggle('papo-surprises-still', still());
    gardenPanel.setAttribute('role', 'dialog'); gardenPanel.setAttribute('aria-modal', 'false');
    gardenPanel.setAttribute('aria-labelledby', 'papoGardenTitle');
    gardenPanel.innerHTML = '<header><div><p class="papo-garden-eyebrow">um cantinho só seu</p><h2 id="papoGardenTitle">Jardim secreto</h2></div><button class="papo-garden-close" type="button" aria-label="Fechar jardim">×</button></header><div class="papo-garden-view"><img class="papo-garden-scene" src="/papo-garden.svg" alt="Jardim em pixel art, com flores roxas, placas de madeira e vagalumes azulados"><button class="papo-garden-sign" type="button" aria-label="Descobrir uma mensagem no jardim">Cultive<br>bons encontros</button><button class="papo-garden-firefly" type="button" aria-label="Conversar com um vagalume"></button><div class="papo-garden-sprouts" aria-hidden="true"></div><button class="papo-garden-plot" type="button" aria-label="Plantar uma flor"></button></div><p class="papo-garden-note" role="status" aria-live="polite">Que bom que você apareceu por aqui! Toque no canteiro para plantar uma flor.</p><footer><span class="papo-garden-count">Seu pequeno jardim</span><button class="papo-garden-petals" type="button">Soprar pétalas</button></footer>';
    gardenPanel.querySelector('.papo-garden-close').addEventListener('click', () => closeGarden());
    gardenPanel.querySelector('.papo-garden-plot').addEventListener('click', plant);
    gardenPanel.querySelector('.papo-garden-sign').addEventListener('click', () => setGardenMessage(messages[messageIndex++ % messages.length]));
    gardenPanel.querySelector('.papo-garden-firefly').addEventListener('click', () => {
      if (!gardenPanel) return;
      gardenPanel.classList.toggle('lit');
      setGardenMessage(gardenPanel.classList.contains('lit') ? 'Mesmo uma luz pequenininha faz diferença. ✨' : 'Alguns encontros iluminam o caminho.');
    });
    gardenPanel.querySelector('.papo-garden-petals').addEventListener('click', () => petals());
    document.body.append(gardenPanel); gardenPanel.querySelector('.papo-garden-close').focus({ preventScroll: true });
    return true;
  }
  function delivery() {
    if (!canRun('delivery', 4700)) return false;
    const wrap = document.createElement('div'); wrap.className = 'papo-surprise-delivery';
    const image = document.createElement('img'); image.src = `/kombi-flowers.svg${still() ? '#still' : ''}`;
    image.alt = ''; wrap.append(image); effect(wrap, still() ? 3200 : 4900);
    if (still()) message('Entrega especial: um pouquinho de carinho para você! 💜', 'papo-delivery-message');
    else later(() => message('Entrega especial: um pouquinho de carinho para você! 💜', 'papo-delivery-message'), 3900);
    return true;
  }
  function petals() {
    if (!canRun('petals', 4200)) return false;
    message('Que o dia floresça nos pequenos detalhes. 🌸');
    if (still()) return true;
    for (let i = 0; i < 18; i++) {
      const petal = document.createElement('i'); petal.className = 'papo-surprise-petal';
      petal.style.left = `${(i + .5) / 18 * 100}%`; petal.style.top = '-15px';
      petal.style.setProperty('--petal-size', `${6 + i % 4}px`);
      petal.style.setProperty('--petal-drift', `${(i % 5 - 2) * 26}px`);
      petal.style.setProperty('--petal-spin', `${150 + i * 13}deg`);
      petal.style.setProperty('--fall-delay', `${(i % 7) * .13}s`);
      petal.style.setProperty('--fall-duration', `${3.2 + (i % 4) * .2}s`);
      petal.style.setProperty('--petal-color', ['#c5a1ef', '#edc7ed', '#e5dbf5'][i % 3]);
      effect(petal, 4900);
    }
    return true;
  }
  function secret(anchor) {
    if (!canRun('secret')) return false;
    const at = position(anchor), heart = document.createElement('div'); heart.className = 'papo-surprise-heart'; heart.innerHTML = heartSvg;
    heart.style.left = `${at.x}px`; heart.style.top = `${at.y}px`; effect(heart, 1700);
    message(messages[messageIndex++ % messages.length]); return true;
  }
  function clearEffects() {
    for (const timer of timers) clearTimeout(timer); timers.clear();
    for (const node of effects) node.remove(); effects.clear();
    messageNode?.remove(); messageNode = null; messageTimer = 0;
    host?.remove(); host = null; logoCount = 0; lastEffect.clear();
  }
  function syncPreferences(detail) {
    loadPreferences(detail);
    if (corner) corner.hidden = !enabled();
    if (!enabled()) { clearEffects(); closeGarden(); }
    else {
      host?.classList.toggle('papo-surprises-still', still());
      messageNode?.classList.toggle('papo-surprises-still', still());
      gardenPanel?.classList.toggle('papo-surprises-still', still());
      if (still()) {
        host?.querySelectorAll('.papo-surprise-petal').forEach(node => { node.remove(); effects.delete(node); });
        host?.querySelectorAll('.papo-surprise-delivery img').forEach(image => { image.src = '/kombi-flowers.svg#still'; });
      }
    }
  }
  function mountCorner() {
    if (disposed || corner) return;
    const side = document.querySelector('#side'), profile = document.querySelector('#me');
    if (!side) return;
    corner = document.createElement('div'); corner.className = 'papo-secret-corner'; corner.id = 'papoSecretCorner'; corner.hidden = !enabled();
    const blossom = document.createElement('button'); blossom.type = 'button'; blossom.dataset.papoSurprise = 'flower';
    blossom.title = 'Uma flor escondida'; blossom.setAttribute('aria-label', 'Descobrir uma flor escondida'); blossom.innerHTML = flowerButtonSvg;
    const path = document.createElement('button'); path.type = 'button'; path.className = 'papo-garden-path';
    path.dataset.papoSurprise = 'garden'; path.hidden = true; path.textContent = 'um caminho de flores…'; path.setAttribute('aria-label', 'Abrir jardim secreto');
    corner.append(path, blossom);
    if (profile?.parentNode === side) side.insertBefore(corner, profile); else side.append(corner);
  }
  const api = { flower, garden, delivery, petals, secret, dispose };
  function invoke(kind, anchor) { if (Object.hasOwn(api, kind) && kind !== 'dispose') return api[kind](anchor); return false; }
  function onClick(event) {
    if (!enabled() || !event.target?.closest || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const trigger = event.target.closest('[data-papo-surprise]');
    if (trigger) { if (!trigger.disabled) invoke(trigger.dataset.papoSurprise, trigger); return; }
    const logo = event.target.closest('#papoLogoSecret');
    if (!logo) return;
    const now = Date.now(); logoCount = now - logoAt < 1800 ? logoCount + 1 : 1; logoAt = now;
    if (logoCount >= 4) { logoCount = 0; secret(logo); }
  }
  function dispose() {
    if (disposed) return;
    clearEffects(); closeGarden(false); corner?.remove(); corner = null; disposed = true;
    for (const stop of listeners.splice(0)) stop();
    delete window.PapoSurprises;
  }
  loadPreferences();
  window.PapoSurprises = Object.freeze(api);
  listen(document, 'click', onClick);
  listen(document, 'papo:surprise', event => invoke(event.detail?.kind, event.detail?.anchor));
  listen(document, 'papo:preferences-changed', event => syncPreferences(event.detail));
  listen(window, 'storage', event => { if (event.key === preferenceKey) syncPreferences(); });
  listen(document, 'keydown', event => {
    if (event.key === 'Escape' && gardenPanel?.contains(document.activeElement)) { closeGarden(); event.preventDefault(); }
  });
  listen(document, 'visibilitychange', () => { if (document.hidden) clearEffects(); });
  listen(window, 'pagehide', dispose);
  if (media.addEventListener) listen(media, 'change', () => syncPreferences());
  if (document.readyState === 'loading') listen(document, 'DOMContentLoaded', mountCorner, { once: true });
  else mountCorner();
})();
