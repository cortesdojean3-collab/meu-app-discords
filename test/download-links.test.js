const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const downloadsHtml = fs.readFileSync(path.join(root, 'public/downloads.html'), 'utf8');
const appHtml = fs.readFileSync(path.join(root, 'public/app.html'), 'utf8');
const sourcePages = { 'public/app.html': appHtml, 'public/index.html': indexHtml, 'public/downloads.html': downloadsHtml };

function landingDownloadsScript() {
  const match = indexHtml.match(/const installerNames=[\s\S]*?(?=<\/script>)/);
  assert.ok(match, 'landing page should include its installer availability logic');
  return match[0];
}

function fakeLink(id) {
  const classes = new Set();
  const small = { textContent: '' };
  return {
    id,
    href: `/downloads/Papo-${id === 'win' ? 'win.exe' : id === 'mac' ? 'mac.dmg' : 'linux.AppImage'}`,
    rel: '',
    onclick: null,
    small,
    classes,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    removeAttribute(name) { if (name === 'href') this.href = ''; },
    querySelector(selector) { return selector === 'small' ? small : null; }
  };
}

async function runLandingDownloads(data) {
  const links = Object.fromEntries(['win', 'mac', 'linux'].map(key => [key, fakeLink(key)]));
  const hint = { style: {}, textContent: '' };
  const document = { getElementById(id) { return links[id] || (id === 'hint' ? hint : null); } };
  const fetch = async () => ({ ok: true, json: async () => data });
  vm.runInNewContext(landingDownloadsScript(), { document, fetch, URL, encodeURIComponent, Promise });
  await new Promise(resolve => setImmediate(resolve));
  return { links, hint };
}

test('profile summary puts the name above the unchanged controls and truncates long names', () => {
  assert.match(appHtml, /#me\{[^}]*display:grid[^}]*grid-template-areas:"avatar name" "controls controls"/);
  assert.match(appHtml, /#mename\{[^}]*overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(appHtml, /<div id="me-controls">[\s\S]*?<\/div><\/div><\/div>/);
  for (const id of ['bm', 'bd', 'bset', 'bp']) assert.match(appHtml, new RegExp(`id="${id}"`));
});

test('inline scripts on the changed pages remain valid JavaScript', () => {
  for (const [file, html] of Object.entries(sourcePages)) {
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      if (script.trim()) assert.doesNotThrow(() => new Function(script), `${file} contains valid inline JavaScript`);
    }
  }
});

test('landing download links use the exact published GitHub assets from the API', async () => {
  const assets = Object.fromEntries(['win', 'mac', 'linux'].map(key => [key, {
    url: `https://github.com/cortesdojean3-collab/meu-app-discords/releases/download/v1.0.0-build.3/Papo-${key}.${key === 'win' ? 'exe' : key === 'mac' ? 'dmg' : 'AppImage'}`
  }]));
  const { links } = await runLandingDownloads({ lookupOk: true, win: true, mac: true, linux: true, assets });
  for (const key of ['win', 'mac', 'linux']) {
    assert.equal(links[key].href, assets[key].url);
    assert.equal(links[key].rel, 'noreferrer');
    assert.equal(links[key].classes.has('off'), false);
  }
});

test('landing page disables platforms whose installer is not published', async () => {
  const { links, hint } = await runLandingDownloads({ lookupOk: true, win: false, mac: false, linux: false, assets: {} });
  for (const key of ['win', 'mac', 'linux']) {
    assert.equal(links[key].href, '');
    assert.equal(links[key].classes.has('off'), true);
    assert.equal(links[key].small.textContent, 'ainda não publicado');
  }
  assert.match(hint.textContent, /instaladores ainda não foram publicados/);
});

test('downloads page prefers verified release URLs and keeps a local-file fallback', () => {
  assert.match(downloadsHtml, /function isReleaseAsset\(url\)/);
  assert.match(downloadsHtml, /a\.href=direct\?asset\.url:`\/downloads\/\$\{encodeURIComponent\(installerNames\[key\]\)\}`/);
  assert.match(downloadsHtml, /if\(!data\.lookupOk&&!anyAvailable\)throw/);
});
