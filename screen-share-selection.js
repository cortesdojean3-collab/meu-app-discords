'use strict';

const SOURCE_OPTIONS = Object.freeze({
  types: ['screen', 'window'],
  thumbnailSize: { width: 320, height: 180 },
  fetchWindowIcons: true
});

function pickerEntry(source) {
  const id = typeof source?.id === 'string' ? source.id : '';
  if (!id) return null;
  const image = value => {
    try { return value?.isEmpty?.() ? '' : value?.toDataURL?.() || ''; }
    catch (error) { console.warn('[papo] Prévia de uma fonte de compartilhamento indisponível:', error.message); return ''; }
  };
  return {
    id,
    name: String(source.name || '').trim() || 'Janela sem título',
    screen: id.startsWith('screen:'),
    thumb: image(source.thumbnail),
    icon: image(source.appIcon)
  };
}

function createScreenShareSelection({ desktopCapturer, platform = process.platform, logger = () => {} }) {
  if (!desktopCapturer || typeof desktopCapturer.getSources !== 'function') {
    throw new TypeError('desktopCapturer.getSources is required');
  }

  function open({ audioRequested = false } = {}, callback) {
    if (typeof callback !== 'function') throw new TypeError('A media callback is required');
    let active = true;
    let offered = new Set();
    let listing = null;

    const finish = streams => {
      if (!active) return false;
      active = false;
      try { callback(streams); }
      catch (error) { logger('callback', error); }
      return true;
    };

    const list = async () => {
      if (!active) return { ok: false, sources: [], error: 'Este seletor já foi encerrado.' };
      if (listing) return listing;
      listing = (async () => {
        try {
          const sources = await desktopCapturer.getSources(SOURCE_OPTIONS);
          if (!active) return { ok: false, sources: [], error: 'Este seletor já foi encerrado.' };
          if (!Array.isArray(sources)) throw new TypeError('Electron returned an invalid source list');
          offered = new Set(sources.map(source => typeof source?.id === 'string' ? source.id : '').filter(Boolean));
          const entries = sources.map(pickerEntry).filter(Boolean).sort((a, b) => Number(b.screen) - Number(a.screen) || a.name.localeCompare(b.name, 'pt-BR'));
          return { ok: true, sources: entries, error: '' };
        } catch (error) {
          logger('list', error);
          return { ok: false, sources: [], error: 'Não consegui consultar as fontes. Tente atualizar a lista.' };
        } finally { listing = null; }
      })();
      return listing;
    };

    const choose = async id => {
      if (!active) return { ok: false, error: 'Este seletor já foi encerrado.' };
      if (id === null) { finish(null); return { ok: true, cancelled: true }; }
      if (typeof id !== 'string' || !offered.has(id)) {
        return { ok: false, retry: true, error: 'Essa fonte não está mais na lista. Atualize e escolha novamente.' };
      }
      try {
        if (listing) await listing;
        const sources = await desktopCapturer.getSources(SOURCE_OPTIONS);
        const source = Array.isArray(sources) ? sources.find(item => item?.id === id) : null;
        if (!source) return { ok: false, retry: true, error: 'A janela ou o monitor foi fechado ou ficou indisponível. Atualize a lista.' };
        const streams = { video: source };
        if (audioRequested && platform === 'win32') streams.audio = 'loopback';
        if (finish(streams)) return { ok: true, cancelled: false };
        return { ok: false, error: 'A solicitação de compartilhamento já foi encerrada.' };
      } catch (error) {
        logger('choose', error);
        return { ok: false, retry: true, error: 'A fonte não pôde ser verificada. Tente atualizar a lista.' };
      }
    };

    return { list, choose, cancel: () => finish(null), get active() { return active; } };
  }

  return { open };
}

module.exports = { createScreenShareSelection, SOURCE_OPTIONS, pickerEntry };
